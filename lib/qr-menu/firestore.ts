import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import type { QrStyle } from "./qr-style";
import { DEFAULT_SETTINGS, type MenuCategory, type MenuItem, type MenuLayout, type QrMenuSettings } from "./types";
import { validateProduct } from "./product-tools";
import type { PreviewData } from "@/components/qr-menu/menu-preview";

// Firestore `undefined` alanları kabul etmez; formdan gelen boş opsiyonel alanları temizler.
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (v === "" ? undefined : v)));
}

const categoriesCol = (cafeId: string) => collection(db, "cafes", cafeId, "menuCategories");
const itemsCol = (cafeId: string) => collection(db, "cafes", cafeId, "menuItems");

export const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });

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
const RESERVED_SLUGS = new Set(["ornek", "api", "designs", "preview", "menu-bulunamadi"]);

export const isValidSlug = (s: string) =>
  /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length >= 3 && s.length <= 48 && !RESERVED_SLUGS.has(s);

export type LoadedMenu = {
  previewCafe: PreviewData["cafe"];
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
  const cafeData = cafeSnap.data();
  const location = cafeData?.location as { latitude?: number; longitude?: number } | undefined;
  return {
    previewCafe: { id: cafeId, name: cafeName, qrMenu: stored ?? { ...DEFAULT_SETTINGS, slug: slugify(cafeName) }, address: cafeData?.address, instagramUrl: cafeData?.instagramUrl, workingHours: cafeData?.workingHours, location: location?.latitude !== undefined && location?.longitude !== undefined ? { lat: location.latitude, lng: location.longitude } : undefined, loyaltyCards: (cafeData?.loyaltyCards ?? []).map((card: { id: string; itemTypeId: string; rewardBuy: number; rewardGift: number }) => ({ id: card.id, itemTypeId: card.itemTypeId, rewardBuy: card.rewardBuy, rewardGift: card.rewardGift })) },
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
export async function saveSettings(cafeId: string, settings: QrMenuSettings, pending?: { categories: MenuCategory[]; items: MenuItem[] }, media?: { logoUrl?: string; heroImage?: string }): Promise<void> {
  if (!isValidSlug(settings.slug)) {
    throw new Error("Link adı en az 3 karakter olmalı; sadece küçük harf, rakam ve tire içerebilir.");
  }
  const slugRef = doc(db, "menuSlugs", settings.slug);
  if ((pending?.categories.length ?? 0) + (pending?.items.length ?? 0) > 450) throw new Error("Tek işlemde en fazla 450 kategori ve ürün seçin.");
  for (const item of pending?.items ?? []) {
    const error = validateProduct(item);
    if (error) throw new Error(`${item.name.tr}: ${error}`);
  }
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(slugRef);
    if (existing.exists() && existing.data().cafeId !== cafeId) throw new Error(`"${settings.slug}" başka bir işletme tarafından kullanılıyor.`);
    if (!existing.exists()) transaction.set(slugRef, { cafeId, createdAt: serverTimestamp() });
    transaction.update(doc(db, "cafes", cafeId), { qrMenu: clean(settings), ...media, updatedAt: serverTimestamp() });
    for (const { id, ...data } of pending?.categories ?? []) transaction.set(doc(categoriesCol(cafeId), id), clean(data));
    for (const { id, ...data } of pending?.items ?? []) transaction.set(doc(itemsCol(cafeId), id), clean(data));
  });
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

/** Menüdeki damga kartı şablonu ve logo zemini (kaydedildiği an menüye yansır). */
export async function saveBrandingSettings(
  cafeId: string,
  patch: Partial<Pick<QrMenuSettings, "loyaltyCardStyle" | "logoBackground">>,
): Promise<void> {
  await updateDoc(doc(db, "cafes", cafeId), Object.fromEntries(Object.entries(patch).map(([k, v]) => [`qrMenu.${k}`, v])));
}

/** Logonun açık renkli olup olmadığı (otomatik algılama sonucu). */
export async function saveLogoCheck(cafeId: string, logoUrl: string, isLight: boolean): Promise<void> {
  await updateDoc(doc(db, "cafes", cafeId), { "qrMenu.logoIsLight": isLight, "qrMenu.logoCheckedFor": logoUrl });
}

/** Kurulum listesinin "Yayına al" adımı: sadece yayın durumunu değiştirir. */
export async function setMenuEnabled(cafeId: string, enabled: boolean): Promise<void> {
  if (enabled) {
    const snapshot = await getDocs(itemsCol(cafeId));
    if (!snapshot.docs.some((d) => d.data().isVisible === true && d.data().priceNeedsReview !== true)) throw new Error("Yayınlamak için fiyatı kontrol edilmiş en az bir görünür ürün ekleyin.");
  }
  await updateDoc(doc(db, "cafes", cafeId), { "qrMenu.enabled": enabled, updatedAt: serverTimestamp() });
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
  const error = validateProduct(item);
  if (error) throw new Error(error);
  const { id, ...data } = item;
  await setDoc(doc(itemsCol(cafeId), id), clean(data));
}

export async function patchItem(cafeId: string, itemId: string, patch: Partial<Pick<MenuItem, "isAvailable" | "isVisible" | "price" | "priceNeedsReview">>) {
  await updateDoc(doc(itemsCol(cafeId), itemId), patch);
}

export async function deleteItem(cafeId: string, itemId: string): Promise<void> {
  await deleteDoc(doc(itemsCol(cafeId), itemId));
}

/** Birden çok ürünü tek seferde kaydeder (Kalori Asistanı). */
export const saveItems = (cafeId: string, items: MenuItem[]) => saveImportedMenu(cafeId, [], items);

/** İçe aktarılan menüyü toplu yazar (Firestore toplu yazma sınırı için parça parça). */
export async function saveImportedMenu(cafeId: string, categories: MenuCategory[], items: MenuItem[]): Promise<void> {
  for (const item of items) {
    const error = validateProduct(item);
    if (error) throw new Error(`${item.name.tr}: ${error}`);
  }
  const writes = [
    ...categories.map(({ id, ...data }) => ({ ref: doc(categoriesCol(cafeId), id), data })),
    ...items.map(({ id, ...data }) => ({ ref: doc(itemsCol(cafeId), id), data })),
  ];
  if (writes.length > 450) throw new Error("Tek işlemde en fazla 450 kategori ve ürün kaydedilebilir. Daha küçük bir seçim yapın.");
  const batch = writeBatch(db);
  for (const w of writes) batch.set(w.ref, clean(w.data));
  await batch.commit();
}

/** Durum değişiklikleri tek işlemde tamamlanır. */
export async function patchItems(cafeId: string, ids: string[], patch: Partial<Pick<MenuItem, "isAvailable" | "isVisible">>): Promise<void> {
  if (ids.length > 450) throw new Error("Bir seferde en fazla 450 ürün seçin.");
  const batch = writeBatch(db);
  for (const id of ids) batch.update(doc(itemsCol(cafeId), id), patch);
  await batch.commit();
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

export async function uploadMenuBranding(cafeId: string, file: File, field: "logoUrl" | "heroImage"): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) throw new Error("JPG, PNG veya WEBP seçin (en fazla 3 MB).");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const target = ref(storage, `cafes/${cafeId}/qrmenu_${field}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`);
  await uploadBytes(target, file, { contentType: file.type });
  return getDownloadURL(target);
}
