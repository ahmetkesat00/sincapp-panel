import type { MenuItem } from "./types";

export const normalizeSearch = (value: string) => value.trim().toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export type ProductFilter = "all" | "hidden" | "soldOut" | "noPhoto" | "review" | "translation";

export function needsReview(item: MenuItem): boolean {
  return item.priceNeedsReview === true || item.allergensConfirmed === false || item.ingredients.length === 0 || item.calories === undefined || (item.calories !== undefined && !item.calorieInfo?.source);
}

export function matchesProduct(item: MenuItem, query: string, filter: ProductFilter): boolean {
  if (query && !normalizeSearch([item.name.tr, item.name.en, item.description?.tr].filter(Boolean).join(" ")).includes(normalizeSearch(query))) return false;
  switch (filter) {
    case "hidden": return !item.isVisible;
    case "soldOut": return !item.isAvailable;
    case "noPhoto": return !item.imageUrl;
    case "review": return needsReview(item);
    case "translation": return !item.name.en?.trim() || Boolean(item.description?.tr && !item.description.en?.trim());
    default: return true;
  }
}

export function validateProduct(item: MenuItem): string | null {
  if (!item.name.tr.trim()) return "Ürün adı zorunlu.";
  if (!item.categoryId) return "Kategori seçin.";
  if (!Number.isFinite(item.price) || item.price < 0) return "Geçerli bir fiyat girin.";
  if (item.isVisible && item.priceNeedsReview) return "Menüde göstermek için fiyatı kontrol edin.";
  if (item.calories !== undefined && (!Number.isFinite(item.calories) || item.calories < 0)) return "Geçerli bir kalori girin.";
  const ids = new Set<string>();
  for (const group of item.variants ?? []) {
    if (ids.has(group.id)) return "Aynı seçenek grubunu iki kez ekleyemezsiniz.";
    ids.add(group.id);
    if (!group.name.tr.trim() || !group.options.length) return "Seçenek gruplarının adını ve seçeneklerini tamamlayın.";
    if (group.selection === "single" && (group.options[0].priceDelta !== 0 || (group.options[0].calorieDelta ?? 0) !== 0)) return "Varsayılan seçeneğin fiyat ve kalori farkı 0 olmalı.";
    for (const option of group.options) {
      if (!option.name.tr.trim() || !Number.isFinite(option.priceDelta) || item.price + option.priceDelta < 0) return "Seçenek adlarını ve fiyatlarını kontrol edin.";
      if (option.calorieDelta !== undefined && (!Number.isFinite(option.calorieDelta) || (item.calories !== undefined && item.calories + option.calorieDelta < 0))) return "Seçenek kalorilerini kontrol edin.";
    }
  }
  const minimumPrice = (item.variants ?? []).reduce((sum, g) => sum + (g.selection === "single" ? Math.min(...g.options.map((o) => o.priceDelta)) : g.options.reduce((n, o) => n + Math.min(0, o.priceDelta), 0)), item.price);
  if (minimumPrice < 0) return "Seçenekler toplam fiyatı negatif yapamaz.";
  return null;
}
