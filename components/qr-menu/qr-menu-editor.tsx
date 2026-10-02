"use client";

import { ChevronDown, ChevronUp, Eye, EyeOff, Pencil, Plus, Trash2, TriangleAlert, UtensilsCrossed, Wine } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteCategory,
  deleteItem,
  loadQrMenu,
  newCategoryId,
  newItemId,
  patchItem,
  saveCategory,
  saveItem,
  saveOrder,
  saveSettings,
  touchPricesUpdatedAt,
} from "@/lib/qr-menu/firestore";
import type { MenuCategory, MenuItem, QrMenuSettings } from "@/lib/qr-menu/types";
import ItemFormModal from "./item-form-modal";
import SettingsCard from "./settings-card";
import { Field, LocalizedInput, inputCls, primaryBtnCls, smallBtnCls } from "./ui";

type Props = { cafeId: string; cafeName: string };

const priceSignature = (i: MenuItem) => JSON.stringify([i.price, i.variants?.map((g) => g.options.map((o) => o.priceDelta))]);

const permissionHint = (err: unknown) =>
  err instanceof Error && /permission/i.test(err.message)
    ? " Firestore kurallarında menuCategories / menuItems / menuSlugs için yetki tanımlı olmayabilir."
    : "";

export default function QrMenuEditor({ cafeId, cafeName }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<QrMenuSettings | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [editing, setEditing] = useState<{ item: MenuItem; isNew: boolean } | null>(null);
  const [categoryForm, setCategoryForm] = useState<MenuCategory | null>(null);

  useEffect(() => {
    let active = true;
    loadQrMenu(cafeId, cafeName)
      .then((data) => {
        if (!active) return;
        setSettings(data.settings);
        setSavedSlug(data.hasSettings ? data.settings.slug : null);
        setCategories(data.categories);
        setItems(data.items);
      })
      .catch((err) => {
        console.error("QR menu load error:", err);
        if (active) setError("QR menü yüklenemedi." + permissionHint(err));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [cafeId, cafeName]);

  const run = useCallback(async (fn: () => Promise<void>, failText: string) => {
    setError("");
    try {
      await fn();
    } catch (err) {
      console.error(failText, err);
      setError(failText + permissionHint(err));
    }
  }, []);

  const showEn = settings?.locales.includes("en") ?? false;
  const itemsByCategory = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const c of categories) map.set(c.id, []);
    for (const i of items) map.get(i.categoryId)?.push(i);
    return map;
  }, [categories, items]);

  const compliance = useMemo(
    () => ({
      noIngredients: items.filter((i) => i.isVisible && i.ingredients.length === 0).length,
      noCalories: items.filter((i) => i.isVisible && i.calories === undefined).length,
      noSource: items.filter((i) => i.isVisible && i.calories !== undefined && !i.calorieInfo?.source).length,
    }),
    [items],
  );

  // ─── Kategori işlemleri ───

  const submitCategory = (cat: MenuCategory) => {
    if (!cat.name.tr.trim()) return setError("Kategori adı (TR) zorunlu.");
    return run(async () => {
      await saveCategory(cafeId, cat);
      setCategories((prev) => {
        const exists = prev.some((c) => c.id === cat.id);
        return exists ? prev.map((c) => (c.id === cat.id ? cat : c)) : [...prev, cat];
      });
      setCategoryForm(null);
    }, "Kategori kaydedilemedi.");
  };

  const removeCategory = (cat: MenuCategory) => {
    const catItems = itemsByCategory.get(cat.id) ?? [];
    const msg = catItems.length
      ? `"${cat.name.tr}" kategorisi ve içindeki ${catItems.length} ürün silinecek. Emin misiniz?`
      : `"${cat.name.tr}" kategorisi silinecek. Emin misiniz?`;
    if (!window.confirm(msg)) return;
    run(async () => {
      await deleteCategory(cafeId, cat.id, catItems.map((i) => i.id));
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      setItems((prev) => prev.filter((i) => i.categoryId !== cat.id));
    }, "Kategori silinemedi.");
  };

  const moveCategory = (index: number, dir: -1 | 1) => {
    const next = [...categories];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    const reordered = next.map((c, i) => ({ ...c, sortOrder: i }));
    setCategories(reordered);
    run(() => saveOrder(cafeId, "menuCategories", reordered.map((c) => c.id)), "Sıralama kaydedilemedi.");
  };

  // ─── Ürün işlemleri ───

  const openNewItem = (categoryId: string) =>
    setEditing({
      isNew: true,
      item: {
        id: newItemId(cafeId),
        categoryId,
        name: { tr: "" },
        price: 0,
        ingredients: [],
        isAvailable: true,
        isVisible: true,
        sortOrder: itemsByCategory.get(categoryId)?.length ?? 0,
      },
    });

  const submitItem = async (item: MenuItem) => {
    const previous = items.find((i) => i.id === item.id);
    // Kategori değiştiyse yeni kategorinin sonuna ekle.
    const placed =
      previous && previous.categoryId !== item.categoryId
        ? { ...item, sortOrder: itemsByCategory.get(item.categoryId)?.length ?? 0 }
        : item;
    await saveItem(cafeId, placed);
    if (!previous || priceSignature(previous) !== priceSignature(placed)) {
      const date = await touchPricesUpdatedAt(cafeId).catch(() => null);
      if (date) setSettings((s) => (s ? { ...s, pricesUpdatedAt: date } : s));
    }
    setItems((prev) => (previous ? prev.map((i) => (i.id === placed.id ? placed : i)) : [...prev, placed]));
    setEditing(null);
  };

  const quickPatch = (item: MenuItem, patch: Partial<Pick<MenuItem, "isAvailable" | "isVisible">>) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    run(() => patchItem(cafeId, item.id, patch), "Ürün güncellenemedi.");
  };

  const removeItem = (item: MenuItem) => {
    if (!window.confirm(`"${item.name.tr}" silinecek. Emin misiniz?`)) return;
    run(async () => {
      await deleteItem(cafeId, item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    }, "Ürün silinemedi.");
  };

  const moveItem = (categoryId: string, index: number, dir: -1 | 1) => {
    const list = [...(itemsByCategory.get(categoryId) ?? [])];
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    const order = new Map(list.map((i, idx) => [i.id, idx]));
    setItems((prev) =>
      prev.map((i) => (order.has(i.id) ? { ...i, sortOrder: order.get(i.id)! } : i)).sort((a, b) => a.sortOrder - b.sortOrder),
    );
    run(() => saveOrder(cafeId, "menuItems", list.map((i) => i.id)), "Sıralama kaydedilemedi.");
  };

  // ─── Render ───

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-10">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        <p className="text-sm text-slate-500">QR menü yükleniyor…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      {settings && (
        <SettingsCard
          cafeName={cafeName}
          initial={settings}
          savedSlug={savedSlug}
          onSave={async (s) => {
            await saveSettings(cafeId, s);
            setSettings(s);
            setSavedSlug(s.slug);
          }}
        />
      )}

      {items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <ComplianceStat
            count={compliance.noIngredients}
            label="üründe içindekiler eksik"
            okLabel="Tüm ürünlerde içindekiler var"
            deadline="Son tarih 31.12.2026"
          />
          <ComplianceStat
            count={compliance.noCalories}
            label="üründe kalori eksik"
            okLabel="Tüm ürünlerde kalori var"
            deadline="Son tarih 31.12.2027"
          />
          <ComplianceStat
            count={compliance.noSource}
            label="üründe kalori dayanağı seçilmemiş"
            okLabel="Tüm kalorilerin dayanağı seçili"
            deadline="Denetim dosyası"
          />
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Kategoriler ve ürünler</h3>
            <p className="text-xs text-slate-500">
              {categories.length} kategori · {items.length} ürün
            </p>
          </div>
          <button
            type="button"
            className={primaryBtnCls}
            onClick={() => setCategoryForm({ id: newCategoryId(cafeId), name: { tr: "" }, sortOrder: categories.length })}
          >
            <Plus className="h-4 w-4" />
            Kategori ekle
          </button>
        </div>

        {categoryForm && !categories.some((c) => c.id === categoryForm.id) && (
          <CategoryForm value={categoryForm} showEn={showEn} onCancel={() => setCategoryForm(null)} onSubmit={submitCategory} />
        )}

        {categories.length === 0 && !categoryForm && (
          <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center">
            <UtensilsCrossed className="mx-auto h-6 w-6 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">Henüz kategori yok. Örneğin &quot;Sıcak Kahveler&quot; ile başlayın.</p>
          </div>
        )}

        {categories.map((cat, ci) => {
          const catItems = itemsByCategory.get(cat.id) ?? [];
          if (categoryForm?.id === cat.id) {
            return <CategoryForm key={cat.id} value={categoryForm} showEn={showEn} onCancel={() => setCategoryForm(null)} onSubmit={submitCategory} />;
          }
          return (
            <div key={cat.id} className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="flex flex-wrap items-center gap-2 bg-slate-50 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {cat.name.tr} <span className="text-xs font-normal text-slate-400">({catItems.length})</span>
                  </p>
                  {cat.servedBetween && (
                    <p className="text-xs text-slate-500">
                      Servis: {cat.servedBetween.open}–{cat.servedBetween.close}
                    </p>
                  )}
                </div>
                <IconBtn label="Yukarı" disabled={ci === 0} onClick={() => moveCategory(ci, -1)}>
                  <ChevronUp className="h-4 w-4" />
                </IconBtn>
                <IconBtn label="Aşağı" disabled={ci === categories.length - 1} onClick={() => moveCategory(ci, 1)}>
                  <ChevronDown className="h-4 w-4" />
                </IconBtn>
                <IconBtn label="Kategoriyi düzenle" onClick={() => setCategoryForm(cat)}>
                  <Pencil className="h-4 w-4" />
                </IconBtn>
                <IconBtn label="Kategoriyi sil" danger onClick={() => removeCategory(cat)}>
                  <Trash2 className="h-4 w-4" />
                </IconBtn>
                <button type="button" className={smallBtnCls} onClick={() => openNewItem(cat.id)}>
                  <Plus className="h-3.5 w-3.5" />
                  Ürün ekle
                </button>
              </div>

              {catItems.length > 0 && (
                <ul className="divide-y divide-slate-100">
                  {catItems.map((item, ii) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      isFirst={ii === 0}
                      isLast={ii === catItems.length - 1}
                      onEdit={() => setEditing({ item, isNew: false })}
                      onMove={(dir) => moveItem(cat.id, ii, dir)}
                      onPatch={(patch) => quickPatch(item, patch)}
                      onDelete={() => removeItem(item)}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <ItemFormModal
          cafeId={cafeId}
          item={editing.item}
          isNew={editing.isNew}
          categories={categories}
          showEn={showEn}
          onSave={submitItem}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ItemRow({
  item,
  isFirst,
  isLast,
  onEdit,
  onMove,
  onPatch,
  onDelete,
}: {
  item: MenuItem;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
  onPatch: (patch: Partial<Pick<MenuItem, "isAvailable" | "isVisible">>) => void;
  onDelete: () => void;
}) {
  const missing = [item.ingredients.length === 0 && "içindekiler", item.calories === undefined && "kalori"].filter(Boolean);
  const alcohol = item.ingredients.some((i) => i.alcohol);

  return (
    <li className={`flex flex-wrap items-center gap-3 px-4 py-3 ${item.isVisible ? "" : "bg-slate-50/70"}`}>
      <div className="h-12 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className={`h-full w-full object-cover ${item.isAvailable ? "" : "grayscale"}`} />
        )}
      </div>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <p className={`truncate text-sm font-semibold ${item.isVisible ? "text-slate-900" : "text-slate-400"}`}>
          {item.name.tr}
          {alcohol && <Wine className="ml-1.5 inline h-3.5 w-3.5 text-rose-500" aria-label="Alkol içerir" />}
        </p>
        <p className="text-xs text-slate-500">
          ₺{item.price}
          {item.calories !== undefined && ` · ${item.calories} kcal`}
          {item.variants?.length ? ` · ${item.variants.length} seçenek grubu` : ""}
          {!item.isVisible && " · Gizli"}
        </p>
        {missing.length > 0 && (
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
            <TriangleAlert className="h-3 w-3" />
            Eksik: {missing.join(", ")}
          </p>
        )}
      </button>

      <button
        type="button"
        onClick={() => onPatch({ isAvailable: !item.isAvailable })}
        className={`rounded-full px-3 py-1 text-xs font-bold transition ${
          item.isAvailable ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-slate-800 text-white hover:bg-slate-700"
        }`}
      >
        {item.isAvailable ? "Satışta" : "Tükendi"}
      </button>
      <IconBtn label={item.isVisible ? "Menüden gizle" : "Menüde göster"} onClick={() => onPatch({ isVisible: !item.isVisible })}>
        {item.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </IconBtn>
      <IconBtn label="Yukarı" disabled={isFirst} onClick={() => onMove(-1)}>
        <ChevronUp className="h-4 w-4" />
      </IconBtn>
      <IconBtn label="Aşağı" disabled={isLast} onClick={() => onMove(1)}>
        <ChevronDown className="h-4 w-4" />
      </IconBtn>
      <IconBtn label="Düzenle" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </IconBtn>
      <IconBtn label="Sil" danger onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </IconBtn>
    </li>
  );
}

function CategoryForm({
  value,
  showEn,
  onSubmit,
  onCancel,
}: {
  value: MenuCategory;
  showEn: boolean;
  onSubmit: (c: MenuCategory) => void;
  onCancel: () => void;
}) {
  const [cat, setCat] = useState(value);
  const [timed, setTimed] = useState(Boolean(value.servedBetween));

  return (
    <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
      <Field label="Kategori adı">
        <LocalizedInput value={cat.name} onChange={(name) => setCat({ ...cat, name })} placeholder="Sıcak Kahveler" showEn={showEn} />
      </Field>
      <Field label="Açıklama (opsiyonel)">
        <LocalizedInput value={cat.description} onChange={(description) => setCat({ ...cat, description })} showEn={showEn} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={timed}
            onChange={(e) => {
              setTimed(e.target.checked);
              setCat({ ...cat, servedBetween: e.target.checked ? { open: "08:00", close: "12:00" } : undefined });
            }}
          />
          Sadece belirli saatlerde servis (ör. kahvaltı)
        </label>
        {timed && cat.servedBetween && (
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={cat.servedBetween.open}
              onChange={(e) => setCat({ ...cat, servedBetween: { ...cat.servedBetween!, open: e.target.value } })}
              className={`${inputCls} w-auto`}
            />
            –
            <input
              type="time"
              value={cat.servedBetween.close}
              onChange={(e) => setCat({ ...cat, servedBetween: { ...cat.servedBetween!, close: e.target.value } })}
              className={`${inputCls} w-auto`}
            />
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" className={primaryBtnCls} onClick={() => onSubmit(cat)}>
          Kaydet
        </button>
        <button type="button" className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-white" onClick={onCancel}>
          Vazgeç
        </button>
      </div>
    </div>
  );
}

function ComplianceStat({ count, label, okLabel, deadline }: { count: number; label: string; okLabel: string; deadline: string }) {
  const ok = count === 0;
  return (
    <div className={`rounded-2xl border px-4 py-3 ${ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <p className={`text-2xl font-bold ${ok ? "text-emerald-700" : "text-amber-700"}`}>{ok ? "✓" : count}</p>
      <p className="text-xs text-slate-600">{ok ? okLabel : label}</p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{deadline}</p>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg p-1.5 text-slate-400 transition disabled:opacity-30 ${danger ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-slate-100 hover:text-slate-700"}`}
    >
      {children}
    </button>
  );
}
