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

const toIngredient = (id: string): Ingredient | null => {
  const c = INGREDIENT_BY_ID.get(id);
  if (!c) return null;
  return {
    name: { tr: c.tr, en: c.en },
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
    .map(([id]) => toIngredient(id))
    .filter((i): i is Ingredient => i !== null);

const fmtAmount = (l: RecipeLine) => `${INGREDIENT_BY_ID.get(l.ingredientId)?.tr ?? l.ingredientId} ${l.amount} ${INGREDIENT_BY_ID.get(l.ingredientId)?.unit ?? ""}`;
export const recipeText = (lines: RecipeLine[]) => lines.map(fmtAmount).join(", ");

export type RecipeDraft = {
  portion: string;
  recipe: RecipeLine[];
  /** optionId → temel reçeteye göre fark. */
  options: Record<string, { portion: string; changes: RecipeLine[] }>;
};

/**
 * Onaylanan reçeteyi ürüne uygular.
 * - Tekli gruplarda bir seçenek bir malzemeyi tamamen çıkarıyorsa (süt → yulaf sütü) o malzeme
 *   temel içindekilerden alınıp seçeneklere dağıtılır; menü sitesi seçilen seçeneğin bileşenlerini ekler.
 * - write.ingredients / write.calories false ise o alanlara (ve seçeneklerdeki karşılıklarına) dokunulmaz.
 */
export function applyRecipe(item: MenuItem, draft: RecipeDraft, write: { ingredients: boolean; calories: boolean; portion: boolean }): MenuItem {
  const base = new Map(draft.recipe.filter((l) => l.amount > 0).map((l) => [l.ingredientId, l.amount]));
  const deltaOf = (o: VariantOption) => draft.options[o.id]?.changes ?? [];
  const amountWith = (o: VariantOption, id: string) => (base.get(id) ?? 0) + deltaOf(o).filter((l) => l.ingredientId === id).reduce((s, l) => s + l.amount, 0);

  // Tekli gruplarda seçeneğe bağlı malzemeler.
  const groupDependent = new Map<string, Set<string>>();
  for (const g of item.variants ?? []) {
    if (g.selection !== "single") continue;
    const ids = new Set([...base.keys()].filter((id) => g.options.some((o) => amountWith(o, id) <= 0)));
    groupDependent.set(g.id, ids);
  }
  const moved = new Set([...groupDependent.values()].flatMap((s) => [...s]));

  const variants = item.variants?.map((g) => ({
    ...g,
    options: g.options.map((o) => {
      const changes = deltaOf(o);
      const dependent = [...(groupDependent.get(g.id) ?? [])].map((id) => [id, amountWith(o, id)] as [string, number]);
      const added = changes.filter((l) => l.amount > 0 && !base.has(l.ingredientId)).map((l) => [l.ingredientId, l.amount] as [string, number]);
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

  const next: MenuItem = { ...item, recipe: [...base].map(([ingredientId, amount]) => ({ ingredientId, amount })) };
  if (variants) next.variants = variants;
  if (write.ingredients) {
    next.ingredients = ingredientList([...base].filter(([id]) => !moved.has(id)));
    next.allergensConfirmed = true;
  }
  if (write.calories) {
    next.calories = recipeKcal(draft.recipe);
    next.calorieInfo = { source: "usda_recipe", updatedAt: today(), note: recipeText(draft.recipe) };
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
