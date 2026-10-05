"use client";

import { Check, ChevronLeft, ChevronRight, ImageOff, LoaderCircle, Rocket, Sparkles, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { isValidSlug, slugify } from "@/lib/qr-menu/firestore";
import { MENU_BASE_URL, MENU_DESIGNS, type MenuCategory, type MenuItem, type MenuLayout, type MenuTheme, type QrMenuSettings } from "@/lib/qr-menu/types";
import { paletteFromLogo, suggestDesigns, themeQuery, type LogoPalette } from "@/lib/qr-menu/wizard";
import MenuImport from "./menu-import";
import { primaryBtnCls, smallBtnCls } from "./ui";

type Props = {
  cafeId: string;
  cafeName: string;
  /** Menü müşteriye açık mı (içe aktarılan ürünler o zaman gizli eklenir). */
  menuLive: boolean;
  /** İçe aktarılan kategori/ürünleri editörün listesine ekler. */
  onImported: (categories: MenuCategory[], items: MenuItem[], pricesUpdatedAt: string | null) => void;
  logoUrl?: string;
  settings: QrMenuSettings;
  savedSlug: string | null;
  items: MenuItem[];
  categories: MenuCategory[];
  /** Seçimleri kaydeder; publish: menüyü de yayına al. */
  onFinish: (next: QrMenuSettings, publish: boolean) => Promise<void>;
  /** Ürün yoksa sihirbaz bitince ürün eklemeye yönlendirir. */
  onGoToProducts: () => void;
  onClose: () => void;
};

type ColorChoice = "logo" | "design" | "custom";

const STEPS = ["Başlangıç", "Tasarım", "Renkler", "Yayına al"] as const;

const designOf = (id: MenuLayout) => MENU_DESIGNS.find((d) => d.id === id) ?? MENU_DESIGNS[0];

/**
 * Menü Sihirbazı: sağdan açılan, adım adım kurulum. Logo ve içerikten tasarım ile renk önerir,
 * sonunda tek seferde kaydeder (ve istenirse yayına alır).
 */
export default function MenuWizard({ cafeId, cafeName, menuLive, onImported, logoUrl, settings, savedSlug, items, categories, onFinish, onGoToProducts, onClose }: Props) {
  const visibleCount = items.filter((i) => i.isVisible).length;
  const photoCount = items.filter((i) => i.isVisible && i.imageUrl).length;
  const suggestions = useMemo(() => suggestDesigns(items, categories), [items, categories]);

  const [step, setStep] = useState(0);
  const [slug, setSlug] = useState(savedSlug ?? (settings.slug || slugify(cafeName)));
  const [layout, setLayout] = useState<MenuLayout>(settings.layout ?? suggestions[0].id);
  const [showAllDesigns, setShowAllDesigns] = useState(false);
  const [logo, setLogo] = useState<LogoPalette | null>(null);
  const [logoState, setLogoState] = useState<"idle" | "loading" | "error">(logoUrl ? "loading" : "idle");
  const [colorChoice, setColorChoice] = useState<ColorChoice>(logoUrl ? "logo" : "design");
  const [custom, setCustom] = useState<MenuTheme>(settings.theme);
  const [saving, setSaving] = useState<"" | "save" | "publish">("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<null | "saved" | "published">(null);

  useEffect(() => {
    if (!logoUrl) return;
    let active = true;
    paletteFromLogo(logoUrl)
      .then((p) => active && (setLogo(p), setLogoState("idle")))
      .catch((err) => {
        console.error("Logo color error:", err);
        if (active) {
          setLogoState("error");
          setColorChoice((c) => (c === "logo" ? "design" : c));
        }
      });
    return () => {
      active = false;
    };
  }, [logoUrl]);

  const theme: MenuTheme = colorChoice === "logo" && logo ? logo.theme : colorChoice === "custom" ? custom : designOf(layout).theme;

  // Renk kutusu sürüklenirken önizleme her an yeniden yüklenmesin.
  const [previewTheme, setPreviewTheme] = useState(theme);
  const themeKey = JSON.stringify(theme);
  useEffect(() => {
    const t = setTimeout(() => setPreviewTheme(JSON.parse(themeKey)), 350);
    return () => clearTimeout(t);
  }, [themeKey]);

  // Ürün varsa ve link kayıtlıysa kafenin kendi menüsü, yoksa örnek menü.
  const ownPreview = savedSlug !== null && visibleCount > 0;
  const previewSrc = `${MENU_BASE_URL}/${ownPreview ? `${savedSlug}?onizleme=1&` : "ornek?"}tasarim=${layout}&${themeQuery(previewTheme)}`;

  const slugOk = isValidSlug(slug);
  const canNext = step !== 0 || slugOk;

  const finish = async (publish: boolean) => {
    setSaving(publish ? "publish" : "save");
    setError("");
    try {
      await onFinish({ ...settings, slug, layout, layoutDraft: undefined, theme, enabled: publish ? true : settings.enabled }, publish);
      setDone(publish ? "published" : "saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi, tekrar deneyin.");
    } finally {
      setSaving("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Menü Sihirbazı"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[600px] flex-col bg-white shadow-2xl"
      >
        {/* ── Başlık ve adımlar ── */}
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-600 text-white">
                <Wand2 className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-bold text-slate-900">Menü Sihirbazı</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
          {!done && (
            <ol className="mt-4 flex gap-2">
              {STEPS.map((label, i) => (
                <li key={label} className="flex-1">
                  <div className={`h-1.5 rounded-full ${i <= step ? "bg-emerald-500" : "bg-slate-200"}`} />
                  <p className={`mt-1.5 text-[11px] font-semibold ${i === step ? "text-emerald-700" : "text-slate-400"}`}>
                    {i + 1}. {label}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* ── İçerik ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {done ? (
            <Finished published={done === "published"} hasProducts={visibleCount > 0} onGoToProducts={onGoToProducts} onClose={onClose} />
          ) : step === 0 ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Menünüzü birkaç adımda hazırlayalım</h3>
                <p className="mt-1 text-sm text-slate-500">Logonuza ve ürünlerinize bakıp size uygun tasarım ve renkleri önereceğiz.</p>
              </div>

              <section className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">Logonuz</p>
                <div className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4">
                  <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
                    ) : (
                      <ImageOff className="h-5 w-5 text-slate-300" />
                    )}
                  </div>
                  <div className="min-w-0 text-sm">
                    {logoUrl ? (
                      <>
                        <p className="font-medium text-slate-900">Logonuz hazır</p>
                        {logoState === "loading" && <p className="text-xs text-slate-500">Renkleri inceleniyor…</p>}
                        {logo && !logo.monochrome && <Swatches colors={logo.swatches} label="Logonuzdaki renkler" />}
                        {logo?.monochrome && <p className="text-xs text-slate-500">Logonuz siyah-beyaz; renk adımında sade tonlar önereceğiz.</p>}
                        {logoState === "error" && <p className="text-xs text-amber-700">Logo renkleri okunamadı; tasarımın hazır renklerini önereceğiz.</p>}
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-slate-900">Logo yüklenmemiş</p>
                        <p className="text-xs text-slate-500">
                          &quot;İşletme Yönetimi&quot; sekmesinden logonuzu ekleyin; menünün renklerini logonuza göre önerebilelim.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">Menünüz</p>
                <MenuImport
                  cafeId={cafeId}
                  existingCategoryCount={categories.length}
                  existingItemCount={items.length}
                  menuLive={menuLive}
                  onImported={onImported}
                />
                {items.length > 0 ? (
                  <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <p className="text-sm text-slate-700">
                      {categories.length} kategori ve {items.length} ürününüz var
                      {photoCount ? ` (${photoCount} tanesi fotoğraflı)` : ""}. Yüklemeden de devam edebilirsiniz.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Elinizde menü dosyası yoksa &quot;Devam&quot; ile geçin; ürünleri sihirbazdan sonra elle ekleyebilirsiniz.
                  </p>
                )}
              </section>

              {savedSlug === null && (
                <section className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">Menü linkiniz</p>
                  <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-100">
                    <span className="shrink-0 bg-slate-50 px-3 py-2 text-sm text-slate-500">{MENU_BASE_URL.replace(/^https?:\/\//, "")}/</span>
                    <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} className="min-w-0 flex-1 px-2 py-2 text-sm outline-none" />
                  </div>
                  {!slugOk && <p className="text-xs font-medium text-red-600">Sadece küçük harf, rakam ve tire; en az 3 karakter.</p>}
                </section>
              )}
            </div>
          ) : step === 1 ? (
            <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
              <div className="space-y-3">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Size önerdiğimiz tasarımlar</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {visibleCount > 0 ? "Ürünlerinize ve fotoğraflarınıza göre seçtik." : "Ürün ekledikçe öneriler değişebilir."}
                  </p>
                </div>
                {suggestions.map((s, i) => (
                  <DesignOption key={s.id} id={s.id} reason={s.reason} best={i === 0} selected={layout === s.id} onSelect={() => setLayout(s.id)} />
                ))}
                <button type="button" onClick={() => setShowAllDesigns((v) => !v)} className="text-sm font-semibold text-emerald-700 hover:underline">
                  {showAllDesigns ? "Diğer tasarımları gizle" : "Diğer tasarımları göster"}
                </button>
                {showAllDesigns &&
                  MENU_DESIGNS.filter((d) => !suggestions.some((s) => s.id === d.id)).map((d) => (
                    <DesignOption key={d.id} id={d.id} reason={d.description} selected={layout === d.id} onSelect={() => setLayout(d.id)} />
                  ))}
              </div>
              <PhonePreview src={previewSrc} own={ownPreview} />
            </div>
          ) : step === 2 ? (
            <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
              <div className="space-y-3">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Renkleri seçin</h3>
                  <p className="mt-1 text-sm text-slate-500">Butonlar, başlıklar ve vurgular bu renklerle boyanır.</p>
                </div>
                <ColorOption
                  selected={colorChoice === "logo"}
                  disabled={!logo}
                  title="Logonuza uygun"
                  detail={
                    logo
                      ? logo.monochrome
                        ? "Logonuz siyah-beyaz; sade ve şık tonlar."
                        : "Logonuzdaki renklerden üretildi."
                      : logoState === "loading"
                        ? "Logonuz inceleniyor…"
                        : "Logo olmadığı için kullanılamıyor."
                  }
                  theme={logo?.theme}
                  badge="Önerilen"
                  onSelect={() => setColorChoice("logo")}
                />
                <ColorOption
                  selected={colorChoice === "design"}
                  title="Tasarımın hazır renkleri"
                  detail={`${designOf(layout).name} tasarımı için hazırladığımız renkler.`}
                  theme={designOf(layout).theme}
                  onSelect={() => setColorChoice("design")}
                />
                <ColorOption
                  selected={colorChoice === "custom"}
                  title="Kendim seçeyim"
                  detail="Üç rengi kendiniz belirleyin."
                  theme={custom}
                  onSelect={() => setColorChoice("custom")}
                />
                {colorChoice === "custom" && (
                  <div className="flex flex-wrap gap-4 rounded-2xl bg-slate-50 p-4">
                    {(
                      [
                        ["primary", "Ana", "Butonlar, seçili kategori"],
                        ["primaryDark", "Koyu", "Üst bant, başlık zeminleri"],
                        ["accent", "Vurgu", "Rozetler, küçük işaretler"],
                      ] as const
                    ).map(([key, label, hint]) => (
                      <label key={key} className="flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="color"
                          value={custom[key]}
                          onChange={(e) => setCustom({ ...custom, [key]: e.target.value })}
                          className="h-9 w-11 cursor-pointer rounded-lg border border-slate-200"
                        />
                        <span>
                          <span className="block font-semibold text-slate-800">{label}</span>
                          {hint}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <PhonePreview src={previewSrc} own={ownPreview} />
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Her şey hazır</h3>
                  <p className="mt-1 text-sm text-slate-500">Seçimlerinizi kontrol edin.</p>
                </div>
                <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200 text-sm">
                  <SummaryRow label="Menü linki" value={`${MENU_BASE_URL.replace(/^https?:\/\//, "")}/${slug}`} />
                  <SummaryRow label="Tasarım" value={designOf(layout).name} />
                  <SummaryRow label="Renkler" value={<Swatches colors={[theme.primary, theme.primaryDark, theme.accent]} />} />
                  <SummaryRow label="Ürünler" value={visibleCount > 0 ? `${categories.length} kategori · ${visibleCount} ürün` : "Henüz yok"} />
                </dl>
                {visibleCount === 0 && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                    Menünüzü yayına almak için en az bir ürün ekleyin. Şimdi seçimlerinizi kaydedip ürün eklemeye geçebilirsiniz.
                  </p>
                )}
                {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              </div>
              <PhonePreview src={previewSrc} own={ownPreview} />
            </div>
          )}
        </div>

        {/* ── Alt düğmeler ── */}
        {!done && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
            <button type="button" className={smallBtnCls} onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
              <ChevronLeft className="h-3.5 w-3.5" /> {step === 0 ? "Vazgeç" : "Geri"}
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" className={primaryBtnCls} disabled={!canNext} onClick={() => setStep(step + 1)}>
                Devam <ChevronRight className="h-4 w-4" />
              </button>
            ) : visibleCount > 0 && !settings.enabled ? (
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={smallBtnCls} disabled={!!saving} onClick={() => finish(false)}>
                  {saving === "save" ? "Kaydediliyor…" : "Sadece kaydet"}
                </button>
                <button type="button" className={primaryBtnCls} disabled={!!saving} onClick={() => finish(true)}>
                  <Rocket className="h-4 w-4" /> {saving === "publish" ? "Yayına alınıyor…" : "Kaydet ve yayına al"}
                </button>
              </div>
            ) : (
              <button type="button" className={primaryBtnCls} disabled={!!saving} onClick={() => finish(false)}>
                <Check className="h-4 w-4" /> {saving ? "Kaydediliyor…" : settings.enabled ? "Kaydet (menüye hemen yansır)" : "Kaydet"}
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

/** Seçilen tasarım ve renklerle küçük telefon önizlemesi (menü telefon genişliğinde, 320 px, çizilip küçültülür). */
function PhonePreview({ src, own }: { src: string; own: boolean }) {
  const [loading, setLoading] = useState(true);
  useEffect(() => setLoading(true), [src]);
  return (
    <div className="mx-auto w-[240px] shrink-0">
      <div className="relative h-[480px] w-[240px] overflow-hidden rounded-[32px] border-8 border-slate-900 bg-slate-100 shadow-lg">
        <iframe
          key={src}
          src={src}
          title="Menü önizleme"
          onLoad={() => setLoading(false)}
          className="h-[663px] w-[320px] origin-top-left scale-[0.7] border-0"
        />
        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-white/60">
            <LoaderCircle className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">{own ? "Kendi menünüz" : "Örnek menü"} · kaydırabilirsiniz</p>
    </div>
  );
}

function DesignOption({ id, reason, best, selected, onSelect }: { id: MenuLayout; reason: string; best?: boolean; selected: boolean; onSelect: () => void }) {
  const design = designOf(id);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition ${
        selected ? "border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-100" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${MENU_BASE_URL}/designs/${id}-light.jpg`} alt="" className="h-20 w-14 shrink-0 rounded-lg object-cover object-top" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900">{design.name}</span>
          {best && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              <Sparkles className="h-3 w-3" /> En uygun
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-slate-500">{reason}</span>
      </span>
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300"}`}>
        {selected && <Check className="h-3 w-3" />}
      </span>
    </button>
  );
}

function ColorOption({
  selected,
  disabled,
  title,
  detail,
  theme,
  badge,
  onSelect,
}: {
  selected: boolean;
  disabled?: boolean;
  title: string;
  detail: string;
  theme?: MenuTheme;
  badge?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        selected ? "border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-100" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <span className="flex shrink-0 -space-x-2">
        {(theme ? [theme.primary, theme.primaryDark, theme.accent] : ["#e2e8f0", "#cbd5e1", "#f1f5f9"]).map((c, i) => (
          <span key={i} className="h-8 w-8 rounded-full border-2 border-white shadow-sm" style={{ background: c }} />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900">{title}</span>
          {badge && !disabled && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{badge}</span>}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>
      </span>
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300"}`}>
        {selected && <Check className="h-3 w-3" />}
      </span>
    </button>
  );
}

function Swatches({ colors, label }: { colors: string[]; label?: string }) {
  return (
    <span className="mt-1 inline-flex items-center gap-1.5">
      {colors.map((c, i) => (
        <span key={i} className="h-4 w-4 rounded-full border border-slate-200" style={{ background: c }} title={c} />
      ))}
      {label && <span className="text-xs text-slate-500">{label}</span>}
    </span>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function Finished({ published, hasProducts, onGoToProducts, onClose }: { published: boolean; hasProducts: boolean; onGoToProducts: () => void; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700">
        <Check className="h-7 w-7" />
      </span>
      <h3 className="mt-4 text-xl font-bold text-slate-900">{published ? "Menünüz yayında!" : "Seçimleriniz kaydedildi"}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        {published
          ? "Şimdi QR kodlarınızı basıp masalara koyabilirsiniz."
          : hasProducts
            ? "Hazır olduğunuzda kurulum listesinden menünüzü yayına alabilirsiniz."
            : "Şimdi ürünlerinizi ekleyin; ilk üründen sonra menünüzü yayına alabilirsiniz."}
      </p>
      <div className="mt-6 flex gap-2">
        {!hasProducts && (
          <button type="button" className={primaryBtnCls} onClick={onGoToProducts}>
            Ürün eklemeye geç
          </button>
        )}
        <button type="button" className={hasProducts ? primaryBtnCls : smallBtnCls} onClick={onClose}>
          Tamam
        </button>
      </div>
    </div>
  );
}
