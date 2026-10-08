// Menü içe aktarma (yapay zekâ): dosyaları hazırlar, importMenu fonksiyonunu çağırır,
// dönen menüyü paneldeki kategori/ürün yapısına çevirir. Fonksiyon: firebase/menu-functions.

import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { newCategoryId, newItemId } from "./firestore";
import type { Allergen, DietTag, Ingredient, MenuCategory, MenuItem, VariantGroup } from "./types";

/** Fonksiyonun döndürdüğü yapı (firebase/menu-functions/extract.js MENU_SCHEMA). */
export type ImportedMenu = {
  categories: {
    name: string;
    nameEn: string | null;
    description: string | null;
    servedFrom: string | null;
    servedTo: string | null;
    items: {
      name: string;
      nameEn: string | null;
      description: string | null;
      price: number | null;
      sizes: { name: string; price: number }[];
      portion: string | null;
      calories: number | null;
      ingredients: { name: string; allergens: Allergen[]; alcohol: boolean; pork: boolean }[];
      dietTags: DietTag[];
    }[];
  }[];
  notes: string[];
};

type ImportFile = { mediaType: string; data: string };
type ImportResult = { menu: ImportedMenu; stats: { categories: number; items: number; seconds: number } };

export const ACCEPTED_FILES = "application/pdf,image/jpeg,image/png,image/webp";
export const MAX_FILES = 10;
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_SIDE = 2000;

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/** Telefon fotoğrafları çok büyük olabilir: uzun kenarı 2000 px'e indirip JPEG'e çevirir. */
async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`"${file.name}" açılamadı. JPG veya PNG olarak yükleyin.`);
  });
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024 && file.type !== "image/webp") {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Görsel işlenemedi."))), "image/jpeg", 0.85),
  );
}

async function prepareFiles(files: File[]): Promise<ImportFile[]> {
  return Promise.all(
    files.map(async (file) => {
      if (file.type === "application/pdf") {
        if (file.size > MAX_PDF_BYTES) throw new Error(`"${file.name}" çok büyük (en fazla 12 MB).`);
        return { mediaType: "application/pdf", data: await toBase64(file) };
      }
      const blob = await shrinkImage(file);
      return { mediaType: blob === file ? file.type : "image/jpeg", data: await toBase64(blob) };
    }),
  );
}

const importMenuFn = httpsCallable<{ cafeId: string; files?: ImportFile[]; url?: string }, ImportResult>(functions, "importMenu", {
  timeout: 9 * 60 * 1000,
});

/** Menüyü okur (30 sn – 3 dk sürebilir). Firestore'a yazmaz. */
export async function readMenu(cafeId: string, source: { files: File[] } | { url: string }): Promise<ImportResult> {
  try {
    const payload = "url" in source ? { cafeId, url: source.url } : { cafeId, files: await prepareFiles(source.files) };
    const res = await importMenuFn(payload);
    return res.data;
  } catch (err) {
    // Fonksiyonun Türkçe hata mesajları olduğu gibi gösterilir.
    const message = err instanceof Error ? err.message : "";
    throw new Error(message && !/^internal$/i.test(message) ? message : "Menü okunamadı. Biraz sonra tekrar deneyin.");
  }
}

const HHMM = /^\d{2}:\d{2}$/;

/**
 * Okunan menüyü panel kayıtlarına çevirir. Alerjenler yapay zekâ önerisi olduğu için
 * allergensConfirmed: false işaretlenir; işletme ürün formunda onaylar.
 * visible: menü yayındaysa ürünler gizli eklenir, kontrol edilip açılır.
 */
export function toMenuRecords(
  menu: ImportedMenu,
  cafeId: string,
  { startOrder, visible }: { startOrder: number; visible: boolean },
): { categories: MenuCategory[]; items: MenuItem[] } {
  const categories: MenuCategory[] = [];
  const items: MenuItem[] = [];
  menu.categories.forEach((c, ci) => {
    const categoryId = newCategoryId(cafeId);
    categories.push({
      id: categoryId,
      name: { tr: c.name, ...(c.nameEn ? { en: c.nameEn } : {}) },
      ...(c.description ? { description: { tr: c.description } } : {}),
      sortOrder: startOrder + ci,
      ...(c.servedFrom && c.servedTo && HHMM.test(c.servedFrom) && HHMM.test(c.servedTo)
        ? { servedBetween: { open: c.servedFrom, close: c.servedTo } }
        : {}),
    });
    c.items.forEach((i, ii) => {
      const sizes = [...i.sizes].sort((a, b) => a.price - b.price);
      const base = sizes.length ? sizes[0].price : (i.price ?? 0);
      const variants: VariantGroup[] = sizes.length > 1
        ? [
            {
              id: "size",
              name: { tr: "Boy", en: "Size" },
              selection: "single",
              options: sizes.map((s, si) => ({ id: `s${si + 1}`, name: { tr: s.name }, priceDelta: Math.round((s.price - base) * 100) / 100 })),
            },
          ]
        : [];
      const ingredients: Ingredient[] = i.ingredients.map((g) => ({
        name: { tr: g.name },
        ...(g.allergens.length ? { allergens: g.allergens } : {}),
        ...(g.alcohol ? { alcohol: true } : {}),
        ...(g.pork ? { pork: true } : {}),
      }));
      items.push({
        id: newItemId(cafeId),
        categoryId,
        name: { tr: i.name, ...(i.nameEn ? { en: i.nameEn } : {}) },
        ...(i.description ? { description: { tr: i.description } } : {}),
        price: base,
        ...(!sizes.length && i.price === null ? { priceNeedsReview: true } : {}),
        ingredients,
        ...(variants.length ? { variants } : {}),
        ...(i.dietTags.length ? { dietTags: i.dietTags } : {}),
        ...(i.portion ? { portion: i.portion } : {}),
        ...(i.calories !== null ? { calories: i.calories } : {}),
        allergensConfirmed: false,
        isAvailable: true,
        isVisible: visible && (sizes.length > 0 || i.price !== null),
        sortOrder: ii,
      });
    });
  });
  return { categories, items };
}
