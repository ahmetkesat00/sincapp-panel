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
  Copy,
  Search,
  GripVertical,
  Download,
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
  patchItems,
  saveCategory,
  saveItem,
  saveOrder,
  saveQrStyle,
  saveLogoCheck,
  saveSettings,
  setMenuEnabled,
  touchPricesUpdatedAt,
  uploadMenuBranding,
} from "@/lib/qr-menu/firestore";
import type { MenuCategory, MenuItem, QrMenuSettings } from "@/lib/qr-menu/types";
import ItemFormModal from "./item-form-modal";
import CalorieAssistant from "./calorie-assistant";
import MenuWizard from "./menu-wizard";
import { isLightLogo } from "@/lib/qr-menu/wizard";
import QrCodesCard from "./qr-codes-card";
import SettingsCard from "./settings-card";
import StatsCard from "./stats-card";
import BrandingCard from "./branding-card";
import MenuHero from "./menu-hero";
import MenuStudio from "./menu-studio";
import type { PreviewData } from "./menu-preview";
import { matchesProduct, needsReview, type ProductFilter } from "@/lib/qr-menu/product-tools";
import { Field, KeepAlive, LocalizedInput, inputCls, primaryBtnCls, smallBtnCls } from "./ui";

type Props = { cafeId: string; cafeName: string; /** Başlık (admin sayfasında kafe adı). */ title?: string };

const priceSignature = (i: MenuItem) => JSON.stringify([i.price, i.variants?.map((g) => g.options.map((o) => o.priceDelta))]);

const permissionHint = (err: unknown) =>
  err instanceof Error && /permission/i.test(err.message)
    ? " Bu işlem için yetkiniz bulunmuyor. İşletme yöneticinizle iletişime geçin."
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProductFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mutating, setMutating] = useState(false);
  const [previewCafe, setPreviewCafe] = useState<PreviewData["cafe"] | null>(null);

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
        setTab("products");
        setPreviewCafe(data.previewCafe);
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
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
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
  const displayedItems = useMemo(() => items.filter((i) => (!categoryFilter || i.categoryId === categoryFilter) && matchesProduct(i, query, filter)), [items, categoryFilter, query, filter]);
  const filtering = Boolean(query.trim() || categoryFilter || filter !== "all");
  const previewData: PreviewData | null = settings ? { cafe: { ...(previewCafe ?? { id: cafeId, name: cafeName }), name: cafeName, logoUrl, heroImage, qrMenu: settings }, categories, items: items.filter((i) => i.isVisible) } : null;
  const reviewCount = items.filter(needsReview).length;

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
    if (mutating) return;
    const next = [...categories];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    const reordered = next.map((c, i) => ({ ...c, sortOrder: i }));
    setMutating(true);
    void run(async () => { await saveOrder(cafeId, "menuCategories", reordered.map((c) => c.id)); setCategories(reordered); }, "Sıralama kaydedilemedi.").finally(() => setMutating(false));
  };

  const dropCategory = (source: string, target: string) => {
    if (mutating || source === target) return;
    const next = [...categories];
    const from = next.findIndex((c) => c.id === source);
    const to = next.findIndex((c) => c.id === target);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
    const ordered = next.map((c, sortOrder) => ({ ...c, sortOrder }));
    setMutating(true);
    void run(async () => { await saveOrder(cafeId, "menuCategories", ordered.map((c) => c.id)); setCategories(ordered); }, "Sıralama kaydedilemedi.").finally(() => setMutating(false));
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
        ? { ...item, sortOrder: (itemsByCategory.get(item.categoryId) ?? []).reduce((max, i) => Math.max(max, i.sortOrder + 1), 0) }
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
    if (mutating) return;
    if (patch.isVisible && item.priceNeedsReview) { setError("Önce ürünün fiyatını kontrol edip kaydedin."); return; }
    setMutating(true);
    void run(async () => {
      await patchItem(cafeId, item.id, patch);
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, ...patch } : i));
      setPreviewKey((k) => k + 1);
    }, "Ürün güncellenemedi.").finally(() => setMutating(false));
  };

  const bulkPatch = (patch: Partial<Pick<MenuItem, "isAvailable" | "isVisible">>) => {
    const targets = displayedItems.filter((i) => selected.has(i.id));
    if (mutating || !targets.length) return;
    if (patch.isVisible && targets.some((i) => i.priceNeedsReview)) { setError("Seçimde fiyatı kontrol edilmemiş ürünler var. Önce fiyatlarını tamamlayın."); return; }
    setMutating(true);
    void run(async () => {
      await patchItems(cafeId, targets.map((i) => i.id), patch);
      const ids = new Set(targets.map((i) => i.id));
      setItems((prev) => prev.map((i) => ids.has(i.id) ? { ...i, ...patch } : i));
      setSelected(new Set());
      setPreviewKey((k) => k + 1);
    }, "Toplu işlem kaydedilemedi.").finally(() => setMutating(false));
  };

  const quickPrice = async (item: MenuItem, price: number) => {
    if (!Number.isFinite(price) || price < 0) throw new Error("Geçerli bir fiyat girin.");
    if (mutating) throw new Error("Devam eden işlemin tamamlanmasını bekleyin.");
    setMutating(true);
    try {
      await saveItem(cafeId, { ...item, price, priceNeedsReview: false });
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, price, priceNeedsReview: false } : i));
      const date = await touchPricesUpdatedAt(cafeId).catch(() => null);
      if (date) setSettings((s) => s ? { ...s, pricesUpdatedAt: date } : s);
      setPreviewKey((k) => k + 1);
    } finally { setMutating(false); }
  };

  const copyItem = (item: MenuItem) => setEditing({ isNew: true, item: { ...item, id: newItemId(cafeId), name: { ...item.name, tr: `${item.name.tr} (kopya)` }, isVisible: false, sortOrder: (itemsByCategory.get(item.categoryId) ?? []).reduce((max, i) => Math.max(max, i.sortOrder + 1), 0) } });

  const removeItem = (item: MenuItem) => {
    if (mutating) return;
    if (!window.confirm(`"${item.name.tr}" silinecek. Emin misiniz?`)) return;
    run(async () => {
      await deleteItem(cafeId, item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    }, "Ürün silinemedi.");
  };

  const moveItem = (categoryId: string, index: number, dir: -1 | 1) => {
    if (mutating) return;
    const list = [...(itemsByCategory.get(categoryId) ?? [])];
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    const order = new Map(list.map((i, idx) => [i.id, idx]));
    setMutating(true);
    void run(async () => { await saveOrder(cafeId, "menuItems", list.map((i) => i.id)); setItems((prev) => prev.map((i) => order.has(i.id) ? { ...i, sortOrder: order.get(i.id)! } : i)); }, "Sıralama kaydedilemedi.").finally(() => setMutating(false));
  };
  const dropItem = (source: string, target: MenuItem) => {
    if (mutating || filtering || source === target.id) return;
    const list = [...(itemsByCategory.get(target.categoryId) ?? [])];
    const from = list.findIndex((i) => i.id === source);
    const to = list.findIndex((i) => i.id === target.id);
    if (from < 0 || to < 0) { setError("Ürünleri kendi kategorisi içinde sürükleyin. Kategori değiştirmek için ürünü düzenleyin."); return; }
    const [moved] = list.splice(from, 1); list.splice(to, 0, moved);
    const order = new Map(list.map((i, index) => [i.id, index]));
    setMutating(true);
    void run(async () => { await saveOrder(cafeId, "menuItems", list.map((i) => i.id)); setItems((prev) => prev.map((i) => order.has(i.id) ? { ...i, sortOrder: order.get(i.id)! } : i)); }, "Sıralama kaydedilemedi.").finally(() => setMutating(false));
  };
  const downloadBackup = () => {
    const blob = new Blob([JSON.stringify({ version: 1, cafeId, cafeName, exportedAt: new Date().toISOString(), settings, categories, items }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${settings?.slug || "menu"}-yedek.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
          previewData={previewData!}
          onPublish={async () => {
            await setMenuEnabled(cafeId, true);
            setSettings((s) => (s ? { ...s, enabled: true } : s));
            setSettingsFormKey((k) => k + 1);
          }}
        />
      )}

      {settings && studioOpen && (
        <MenuStudio
          settings={settings}
          items={items}
          logoUrl={logoUrl}
          heroImage={heroImage}
          menuLive={menuLive}
          previewData={previewData!}
          onEditItem={(id) => {
            const item = items.find((i) => i.id === id);
            if (item) setEditing({ item, isNew: false });
          }}
          onSave={async (next) => {
            await saveSettings(cafeId, next);
            setSettings(next);
            setSavedSlug(next.slug);
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
            setItems((prev) => [...prev.filter((i) => !newItems.some((n) => n.id === i.id)), ...newItems]);
            if (pricesUpdatedAt) setSettings((s) => (s ? { ...s, pricesUpdatedAt } : s));
          }}
          logoUrl={logoUrl}
          heroImage={heroImage}
          settings={settings}
          savedSlug={savedSlug}
          items={items}
          categories={categories}
          previewData={previewData!}
          onFinish={async (next, _publish, pending, media) => {
            // saveSettings link adını da kaydeder (ilk kurulumda menuSlugs kaydı açılır).
            const updated = pending.items.length ? { ...next, pricesUpdatedAt: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }) } : next;
            const assets: { logoUrl?: string; heroImage?: string } = {};
            if (media.logoUrl) assets.logoUrl = await uploadMenuBranding(cafeId, media.logoUrl, "logoUrl");
            if (media.heroImage) assets.heroImage = await uploadMenuBranding(cafeId, media.heroImage, "heroImage");
            await saveSettings(cafeId, updated, pending, assets);
            if (assets.logoUrl) setLogoUrl(assets.logoUrl);
            if (assets.heroImage) setHeroImage(assets.heroImage);
            setSettings(updated);
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
                    <button type="button" onClick={() => { setFilter("review"); setQuery(""); setCategoryFilter(""); }} className="flex w-full items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-900">
                      <span>{reviewCount ? `${reviewCount} ürün kontrol bekliyor` : "Ürün bilgileriniz tamam"}</span><span className="text-xs font-semibold">Ürünleri incele →</span>
                    </button>
                    <details className="px-1 text-xs text-slate-500"><summary className="cursor-pointer">Eksik bilgi ayrıntıları</summary><p className="mt-2">{compliance.noIngredients} içindekiler · {compliance.noCalories} kalori · {compliance.noSource} hesap yöntemi eksik. Kalori Asistanı ile tamamlayabilirsiniz.</p></details>
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
                          Reçetenizi kontrol edin; kalori ve içerikleri birlikte tamamlayın.
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
                  <div className="flex flex-wrap items-center gap-2">
                    {items.length > 0 && <button type="button" className={smallBtnCls} onClick={downloadBackup}><Download className="h-3.5 w-3.5" />Yedek indir</button>}
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

                {items.length > 0 && <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_180px_190px]">
                    <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Ürün ara" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ürün ara…" className={`${inputCls} pl-9`} /></label>
                    <select aria-label="Kategori filtresi" className={inputCls} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="">Tüm kategoriler</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name.tr}</option>)}</select>
                    <select aria-label="Ürün durumu filtresi" className={inputCls} value={filter} onChange={(e) => setFilter(e.target.value as ProductFilter)}><option value="all">Tüm ürünler</option><option value="hidden">Gizli</option><option value="soldOut">Tükendi</option><option value="noPhoto">Fotoğrafsız</option><option value="review">Kontrol bekleyen</option>{showEn && <option value="translation">Çeviri eksik</option>}</select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{displayedItems.length} ürün</span>
                    <button type="button" className={smallBtnCls} onClick={() => setSelected(new Set(displayedItems.map((i) => i.id)))}>Listelenenleri seç</button>
                    {selected.size > 0 && <><button type="button" className={smallBtnCls} onClick={() => setSelected(new Set())}>Seçimi temizle</button><span>{displayedItems.filter((i) => selected.has(i.id)).length} seçili</span>{[{ label: "Göster", patch: { isVisible: true } }, { label: "Gizle", patch: { isVisible: false } }, { label: "Satışta", patch: { isAvailable: true } }, { label: "Tükendi", patch: { isAvailable: false } }].map(({ label, patch }) => <button key={label} type="button" disabled={mutating} className={smallBtnCls} onClick={() => bulkPatch(patch)}>{label}</button>)}</>}
                    {filtering && <button type="button" className={smallBtnCls} onClick={() => { setQuery(""); setFilter("all"); setCategoryFilter(""); }}>Filtreleri temizle</button>}
                  </div>
                </div>}

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
                    const shown = catItems.filter((i) => displayedItems.some((d) => d.id === i.id));
                    if (filtering && shown.length === 0) return null;
                    if (categoryForm?.id === cat.id) {
                      return <CategoryForm key={cat.id} value={categoryForm} showEn={showEn} onCancel={() => setCategoryForm(null)} onSubmit={submitCategory} />;
                    }
                    return (
                      <CategoryCard
                        key={cat.id}
                        category={cat}
                        items={catItems}
                        open={filtering || expanded.has(cat.id)}
                        isFirst={ci === 0}
                        isLast={ci === categories.length - 1}
                        onToggle={() => toggleCategory(cat.id)}
                        onMove={(dir) => moveCategory(ci, dir)}
                        onEdit={() => setCategoryForm(cat)}
                        onDelete={() => removeCategory(cat)}
                        onAddItem={() => openNewItem(cat.id)}
                        onDrop={(source) => dropCategory(source, cat.id)}
                        busy={mutating || filtering}
                      >
                        {shown.map((item) => (
                          <ItemRow
                            key={item.id}
                            item={item}
                            isFirst={filtering || mutating || catItems.indexOf(item) === 0}
                            isLast={filtering || mutating || catItems.indexOf(item) === catItems.length - 1}
                            onEdit={() => setEditing({ item, isNew: false })}
                            onMove={(dir) => moveItem(cat.id, catItems.indexOf(item), dir)}
                            onPatch={(patch) => quickPatch(item, patch)}
                            onDelete={() => removeItem(item)}
                            selected={selected.has(item.id)}
                            onSelect={() => setSelected((prev) => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}
                            onCopy={() => copyItem(item)}
                            onPrice={(price) => quickPrice(item, price)}
                            busy={mutating}
                            canDrag={!filtering && !mutating}
                            onDrop={(source) => dropItem(source, item)}
                          />
                        ))}
                      </CategoryCard>
                    );
                  })}
                </div>
                {filtering && displayedItems.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Bu filtrelerle eşleşen ürün yok.</p>}
              </div>
            </KeepAlive>

            <KeepAlive active={tab === "design"}>
              <div className="rounded-2xl bg-slate-50 p-5"><h3 className="font-bold text-slate-900">Kendi menünüzle tasarlayın</h3><p className="mt-1 text-sm text-slate-500">Tasarım, renkler ve açılış modu tek editörde.</p><button type="button" className={`${primaryBtnCls} mt-4`} onClick={() => setStudioOpen(true)}>Tasarım editörünü aç</button></div>
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
                <StatsCard cafeId={cafeId} items={items} categories={categories} onEditItem={(id) => { const item = items.find((i) => i.id === id); if (item) setEditing({ item, isNew: false }); }} />
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
                    ...s,
                  };
                  if (next.enabled && !items.some((i) => i.isVisible && !i.priceNeedsReview)) throw new Error("Yayınlamak için en az bir görünür ürün ekleyin.");
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
  onDrop, busy,
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
  onDrop: (source: string) => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  const hidden = items.filter((i) => !i.isVisible).length;
  const soldOut = items.filter((i) => !i.isAvailable).length;
  const incomplete = items.filter((i) => i.ingredients.length === 0 || i.calories === undefined || i.allergensConfirmed === false).length;
  const thumbs = items.filter((i) => i.imageUrl).slice(0, 4);

  return (
    <div onDragOver={(e) => { if (!busy && e.dataTransfer.types.includes("application/x-menu-category")) e.preventDefault(); }} onDrop={(e) => { const source = e.dataTransfer.getData("application/x-menu-category"); if (source && !busy) { e.preventDefault(); onDrop(source); } }} className={`overflow-hidden rounded-2xl border bg-white transition ${open ? "border-slate-300 shadow-sm" : "border-slate-200 hover:border-slate-300"}`}>
      <div className="flex items-center gap-2 py-2.5 pl-3 pr-2 sm:pl-4">
        <button type="button" draggable={!busy} disabled={busy} onDragStart={(e) => { e.dataTransfer.setData("application/x-menu-category", category.id); e.dataTransfer.effectAllowed = "move"; }} aria-label={`${category.name.tr} kategorisini sürükleyerek sırala`} className="cursor-grab p-1 text-slate-400"><GripVertical className="h-4 w-4" /></button>
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
  selected, onSelect, onCopy, onPrice, busy,
  onDrop, canDrag,
}: {
  item: MenuItem;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
  onPatch: (patch: Partial<Pick<MenuItem, "isAvailable" | "isVisible">>) => void;
  onDelete: () => void;
  selected: boolean;
  onSelect: () => void;
  onCopy: () => void;
  onPrice: (price: number) => Promise<void>;
  busy: boolean;
  onDrop: (source: string) => void;
  canDrag: boolean;
}) {
  const [priceOpen, setPriceOpen] = useState(false);
  const [price, setPrice] = useState(String(item.price));
  const [priceError, setPriceError] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);
  const missing = [
    item.ingredients.length === 0 && "içindekiler",
    item.calories === undefined && "kalori",
    item.allergensConfirmed === false && "alerjen onayı",
    item.priceNeedsReview && "fiyat",
  ].filter(Boolean);
  const alcohol = item.ingredients.some((i) => i.alcohol);

  return (
    <li onDragOver={(e) => { if (canDrag && e.dataTransfer.types.includes("application/x-menu-item")) e.preventDefault(); }} onDrop={(e) => { const source = e.dataTransfer.getData("application/x-menu-item"); if (source && canDrag) { e.preventDefault(); e.stopPropagation(); onDrop(source); } }} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${item.isVisible ? "" : "bg-slate-50/70"}`}>
      <button type="button" draggable={canDrag} disabled={!canDrag} onDragStart={(e) => { e.dataTransfer.setData("application/x-menu-item", item.id); e.dataTransfer.effectAllowed = "move"; }} aria-label={`${item.name.tr} ürününü sürükleyerek sırala`} className="cursor-grab p-1 text-slate-400"><GripVertical className="h-4 w-4" /></button>
      <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`${item.name.tr} seç`} className="h-4 w-4 accent-emerald-600" />
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

      {priceOpen ? <form className="flex max-w-full flex-wrap items-center gap-1" onSubmit={async (e) => { e.preventDefault(); setPriceError(""); setSavingPrice(true); try { if (!price.trim()) throw new Error("Fiyat girin."); await onPrice(Number(price)); setPriceOpen(false); } catch (err) { setPriceError(err instanceof Error ? err.message : "Fiyat kaydedilemedi."); } finally { setSavingPrice(false); } }}>
        <input aria-label={`${item.name.tr} fiyatı`} type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputCls} w-24`} autoFocus />
        <button className={smallBtnCls} disabled={savingPrice || busy}>Kaydet</button><button type="button" className={smallBtnCls} disabled={savingPrice} onClick={() => setPriceOpen(false)}>Vazgeç</button>{priceError && <span className="w-full text-xs text-red-600" role="alert">{priceError}</span>}
      </form> : <button type="button" className={smallBtnCls} disabled={busy} onClick={() => { setPrice(String(item.price)); setPriceOpen(true); }}>₺ Fiyat</button>}
      <button
        type="button"
        disabled={busy}
        onClick={() => onPatch({ isAvailable: !item.isAvailable })}
        className={`rounded-full px-3 py-1 text-xs font-bold transition ${
          item.isAvailable ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-slate-800 text-white hover:bg-slate-700"
        }`}
      >
        {item.isAvailable ? "Satışta" : "Tükendi"}
      </button>
      <IconBtn label={item.isVisible ? "Menüden gizle" : "Menüde göster"} disabled={busy} onClick={() => onPatch({ isVisible: !item.isVisible })}>
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
      <IconBtn label="Ürünü kopyala" onClick={onCopy}><Copy className="h-4 w-4" /></IconBtn>
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
  onSubmit: (c: MenuCategory) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [cat, setCat] = useState(value);
  const [timed, setTimed] = useState(Boolean(value.servedBetween));
  const [saving, setSaving] = useState(false);
  const cancel = () => {
    if (saving) return;
    if (JSON.stringify(cat) !== JSON.stringify(value) && !window.confirm("Kaydedilmemiş kategori değişiklikleri kaybolacak. Çıkılsın mı?")) return;
    onCancel();
  };

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
        <button type="button" disabled={saving} className={primaryBtnCls} onClick={async () => { setSaving(true); try { await onSubmit(cat); } finally { setSaving(false); } }}>
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <button type="button" disabled={saving} className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-white" onClick={cancel}>
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
