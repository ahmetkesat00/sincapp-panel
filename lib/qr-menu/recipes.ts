// Kalori Asistanı: suggestRecipes fonksiyonunu çağırır, reçeteden kalori ve içindekiler üretir.
// Malzeme değerleri: firebase/menu-functions/ingredients.json (USDA FoodData Central, CC0).
// Kaloriyi yapay zekâ değil bu tablo hesaplar; işletme gramajı değiştirince anında yeniden hesaplanır.

import { httpsCallable } from "firebase/functions";
import catalog from "@/firebase/menu-functions/ingredients.json";
import { functions } from "@/lib/firebase";
import { today } from "./firestore";
import type { Allergen, Ingredient, MenuItem, RecipeLine, VariantOption } from "./types";

export type CatalogIngredient = {
  id: string;
  tr: string;
  en: string;
  group: string;
  unit: "g" | "ml";
  /** 100 g ya da 100 ml başına kcal. */
  kcal: number;
  fdcId: number;
  fdcName: string;
  allergens?: Allergen[];
  alcohol?: boolean;
  pork?: boolean;
};

export const INGREDIENT_CATALOG = catalog as CatalogIngredient[];
export const INGREDIENT_BY_ID = new Map(INGREDIENT_CATALOG.map((i) => [i.id, i]));

export const INGREDIENT_GROUPS: { id: string; label: string }[] = [
  { id: "base", label: "Kahve, çay ve içecekler" },
  { id: "dairy", label: "Süt ürünleri ve bitkisel sütler" },
  { id: "sweet", label: "Tatlandırıcı, sos ve çikolata" },
  { id: "grain", label: "Un, ekmek ve tahıllar" },
  { id: "protein", label: "Yumurta, et ve balık" },
  { id: "produce", label: "Sebze, meyve ve baklagiller" },
  { id: "nuts", label: "Kuruyemiş ve tohumlar" },
  { id: "condiment", label: "Yağ, sos ve baharat" },
  { id: "alcohol", label: "Alkollü içecekler" },
];

export const USDA_SOURCE_URL = "https://fdc.nal.usda.gov/";

export const lineKcal = (l: RecipeLine) => ((INGREDIENT_BY_ID.get(l.ingredientId)?.kcal ?? 0) * l.amount) / 100;
export const recipeKcal = (lines: RecipeLine[]) => Math.round(lines.reduce((s, l) => s + lineKcal(l), 0));

export type RecipeSuggestion = {
  itemId: string;
  portion: string | null;
  confidence: "high" | "medium" | "low";
  note: string | null;
  recipe: RecipeLine[];
  options: { optionId: string; portion: string | null; changes: RecipeLine[] }[];
};

/** Fonksiyonun tek çağrıda kabul ettiği ürün sayısı (firebase/menu-functions RECIPE_BATCH). */
export const RECIPE_BATCH = 25;

const suggestFn = httpsCallable<{ cafeId: string; itemIds: string[] }, { results: RecipeSuggestion[] }>(functions, "suggestRecipes", {
  timeout: 5 * 60 * 1000,
});

export async function requestRecipes(cafeId: string, itemIds: string[]): Promise<RecipeSuggestion[]> {
  try {
    return (await suggestFn({ cafeId, itemIds })).data.results;
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    throw new Error(message && !/^internal$/i.test(message) ? message : "Reçeteler hazırlanamadı. Biraz sonra tekrar deneyin.");
  }
}

/** Üründe eksik olanlar. Yapay zekâyla içe aktarılmış, onaylanmamış içindekiler eksik sayılır. */
export function itemNeeds(item: MenuItem) {
  return {
    calories: item.calories === undefined,
    ingredients: item.ingredients.length === 0 || item.allergensConfirmed === false,
  };
}

/** Reçete satırının kimliği: aynı katalog malzemesi farklı adlarla (Manyas / tulum peyniri) ayrı satır olabilir. */
const keyOf = (l: Pick<RecipeLine, "ingredientId" | "label">) => `${l.ingredientId}|${l.label ?? ""}`;
const lineOfKey = (key: string): Pick<RecipeLine, "ingredientId" | "label"> => {
  const [ingredientId, label] = key.split("|");
  return label ? { ingredientId, label } : { ingredientId };
};

export const lineName = (l: Pick<RecipeLine, "ingredientId" | "label">) => l.label || INGREDIENT_BY_ID.get(l.ingredientId)?.tr || l.ingredientId;

const toIngredient = (key: string): Ingredient | null => {
  const l = lineOfKey(key);
  const c = INGREDIENT_BY_ID.get(l.ingredientId);
  if (!c) return null;
  return {
    name: l.label ? { tr: l.label } : { tr: c.tr, en: c.en },
    ...(c.allergens?.length ? { allergens: c.allergens } : {}),
    ...(c.alcohol ? { alcohol: true } : {}),
    ...(c.pork ? { pork: true } : {}),
  };
};

/** İçindekiler listesi: miktara göre azalan sırada (yönetmelikteki sıra). */
const ingredientList = (entries: [string, number][]) =>
  entries
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => toIngredient(key))
    .filter((i): i is Ingredient => i !== null);

const fmtAmount = (l: RecipeLine) => `${lineName(l)} ${l.amount} ${INGREDIENT_BY_ID.get(l.ingredientId)?.unit ?? ""}`;
export const recipeText = (lines: RecipeLine[]) => lines.map(fmtAmount).join(", ");

export type RecipeDraft = {
  portion: string;
  recipe: RecipeLine[];
  /** optionId → temel reçeteye göre fark. */
  options: Record<string, { portion: string; changes: RecipeLine[] }>;
};

/** Satırları anahtara göre toplar (aynı malzeme iki kez yazıldıysa tek satır). */
function sumByKey(lines: RecipeLine[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) m.set(keyOf(l), (m.get(keyOf(l)) ?? 0) + l.amount);
  return m;
}

/**
 * Onaylanan reçeteyi ürüne uygular.
 * - Tekli gruplarda bir seçenek bir malzemeyi tamamen çıkarıyorsa (süt → yulaf sütü) o malzeme
 *   temel içindekilerden alınıp seçeneklere dağıtılır; menü sitesi seçilen seçeneğin bileşenlerini ekler.
 * - write.ingredients / write.calories false ise o alanlara (ve seçeneklerdeki karşılıklarına) dokunulmaz.
 */
export function applyRecipe(item: MenuItem, draft: RecipeDraft, write: { ingredients: boolean; calories: boolean; portion: boolean }): MenuItem {
  const recipe = draft.recipe.filter((l) => l.amount > 0);
  const base = sumByKey(recipe);
  // Seçenek farkı temeldeki bir malzemeyi adsız yazdıysa (ör. "beyaz_peynir -40") temeldeki adlı satıra bağla.
  const deltaOf = (o: VariantOption): RecipeLine[] =>
    (draft.options[o.id]?.changes ?? []).map((l) => {
      if (base.has(keyOf(l))) return l;
      const same = recipe.find((r) => r.ingredientId === l.ingredientId);
      return same ? { ...l, label: same.label } : l;
    });
  const amountWith = (o: VariantOption, key: string) => (base.get(key) ?? 0) + (sumByKey(deltaOf(o)).get(key) ?? 0);

  // Tekli gruplarda seçeneğe bağlı malzemeler.
  const groupDependent = new Map<string, Set<string>>();
  for (const g of item.variants ?? []) {
    if (g.selection !== "single") continue;
    groupDependent.set(g.id, new Set([...base.keys()].filter((key) => g.options.some((o) => amountWith(o, key) <= 0))));
  }
  const moved = new Set([...groupDependent.values()].flatMap((s) => [...s]));

  const variants = item.variants?.map((g) => ({
    ...g,
    options: g.options.map((o) => {
      const changes = deltaOf(o);
      const dependent = [...(groupDependent.get(g.id) ?? [])].map((key) => [key, amountWith(o, key)] as [string, number]);
      const added = [...sumByKey(changes)].filter(([key, amount]) => amount > 0 && !base.has(key));
      const next: VariantOption = { ...o };
      delete next.recipeDelta;
      if (changes.length) next.recipeDelta = changes;
      if (write.ingredients) {
        const ings = ingredientList([...dependent, ...added]);
        delete next.ingredients;
        if (ings.length) next.ingredients = ings;
      }
      if (write.calories) {
        const delta = recipeKcal(changes);
        delete next.calorieDelta;
        if (delta !== 0) next.calorieDelta = delta;
      }
      const portion = draft.options[o.id]?.portion.trim();
      if (portion && (write.portion || !o.portion)) next.portion = portion;
      return next;
    }),
  }));

  const next: MenuItem = { ...item, recipe: [...base].map(([key, amount]) => ({ ...lineOfKey(key), amount })) };
  if (variants) next.variants = variants;
  if (write.ingredients) {
    next.ingredients = ingredientList([...base].filter(([key]) => !moved.has(key)));
    next.allergensConfirmed = true;
  }
  if (write.calories) {
    next.calories = recipeKcal(recipe);
    next.calorieInfo = { source: "usda_recipe", updatedAt: today(), note: recipeText(recipe) };
  }
  const portion = draft.portion.trim();
  if (portion && (write.portion || !item.portion)) next.portion = portion;
  return next;
}

/** Fonksiyon önerisini düzenlenebilir taslağa çevirir (seçeneği önerilmeyenler boş fark). */
export function toDraft(item: MenuItem, s: RecipeSuggestion | undefined): RecipeDraft {
  const options: RecipeDraft["options"] = {};
  for (const g of item.variants ?? []) {
    for (const o of g.options) {
      const found = s?.options.find((x) => x.optionId === o.id);
      options[o.id] = { portion: found?.portion ?? "", changes: found?.changes ?? [] };
    }
  }
  return { portion: s?.portion ?? item.portion ?? "", recipe: s?.recipe ?? [], options };
}
