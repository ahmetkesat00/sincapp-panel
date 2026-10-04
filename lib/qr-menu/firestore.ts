import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import type { QrStyle } from "./qr-style";
import { DEFAULT_SETTINGS, type MenuCategory, type MenuItem, type MenuLayout, type QrMenuSettings } from "./types";

// Firestore `undefined` alanları kabul etmez; formdan gelen boş opsiyonel alanları temizler.
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (v === "" ? undefined : v)));
}

const categoriesCol = (cafeId: string) => collection(db, "cafes", cafeId, "menuCategories");
const itemsCol = (cafeId: string) => collection(db, "cafes", cafeId, "menuItems");

export const today = () => new Date().toISOString().slice(0, 10);

/** "Kahve Durağı Moda" → "kahve-duragi-moda". Sadece a-z, 0-9 ve tire (QR ve URL dostu). */
export function slugify(input: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u" };
  return input
    .toLocaleLowerCase("tr")
    .replace(/[çğıİöşü]/g, (c) => map[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// Menü sitesinde sabit sayfalara ayrılmış adresler (/ornek: tasarım önizlemesindeki örnek menü, /q: basılı QR, /api).
const RESERVED_SLUGS = new Set(["ornek", "api", "designs"]);

export const isValidSlug = (s: string) =>
  /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length >= 3 && s.length <= 48 && !RESERVED_SLUGS.has(s);

export type LoadedMenu = {
  settings: QrMenuSettings;
  hasSettings: boolean;
  /** Masa kartlarında kullanılır. */
  logoUrl?: string;
  heroImage?: string;
  categories: MenuCategory[];
  items: MenuItem[];
};

export async function loadQrMenu(cafeId: string, cafeName: string): Promise<LoadedMenu> {
  const [cafeSnap, catSnap, itemSnap] = await Promise.all([
    getDoc(doc(db, "cafes", cafeId)),
    getDocs(categoriesCol(cafeId)),
    getDocs(itemsCol(cafeId)),
  ]);
  const stored = cafeSnap.data()?.qrMenu as QrMenuSettings | undefined;
  return {
    settings: stored ?? { ...DEFAULT_SETTINGS, slug: slugify(cafeName) },
    hasSettings: Boolean(stored),
    logoUrl: (cafeSnap.data()?.logoUrl as string | undefined) || undefined,
    heroImage: (cafeSnap.data()?.heroImage as string | undefined) || undefined,
    categories: catSnap.docs
      .map((d) => ({ ...(d.data() as Omit<MenuCategory, "id">), id: d.id }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
    items: itemSnap.docs
      .map((d) => ({ ...(d.data() as Omit<MenuItem, "id">), id: d.id }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

/**
 * Ayarları kaydeder ve slug'ı menuSlugs'a yazar. Eski slug kaydı silinmez:
 * menü sitesi eski linke gelen ziyaretçiyi güncel slug'a yönlendirir.
 */
export async function saveSettings(cafeId: string, settings: QrMenuSettings): Promise<void> {
  if (!isValidSlug(settings.slug)) {
    throw new Error("Link adı en az 3 karakter olmalı; sadece küçük harf, rakam ve tire içerebilir.");
  }
  const slugRef = doc(db, "menuSlugs", settings.slug);
  const existing = await getDoc(slugRef);
  if (existing.exists() && existing.data().cafeId !== cafeId) {
    throw new Error(`"${settings.slug}" başka bir işletme tarafından kullanılıyor.`);
  }
  if (!existing.exists()) {
    await setDoc(slugRef, { cafeId, createdAt: serverTimestamp() });
  }
  await updateDoc(doc(db, "cafes", cafeId), { qrMenu: clean(settings), updatedAt: serverTimestamp() });
}

// ─── Menü tasarımı: taslak → yayın ───
// Sadece ilgili qrMenu alanları güncellenir; ayarların geri kalanına dokunulmaz.

/** Seçilen tasarımı taslak olarak kaydeder (müşteriler hâlâ yayındakini görür). null: taslağı sil. */
export async function saveDesignDraft(cafeId: string, layout: MenuLayout | null): Promise<void> {
  await updateDoc(doc(db, "cafes", cafeId), { "qrMenu.layoutDraft": layout ?? deleteField() });
}

/** Tasarımı yayına alır ve taslağı temizler. */
export async function publishDesign(cafeId: string, layout: MenuLayout): Promise<void> {
  await updateDoc(doc(db, "cafes", cafeId), { "qrMenu.layout": layout, "qrMenu.layoutDraft": deleteField() });
}

/** Gece modu ayarları hemen yayına girer. defaultMode null: tasarımın varsayılanı. */
export async function saveDarkModeSettings(cafeId: string, darkToggle: boolean, defaultMode: "light" | "dark" | null): Promise<void> {
  await updateDoc(doc(db, "cafes", cafeId), {
    "qrMenu.darkToggle": darkToggle,
    "qrMenu.defaultMode": defaultMode ?? deleteField(),
  });
}

export async function saveQrStyle(cafeId: string, style: QrStyle): Promise<void> {
  await updateDoc(doc(db, "cafes", cafeId), { "qrMenu.qrStyle": style });
}

export async function touchPricesUpdatedAt(cafeId: string): Promise<string> {
  const date = today();
  await updateDoc(doc(db, "cafes", cafeId), { "qrMenu.pricesUpdatedAt": date });
  return date;
}

export function newCategoryId(cafeId: string) {
  return doc(categoriesCol(cafeId)).id;
}

export function newItemId(cafeId: string) {
  return doc(itemsCol(cafeId)).id;
}

export async function saveCategory(cafeId: string, category: MenuCategory): Promise<void> {
  const { id, ...data } = category;
  await setDoc(doc(categoriesCol(cafeId), id), clean(data));
}

export async function deleteCategory(cafeId: string, categoryId: string, itemIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  for (const itemId of itemIds) batch.delete(doc(itemsCol(cafeId), itemId));
  batch.delete(doc(categoriesCol(cafeId), categoryId));
  await batch.commit();
}

export async function saveItem(cafeId: string, item: MenuItem): Promise<void> {
  const { id, ...data } = item;
  await setDoc(doc(itemsCol(cafeId), id), clean(data));
}

export async function patchItem(cafeId: string, itemId: string, patch: Partial<Pick<MenuItem, "isAvailable" | "isVisible">>) {
  await updateDoc(doc(itemsCol(cafeId), itemId), patch);
}

export async function deleteItem(cafeId: string, itemId: string): Promise<void> {
  await deleteDoc(doc(itemsCol(cafeId), itemId));
}

/** Sıralamayı toplu günceller (yukarı/aşağı taşıma sonrası). */
export async function saveOrder(cafeId: string, kind: "menuCategories" | "menuItems", ids: string[]): Promise<void> {
  const batch = writeBatch(db);
  ids.forEach((id, index) => batch.update(doc(db, "cafes", cafeId, kind, id), { sortOrder: index }));
  await batch.commit();
}

/** Ürün görselini mevcut menü görselleriyle aynı Storage klasörüne yükler. */
export async function uploadItemImage(cafeId: string, file: Blob): Promise<string> {
  const storageRef = ref(storage, `cafes/${cafeId}/qrmenu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`);
  await uploadBytes(storageRef, file, { contentType: "image/jpeg" });
  return getDownloadURL(storageRef);
}
