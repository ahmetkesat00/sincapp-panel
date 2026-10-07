"use client";

import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronUp,
  Eye,
  EyeOff,
  Flame,
  Image as ImageIcon,
  LayoutTemplate,
  Pencil,
  Plus,
  QrCode,
  Settings2,
  Trash2,
  TriangleAlert,
  UtensilsCrossed,
  Wand2,
  Wine,
} from "lucide-react";
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
  saveQrStyle,
  saveLogoCheck,
  saveSettings,
  setMenuEnabled,
  touchPricesUpdatedAt,
} from "@/lib/qr-menu/firestore";
import type { MenuCategory, MenuItem, QrMenuSettings } from "@/lib/qr-menu/types";
import ItemFormModal from "./item-form-modal";
import CalorieAssistant from "./calorie-assistant";
import MenuWizard from "./menu-wizard";
import { isLightLogo, photoStats } from "@/lib/qr-menu/wizard";
import DesignCard from "./design-card";
import QrCodesCard from "./qr-codes-card";
import SettingsCard from "./settings-card";
import StatsCard from "./stats-card";
import BrandingCard from "./branding-card";
import MenuHero from "./menu-hero";
import MenuStudio from "./menu-studio";
import { Field, KeepAlive, LocalizedInput, inputCls, primaryBtnCls, smallBtnCls } from "./ui";

type Props = { cafeId: string; cafeName: string; /** Başlık (admin sayfasında kafe adı). */ title?: string };

const priceSignature = (i: MenuItem) => JSON.stringify([i.price, i.variants?.map((g) => g.options.map((o) => o.priceDelta))]);

const permissionHint = (err: unknown) =>
  err instanceof Error && /permission/i.test(err.message)
    ? " Firestore kurallarında menuCategories / menuItems / menuSlugs için yetki tanımlı olmayabilir."
    : "";

export default function QrMenuEditor({ cafeId, cafeName, title }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<QrMenuSettings | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | undefined>();
  const [heroImage, setHeroImage] = useState<string | undefined>();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [editing, setEditing] = useState<{ item: MenuItem; isNew: boolean } | null>(null);
  const [categoryForm, setCategoryForm] = useState<MenuCategory | null>(null);
  const [tab, setTab] = useState<Tab>("products");
  /** Açık kategori kartları (varsayılan hepsi kapalı; liste aşağı uzamasın). */
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // Dışarıdan (başlıktaki "yayına al" ya da sihirbaz) ayar değişince ayar formu yeni değerle yeniden kurulsun;
  // yoksa form eski "kapalı" değerini tutar ve sonraki kayıtta menüyü geri kapatır.
  const [settingsFormKey, setSettingsFormKey] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [calorieOpen, setCalorieOpen] = useState(false);
  /** Ürün kaydedilince artar: "Menüyü düzenle" önizlemesi yenilensin. */
  const [previewKey, setPreviewKey] = useState(0);

  // Logo açık renkli mi: logo değiştiyse (ya da hiç bakılmadıysa) bir kez hesaplanıp kaydedilir;
  // menü "Otomatik" logo zemininde buna göre beyaz ya da koyu zemin kullanır.
  const logoCheckedFor = settings?.logoCheckedFor;
  const hasSettings = settings !== null;
  useEffect(() => {
    if (!logoUrl || !hasSettings || logoCheckedFor === logoUrl) return;
    let active = true;
    isLightLogo(logoUrl)
      .then((isLight) => {
        if (!active) return;
        // Önce ekranda göster; kayıt başarısız olsa da panel "inceleniyor"da takılı kalmasın.
        setSettings((s) => (s ? { ...s, logoIsLight: isLight, logoCheckedFor: logoUrl } : s));
        return saveLogoCheck(cafeId, logoUrl, isLight);
      })
      .catch((err) => console.warn("Logo kontrol edilemedi:", err));
    return () => {
      active = false;
    };
  }, [cafeId, logoUrl, logoCheckedFor, hasSettings]);

  const toggleCategory = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const expandCategory = (id: string) => setExpanded((prev) => new Set(prev).add(id));
  const focusProducts = () => {
    setTab("products");
    if (categories.length === 0) setCategoryForm({ id: newCategoryId(cafeId), name: { tr: "" }, sortOrder: 0 });
  };

  useEffect(() => {
    let active = true;
    loadQrMenu(cafeId, cafeName)
      .then((data) => {
        if (!active) return;
        setSettings(data.settings);
        setSavedSlug(data.hasSettings ? data.settings.slug : null);
        // İlk kurulumda ayarlar kaydedilmeden QR ve önizleme çalışmaz; ayarlar sekmesi açık gelsin.
        if (!data.hasSettings) setTab("settings");
        setLogoUrl(data.logoUrl);
        setHeroImage(data.heroImage);
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
  const menuLive = savedSlug !== null && (settings?.enabled ?? false);
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
      expandCategory(cat.id);
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

  const openNewItem = (categoryId: string) => {
    expandCategory(categoryId);
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
  };

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

  const visibleItemCount = items.filter((i) => i.isVisible).length;
  const allExpanded = categories.length > 0 && categories.every((c) => expanded.has(c.id));
  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: "products", label: "Ürünler", icon: <UtensilsCrossed className="h-4 w-4" />, badge: items.length ? String(items.length) : undefined },
    { id: "design", label: "Tasarım", icon: <LayoutTemplate className="h-4 w-4" /> },
    { id: "qr", label: "QR kodları", icon: <QrCode className="h-4 w-4" /> },
    { id: "stats", label: "İstatistikler", icon: <BarChart3 className="h-4 w-4" /> },
    { id: "settings", label: "Ayarlar", icon: <Settings2 className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-5">
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      {settings && (
        <MenuHero
          title={title}
          settings={settings}
          savedSlug={savedSlug}
          categoryCount={categories.length}
          itemCount={items.length}
          visibleItemCount={visibleItemCount}
          onOpenWizard={() => setWizardOpen(true)}
          onOpenStudio={savedSlug !== null && items.length > 0 ? () => setStudioOpen(true) : undefined}
          onAddProductsManually={focusProducts}
          onPublish={async () => {
            await setMenuEnabled(cafeId, true);
            setSettings((s) => (s ? { ...s, enabled: true } : s));
            setSettingsFormKey((k) => k + 1);
          }}
        />
      )}

      {settings && studioOpen && savedSlug && (
        <MenuStudio
          settings={settings}
          slug={savedSlug}
          items={items}
          logoUrl={logoUrl}
          heroImage={heroImage}
          menuLive={menuLive}
          reloadKey={previewKey}
          onEditItem={(id) => {
            const item = items.find((i) => i.id === id);
            if (item) setEditing({ item, isNew: false });
          }}
          onSave={async (next) => {
            await saveSettings(cafeId, next);
            setSettings(next);
            setSettingsFormKey((k) => k + 1);
          }}
          onClose={() => setStudioOpen(false)}
        />
      )}

      {settings && wizardOpen && (
        <MenuWizard
          cafeId={cafeId}
          cafeName={cafeName}
          menuLive={menuLive}
          onImported={(newCategories, newItems, pricesUpdatedAt) => {
            setCategories((prev) => [...prev, ...newCategories]);
            setItems((prev) => [...prev, ...newItems]);
            if (pricesUpdatedAt) setSettings((s) => (s ? { ...s, pricesUpdatedAt } : s));
          }}
          logoUrl={logoUrl}
          heroImage={heroImage}
          settings={settings}
          savedSlug={savedSlug}
          items={items}
          categories={categories}
          onFinish={async (next) => {
            // saveSettings link adını da kaydeder (ilk kurulumda menuSlugs kaydı açılır).
            await saveSettings(cafeId, next);
            setSettings(next);
            setSavedSlug(next.slug);
            setSettingsFormKey((k) => k + 1);
          }}
          onGoToProducts={() => {
            setWizardOpen(false);
            focusProducts();
          }}
          onClose={() => setWizardOpen(false)}
        />
      )}

      {settings && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <nav role="tablist" aria-label="QR menü bölümleri" className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3 [scrollbar-width:none]">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={`relative inline-flex shrink-0 items-center gap-2 px-3.5 py-3.5 text-sm font-semibold transition ${
                    active ? "text-slate-900" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span className={active ? "text-emerald-600" : "text-slate-400"}>{t.icon}</span>
                  {t.label}
                  {t.badge && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{t.badge}</span>}
                  {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-emerald-600" />}
                </button>
              );
            })}
          </nav>

          <div className="p-5 md:p-6">
            <KeepAlive active={tab === "products"}>
              <div className="space-y-5">
                {items.length > 0 && (
                  <div className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <ComplianceStat count={compliance.noIngredients} label="üründe içindekiler eksik" okLabel="İçindekiler tamam" deadline="Son tarih 31.12.2026" />
                      <ComplianceStat count={compliance.noCalories} label="üründe kalori eksik" okLabel="Kaloriler tamam" deadline="Son tarih 31.12.2027" />
                      <ComplianceStat count={compliance.noSource} label="üründe kalori dayanağı yok" okLabel="Kalori dayanakları tamam" deadline="Denetim dosyası" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setCalorieOpen(true)}
                      className="flex w-full items-center gap-3 rounded-xl bg-orange-50 px-3.5 py-2.5 text-left ring-1 ring-orange-100 transition hover:bg-orange-100/70"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-orange-500 text-white">
                        <Flame className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">Kalori Asistanı</span>
                        <span className="block text-xs text-slate-500">
                          Reçeteyi biz önerelim, siz gramajı düzeltin: kalori, içindekiler ve alerjenler birlikte tamamlansın.
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-orange-400" />
                    </button>
                  </div>
                )}

                {calorieOpen && (
                  <CalorieAssistant
                    cafeId={cafeId}
                    items={items}
                    categories={categories}
                    onSaved={(updated) => {
                      const byId = new Map(updated.map((i) => [i.id, i]));
                      setItems((prev) => prev.map((i) => byId.get(i.id) ?? i));
                      setPreviewKey((k) => k + 1);
                    }}
                    onClose={() => setCalorieOpen(false)}
                  />
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Kategoriler ve ürünler</h3>
                    <p className="text-xs text-slate-500">
                      {categories.length} kategori · {items.length} ürün
                      {items.length > visibleItemCount ? ` · ${items.length - visibleItemCount} gizli` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {categories.length > 1 && (
                      <button
                        type="button"
                        className={smallBtnCls}
                        onClick={() => setExpanded(allExpanded ? new Set() : new Set(categories.map((c) => c.id)))}
                      >
                        {allExpanded ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
                        {allExpanded ? "Tümünü kapat" : "Tümünü aç"}
                      </button>
                    )}
                    <button
                      type="button"
                      className={primaryBtnCls}
                      onClick={() => setCategoryForm({ id: newCategoryId(cafeId), name: { tr: "" }, sortOrder: categories.length })}
                    >
                      <Plus className="h-4 w-4" />
                      Kategori ekle
                    </button>
                  </div>
                </div>

                {categoryForm && !categories.some((c) => c.id === categoryForm.id) && (
                  <CategoryForm value={categoryForm} showEn={showEn} onCancel={() => setCategoryForm(null)} onSubmit={submitCategory} />
                )}

                {categories.length === 0 && !categoryForm && (
                  <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center">
                    <UtensilsCrossed className="mx-auto h-6 w-6 text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-700">Henüz kategori yok</p>
                    <p className="mt-1 text-xs text-slate-500">Menünüzü Menü Sihirbazı&apos;na yükleyin ya da &quot;Kategori ekle&quot; ile başlayın.</p>
                    <button type="button" onClick={() => setWizardOpen(true)} className={`${smallBtnCls} mt-4`}>
                      <Wand2 className="h-3.5 w-3.5" /> Menü Sihirbazı
                    </button>
                  </div>
                )}

                <div className="space-y-2.5">
                  {categories.map((cat, ci) => {
                    const catItems = itemsByCategory.get(cat.id) ?? [];
                    if (categoryForm?.id === cat.id) {
                      return <CategoryForm key={cat.id} value={categoryForm} showEn={showEn} onCancel={() => setCategoryForm(null)} onSubmit={submitCategory} />;
                    }
                    return (
                      <CategoryCard
                        key={cat.id}
                        category={cat}
                        items={catItems}
                        open={expanded.has(cat.id)}
                        isFirst={ci === 0}
                        isLast={ci === categories.length - 1}
                        onToggle={() => toggleCategory(cat.id)}
                        onMove={(dir) => moveCategory(ci, dir)}
                        onEdit={() => setCategoryForm(cat)}
                        onDelete={() => removeCategory(cat)}
                        onAddItem={() => openNewItem(cat.id)}
                      >
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
                      </CategoryCard>
                    );
                  })}
                </div>
              </div>
            </KeepAlive>

            <KeepAlive active={tab === "design"}>
              <DesignCard
                cafeId={cafeId}
                settings={settings}
                savedSlug={savedSlug}
                menuLive={menuLive}
                stats={photoStats(items, heroImage)}
                onChange={(patch) => setSettings((s) => (s ? { ...s, ...patch } : s))}
              />
              <div className="mt-6">
                <BrandingCard cafeId={cafeId} settings={settings} logoUrl={logoUrl} onChange={(patch) => setSettings((s) => (s ? { ...s, ...patch } : s))} />
              </div>
            </KeepAlive>

            <KeepAlive active={tab === "qr"}>
              <QrCodesCard
                cafeId={cafeId}
                cafeName={cafeName}
                logoUrl={logoUrl}
                heroImage={heroImage}
                settings={settings}
                isSaved={savedSlug !== null}
                onSaveStyle={async (qrStyle) => {
                  await saveQrStyle(cafeId, qrStyle);
                  setSettings((s) => (s ? { ...s, qrStyle } : s));
                }}
              />
            </KeepAlive>

            <KeepAlive active={tab === "stats"}>
              {savedSlug !== null ? (
                <StatsCard cafeId={cafeId} items={items} categories={categories} />
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">Menünüz kurulup yayına alındığında istatistikler burada görünür.</p>
              )}
            </KeepAlive>

            <KeepAlive active={tab === "settings"}>
              <SettingsCard
                key={settingsFormKey}
                cafeName={cafeName}
                initial={settings}
                savedSlug={savedSlug}
                onSave={async (s) => {
                  // Form sadece kendi alanlarını yazar; tasarım, QR stili, fiyat tarihi gibi başka yerde
                  // değişmiş alanlar formun açıldığı andaki eski hâliyle ezilmesin.
                  const next: QrMenuSettings = {
                    ...settings,
                    enabled: s.enabled,
                    slug: s.slug,
                    tagline: s.tagline,
                    phone: s.phone,
                    wifi: s.wifi,
                    theme: s.theme,
                    locales: s.locales,
                  };
                  await saveSettings(cafeId, next);
                  setSettings(next);
                  setSavedSlug(next.slug);
                }}
              />
            </KeepAlive>
          </div>
        </div>
      )}

      {editing && (
        <ItemFormModal
          cafeId={cafeId}
          item={editing.item}
          isNew={editing.isNew}
          categories={categories}
          showEn={showEn}
          onSave={async (item) => {
            await submitItem(item);
            setPreviewKey((k) => k + 1);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** Açılır kategori kartı: kapalıyken ad, sayı, eksik/gizli özetleri ve küçük fotoğraflar; açıkken ürün satırları. */
function CategoryCard({
  category,
  items,
  open,
  isFirst,
  isLast,
  onToggle,
  onMove,
  onEdit,
  onDelete,
  onAddItem,
  children,
}: {
  category: MenuCategory;
  items: MenuItem[];
  open: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onMove: (dir: -1 | 1) => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddItem: () => void;
  children: React.ReactNode;
}) {
  const hidden = items.filter((i) => !i.isVisible).length;
  const soldOut = items.filter((i) => !i.isAvailable).length;
  const incomplete = items.filter((i) => i.ingredients.length === 0 || i.calories === undefined || i.allergensConfirmed === false).length;
  const thumbs = items.filter((i) => i.imageUrl).slice(0, 4);

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white transition ${open ? "border-slate-300 shadow-sm" : "border-slate-200 hover:border-slate-300"}`}>
      <div className="flex items-center gap-2 py-2.5 pl-3 pr-2 sm:pl-4">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left">
          <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-90" : ""}`} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate font-semibold text-slate-900">{category.name.tr}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{items.length} ürün</span>
              {incomplete > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{incomplete} eksik bilgi</span>}
              {soldOut > 0 && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-white">{soldOut} tükendi</span>}
              {hidden > 0 && <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">{hidden} gizli</span>}
            </span>
            {category.servedBetween && (
              <span className="mt-0.5 block text-xs text-slate-500">
                Servis: {category.servedBetween.open}–{category.servedBetween.close}
              </span>
            )}
          </span>
          {!open && thumbs.length > 0 && (
            <span className="hidden shrink-0 -space-x-2 sm:flex" aria-hidden>
              {thumbs.map((i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i.id} src={i.imageUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-2 ring-white" />
              ))}
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center">
          <IconBtn label="Yukarı" disabled={isFirst} onClick={() => onMove(-1)}>
            <ChevronUp className="h-4 w-4" />
          </IconBtn>
          <IconBtn label="Aşağı" disabled={isLast} onClick={() => onMove(1)}>
            <ChevronDown className="h-4 w-4" />
          </IconBtn>
          <IconBtn label="Kategoriyi düzenle" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </IconBtn>
          <IconBtn label="Kategoriyi sil" danger onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </IconBtn>
          <button type="button" className={`${smallBtnCls} ml-1`} onClick={onAddItem}>
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Ürün ekle</span>
          </button>
        </div>
      </div>

      {open &&
        (items.length > 0 ? (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">{children}</ul>
        ) : (
          <div className="border-t border-slate-100 px-4 py-6 text-center text-sm text-slate-500">
            Bu kategoride ürün yok.{" "}
            <button type="button" onClick={onAddItem} className="font-semibold text-emerald-700 hover:underline">
              Ürün ekle
            </button>
          </div>
        ))}
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
  const missing = [
    item.ingredients.length === 0 && "içindekiler",
    item.calories === undefined && "kalori",
    item.allergensConfirmed === false && "alerjen onayı",
  ].filter(Boolean);
  const alcohol = item.ingredients.some((i) => i.alcohol);

  return (
    <li className={`flex flex-wrap items-center gap-3 px-4 py-3 ${item.isVisible ? "" : "bg-slate-50/70"}`}>
      <div className="grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className={`h-full w-full object-cover ${item.isAvailable ? "" : "grayscale"}`} />
        ) : (
          <ImageIcon className="h-4 w-4 text-slate-300" aria-label="Fotoğraf yok" />
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

type Tab = "products" | "design" | "qr" | "stats" | "settings";

function ComplianceStat({ count, label, okLabel, deadline }: { count: number; label: string; okLabel: string; deadline: string }) {
  const ok = count === 0;
  return (
    <div className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 ring-1 ${ok ? "bg-emerald-50/60 ring-emerald-100" : "bg-amber-50/70 ring-amber-100"}`}>
      <span className={`grid h-8 min-w-8 place-items-center rounded-lg px-1.5 text-sm font-bold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
        {ok ? "✓" : count}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-slate-800">{ok ? okLabel : label}</span>
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{deadline}</span>
      </span>
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
