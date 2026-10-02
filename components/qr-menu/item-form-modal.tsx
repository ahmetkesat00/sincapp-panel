"use client";

import { ImagePlus, Save, Trash2, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import ImageCropper from "@/components/dashboard/ui/image-cropper";
import getCroppedImg from "@/lib/cropImage";
import { today, uploadItemImage } from "@/lib/qr-menu/firestore";
import {
  BADGES,
  CALORIE_SOURCES,
  DIET_TAGS,
  LOYALTY_ITEM_TYPES,
  type CalorieSource,
  type MenuCategory,
  type MenuItem,
} from "@/lib/qr-menu/types";
import IngredientsEditor from "./ingredients-editor";
import { ChipToggle, Field, LocalizedInput, Toggle, inputCls, numberOrUndefined, primaryBtnCls } from "./ui";
import VariantsEditor from "./variants-editor";

type Props = {
  cafeId: string;
  item: MenuItem;
  isNew: boolean;
  categories: MenuCategory[];
  showEn: boolean;
  onSave: (item: MenuItem) => Promise<void>;
  onClose: () => void;
};

const toggleIn = <T,>(list: T[] | undefined, v: T) => {
  const l = list ?? [];
  return l.includes(v) ? l.filter((x) => x !== v) : [...l, v];
};

/** Kaydetmeden önce boş satırları atar ve zorunlu alanları kontrol eder. */
function normalize(item: MenuItem): { item: MenuItem; error?: string } {
  const ingredients = item.ingredients.filter((i) => i.name.tr.trim());
  const variants = (item.variants ?? []).map((g) => ({
    ...g,
    options: g.options
      .filter((o) => o.name.tr.trim())
      .map((o) => ({ ...o, ingredients: o.ingredients?.filter((i) => i.name.tr.trim()) })),
  }));
  const next = { ...item, ingredients, variants: variants.length ? variants : undefined };

  if (!item.name.tr.trim()) return { item: next, error: "Ürün adı (TR) zorunlu." };
  if (!item.categoryId) return { item: next, error: "Kategori seçin." };
  if (!(item.price >= 0)) return { item: next, error: "Geçerli bir fiyat girin." };
  const unnamed = variants.find((g) => !g.name.tr.trim());
  if (unnamed) return { item: next, error: "Seçenek gruplarına ad verin (ör. Boy)." };
  const emptyGroup = variants.find((g) => g.options.length === 0);
  if (emptyGroup) return { item: next, error: `"${emptyGroup.name.tr}" grubunda seçenek yok.` };
  return { item: next };
}

export default function ItemFormModal({ cafeId, item: initial, isNew, categories, showEn, onSave, onClose }: Props) {
  const [item, setItem] = useState<MenuItem>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropPixels, setCropPixels] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof MenuItem>(key: K, value: MenuItem[K]) => setItem((p) => ({ ...p, [key]: value }));
  const calorieSource = item.calorieInfo?.source;
  const isSupplier = calorieSource === "supplier_label" || calorieSource === "supplier_recipe" || calorieSource === "estimate";

  const warnings = [
    item.ingredients.filter((i) => i.name.tr.trim()).length === 0 && "İçindekiler boş — 31.12.2026'dan itibaren zorunlu.",
    item.calories === undefined && "Kalori girilmemiş — 31.12.2027'den itibaren zorunlu.",
    item.calories !== undefined && !calorieSource && "Kalorinin dayanağını (hesap yöntemi) seçin; denetimde sorulabilir.",
  ].filter(Boolean) as string[];

  const applyCrop = async () => {
    if (!cropSrc || !cropPixels) return;
    setUploading(true);
    try {
      const blob = await getCroppedImg(cropSrc, cropPixels, 1200, 900);
      if (blob) set("imageUrl", await uploadItemImage(cafeId, blob));
    } catch (err) {
      console.error(err);
      setError("Görsel yüklenemedi.");
    } finally {
      URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
      setUploading(false);
    }
  };

  const submit = async () => {
    const { item: normalized, error: validation } = normalize(item);
    if (validation) return setError(validation);
    setError("");
    setSaving(true);
    try {
      const caloriesChanged = normalized.calories !== initial.calories;
      const withInfo: MenuItem =
        normalized.calorieInfo && caloriesChanged ? { ...normalized, calorieInfo: { ...normalized.calorieInfo, updatedAt: today() } } : normalized;
      await onSave(withInfo);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Ürün kaydedilemedi.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8">
      <div className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-3xl border-b border-slate-200 bg-white px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">{isNew ? "Yeni ürün" : item.name.tr || "Ürünü düzenle"}</h3>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {warnings.length > 0 && (
            <div className="space-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              {warnings.map((w) => (
                <p key={w} className="flex items-start gap-2 text-xs font-medium text-amber-800">
                  <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                  {w}
                </p>
              ))}
            </div>
          )}

          {/* ── Temel ── */}
          <section className="grid gap-5 sm:grid-cols-[160px_1fr]">
            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-700">Görsel</span>
              <label className="relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:bg-slate-100">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-6 w-6" />
                )}
                {uploading && (
                  <span className="absolute inset-0 grid place-items-center bg-white/80 text-xs font-semibold text-slate-600">Yükleniyor…</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setCropSrc(URL.createObjectURL(file));
                    e.target.value = "";
                  }}
                />
              </label>
              {item.imageUrl && (
                <button type="button" onClick={() => set("imageUrl", undefined)} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600">
                  <Trash2 className="h-3 w-3" /> Görseli kaldır
                </button>
              )}
            </div>

            <div className="space-y-4">
              <Field label="Ürün adı" hint="Tercihi etkileyen bileşeni adda belirtin: 'Tost' değil 'Kaşarlı Tost' (Kılavuz 22.24).">
                <LocalizedInput value={item.name} onChange={(v) => set("name", v)} placeholder="Caffè Latte" showEn={showEn} />
              </Field>
              <Field label="Açıklama">
                <LocalizedInput value={item.description} onChange={(v) => set("description", v)} multiline showEn={showEn} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Kategori">
                  <select value={item.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={inputCls}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name.tr}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Fiyat (₺, KDV dahil)" hint="Seçenek varsa varsayılan seçimin fiyatı.">
                  <input type="number" min={0} value={item.price} onChange={(e) => set("price", Number(e.target.value))} className={inputCls} />
                </Field>
                <Field label="Porsiyon" hint="ör. 250 ml, 1 dilim (130 g)">
                  <input value={item.portion ?? ""} onChange={(e) => set("portion", e.target.value || undefined)} className={inputCls} />
                </Field>
              </div>
            </div>
          </section>

          {/* ── Durum ve etiketler ── */}
          <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl bg-slate-50 px-4 py-3">
            <Toggle checked={item.isVisible} onChange={(v) => set("isVisible", v)} label="Menüde görünsün" />
            <Toggle checked={item.isAvailable} onChange={(v) => set("isAvailable", v)} label={item.isAvailable ? "Satışta" : "Tükendi"} />
            <div className="flex flex-wrap gap-1.5">
              {BADGES.map((b) => (
                <ChipToggle key={b.key} active={!!item.badges?.includes(b.key)} tone="amber" onClick={() => set("badges", toggleIn(item.badges, b.key))}>
                  {b.label}
                </ChipToggle>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DIET_TAGS.map((d) => (
                <ChipToggle key={d.key} active={!!item.dietTags?.includes(d.key)} onClick={() => set("dietTags", toggleIn(item.dietTags, d.key))}>
                  {d.label}
                </ChipToggle>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              Damga kazandırır:
              <select
                value={item.loyaltyItemTypeId ?? ""}
                onChange={(e) => set("loyaltyItemTypeId", e.target.value || undefined)}
                className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none"
              >
                <option value="">Hayır</option>
                {LOYALTY_ITEM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} kartı
                  </option>
                ))}
              </select>
            </label>
          </section>

          {/* ── İçindekiler ── */}
          <section>
            <h4 className="text-sm font-bold text-slate-900">İçindekiler</h4>
            <p className="mb-3 text-xs text-slate-500">
              Alerjen, alkol ve domuz kaynaklı bileşenler menüde vurgulanır (Kılavuz 41.5). Seçeneğe bağlı bileşenleri (süt türü, şurup) aşağıda seçeneklerin içine ekleyin.
            </p>
            <IngredientsEditor value={item.ingredients} onChange={(v) => set("ingredients", v)} showEn={showEn} />
          </section>

          {/* ── Seçenekler ── */}
          <section>
            <h4 className="text-sm font-bold text-slate-900">Seçenekler</h4>
            <p className="mb-3 text-xs text-slate-500">Boy, süt türü, ekstralar. Her seçenek fiyatı, kaloriyi ve bileşenleri değiştirebilir.</p>
            <VariantsEditor value={item.variants ?? []} onChange={(v) => set("variants", v)} showEn={showEn} />
          </section>

          {/* ── Kalori ── */}
          <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Kalori</h4>
              <p className="text-xs text-slate-500">
                Porsiyon başı toplam kcal (varsayılan seçimle). Hesap yöntemi ve not menüde gösterilmez; denetim dosyası içindir.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Kalori (kcal / porsiyon)">
                <input
                  type="number"
                  min={0}
                  value={item.calories ?? ""}
                  onChange={(e) => set("calories", numberOrUndefined(e.target.value))}
                  className={inputCls}
                />
              </Field>
              <Field label="Hesap yöntemi" hint={CALORIE_SOURCES.find((s) => s.key === calorieSource)?.hint} className="sm:col-span-2">
                <select
                  value={calorieSource ?? ""}
                  onChange={(e) =>
                    set(
                      "calorieInfo",
                      e.target.value
                        ? { ...item.calorieInfo, source: e.target.value as CalorieSource, updatedAt: item.calorieInfo?.updatedAt ?? today() }
                        : undefined,
                    )
                  }
                  className={inputCls}
                >
                  <option value="">Seçilmedi</option>
                  {CALORIE_SOURCES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {item.calorieInfo && (
              <div className="grid gap-4 sm:grid-cols-3">
                {isSupplier && (
                  <Field label="Tedarikçi">
                    <input
                      value={item.calorieInfo.supplier ?? ""}
                      onChange={(e) => set("calorieInfo", { ...item.calorieInfo!, supplier: e.target.value || undefined })}
                      className={inputCls}
                    />
                  </Field>
                )}
                <Field label="Hesap notu" hint="ör. Etiket: 320 kcal/100 g, dilim 130 g" className={isSupplier ? "sm:col-span-2" : "sm:col-span-3"}>
                  <input
                    value={item.calorieInfo.note ?? ""}
                    onChange={(e) => set("calorieInfo", { ...item.calorieInfo!, note: e.target.value || undefined })}
                    className={inputCls}
                  />
                </Field>
              </div>
            )}
          </section>

          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 rounded-b-3xl border-t border-slate-200 bg-white px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Vazgeç
          </button>
          <button type="button" onClick={submit} disabled={saving || uploading} className={primaryBtnCls}>
            <Save className="h-4 w-4" />
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>

      {cropSrc && (
        <ImageCropper
          image={cropSrc}
          aspect={4 / 3}
          onCropComplete={(_area, pixels) => setCropPixels(pixels)}
          onApply={applyCrop}
          onCancel={() => {
            URL.revokeObjectURL(cropSrc);
            setCropSrc(null);
          }}
        />
      )}
    </div>
  );
}
