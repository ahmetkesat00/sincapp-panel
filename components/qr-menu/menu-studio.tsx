"use client";

import { Check, ImageOff, LoaderCircle, Moon, MousePointerClick, RotateCcw, Sun, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MENU_BASE_URL, MENU_DESIGNS, type DesignGroup, type MenuItem, type MenuLayout, type MenuTheme, type QrMenuSettings } from "@/lib/qr-menu/types";
import { designWarnings, paletteFromLogo, photoStats, type LogoPalette } from "@/lib/qr-menu/wizard";
import { DesignWarnings, GroupTabs } from "./menu-wizard";
import { primaryBtnCls, smallBtnCls } from "./ui";
import MenuPreview, { type PreviewData } from "./menu-preview";
import { useDialog } from "./use-dialog";
import { contrastOnWhite } from "@/lib/qr-menu/qr-style";

type Props = {
  settings: QrMenuSettings;
  items: MenuItem[];
  logoUrl?: string;
  heroImage?: string;
  menuLive: boolean;
  /** Önizlemede ürüne dokunulunca: editör ürün formunu açar. */
  onEditItem: (itemId: string) => void;
  /** Tasarım ve renkleri kaydeder. */
  onSave: (next: QrMenuSettings) => Promise<void>;
  onClose: () => void;
  previewData: PreviewData;
};

const designOf = (id: MenuLayout) => MENU_DESIGNS.find((d) => d.id === id) ?? MENU_DESIGNS[0];
const sameTheme = (a: MenuTheme, b: MenuTheme) => a.primary === b.primary && a.primaryDark === b.primaryDark && a.accent === b.accent;

/**
 * Menüyü düzenle: kafenin kendi menüsü telefon görünümünde; tasarım ve renkler anında önizlenir,
 * "yayınla" denene kadar kaydedilmez. Önizlemede ürüne dokununca ürün formu açılır.
 */
export default function MenuStudio({ settings, items, logoUrl, heroImage, menuLive, onEditItem, onSave, onClose, previewData }: Props) {
  const initialLayout: MenuLayout = settings.layout ?? "classic";
  const [layout, setLayout] = useState<MenuLayout>(initialLayout);
  const [theme, setTheme] = useState<MenuTheme>(settings.theme);
  const [mode, setMode] = useState<"gunduz" | "gece">(settings.defaultMode === "dark" || (!settings.defaultMode && "defaultDark" in designOf(initialLayout)) ? "gece" : "gunduz");
  const [groupTab, setGroupTab] = useState<DesignGroup>(designOf(initialLayout).group);
  const [logo, setLogo] = useState<LogoPalette | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [defaultMode, setDefaultMode] = useState(settings.defaultMode);
  const [darkToggle, setDarkToggle] = useState(settings.darkToggle !== false);
  const [mobileTab, setMobileTab] = useState<"preview" | "controls">("controls");
  const stats = useMemo(() => photoStats(items, heroImage), [items, heroImage]);
  const withoutPhoto = items.filter((i) => i.isVisible && !i.imageUrl);
  const dirty = layout !== initialLayout || !sameTheme(theme, settings.theme) || defaultMode !== settings.defaultMode || darkToggle !== (settings.darkToggle !== false);

  useEffect(() => {
    if (!logoUrl) return;
    let active = true;
    paletteFromLogo(logoUrl)
      .then((p) => active && setLogo(p))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [logoUrl]);

  // Renk kutusu sürüklenirken önizleme sürekli yüklenmesin.
  const [previewTheme, setPreviewTheme] = useState(theme);
  useEffect(() => {
    const t = setTimeout(() => setPreviewTheme(theme), 350);
    return () => clearTimeout(t);
  }, [theme]);



  const close = () => {
    if (saving) return;
    if (dirty && !window.confirm("Kaydedilmemiş tasarım/renk değişiklikleri kaybolacak. Çıkılsın mı?")) return;
    onClose();
  };
  const dialogRef = useDialog(close);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave({ ...settings, layout, layoutDraft: undefined, theme, defaultMode, darkToggle });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
      setError("Kaydedilemedi, tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  const presets: { label: string; theme: MenuTheme }[] = [
    ...(logo ? [{ label: logo.monochrome ? "Logonuza uygun (sade)" : "Logonuza uygun", theme: logo.theme }] : []),
    { label: `${designOf(layout).name} hazır renkleri`, theme: designOf(layout).theme },
    { label: "Kaydedilen renkler", theme: settings.theme },
  ];

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Tasarım editörü" tabIndex={-1} className="fixed inset-0 z-40 flex flex-col bg-slate-100 outline-none">
      {/* ── Üst çubuk ── */}
      <header className="relative flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:gap-3 sm:px-6">
        <div className="w-full min-w-0 pr-10 sm:w-auto sm:flex-1 sm:pr-0">
          <h2 className="text-base font-bold text-slate-900">Tasarım editörü</h2>
          <p className="text-xs text-slate-500">
            {dirty ? (
              <span className="font-semibold text-amber-700">Kaydedilmemiş değişiklik var · müşterileriniz henüz eski hâlini görüyor</span>
            ) : (
              "Tasarım ve renkleri değiştirin; ürünü düzenlemek için önizlemede üstüne dokunun."
            )}
          </p>
        </div>
        <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs font-semibold">
          <span className="px-2 py-1 text-slate-400">Önizleme</span>
          {(
            [
              ["gunduz", "Gündüz", Sun],
              ["gece", "Gece", Moon],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 transition ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
        {dirty && (
          <button
            type="button"
            className={smallBtnCls}
            onClick={() => {
              setLayout(initialLayout);
              setTheme(settings.theme);
              setDefaultMode(settings.defaultMode);
              setDarkToggle(settings.darkToggle !== false);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Geri al
          </button>
        )}
        <button type="button" className={primaryBtnCls} disabled={!dirty || saving} onClick={save}>
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saved ? "Kaydedildi" : menuLive ? "Değişiklikleri yayınla" : "Kaydet"}
        </button>
        <button type="button" onClick={close} aria-label="Kapat" className="absolute right-3 top-3 rounded-xl p-2 text-slate-500 hover:bg-slate-100 sm:static">
          <X className="h-5 w-5" />
        </button>
      </header>
      {error && <p className="bg-red-50 px-6 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2 border-b bg-white p-2 lg:hidden">{(["controls", "preview"] as const).map((value) => <button type="button" key={value} aria-pressed={mobileTab === value} onClick={() => setMobileTab(value)} className={`flex-1 rounded-xl py-2 text-sm font-semibold ${mobileTab === value ? "bg-emerald-50 text-emerald-800" : "text-slate-500"}`}>{value === "controls" ? "Düzenle" : "Önizle"}</button>)}</div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_420px]">
        {/* ── Telefon önizlemesi ── */}
        <div className={`${mobileTab === "preview" ? "flex" : "hidden"} min-h-0 items-center justify-center overflow-auto p-4 sm:p-6 lg:flex`}>
          <div className="relative h-[min(800px,calc(100dvh-200px))] w-[min(390px,calc(100vw-32px))] shrink-0 overflow-hidden rounded-[48px] border-[12px] border-slate-900 bg-white shadow-2xl">
            <MenuPreview data={{ ...previewData, cafe: { ...previewData.cafe, qrMenu: { ...settings, layout, theme: previewTheme, defaultMode: mode === "gece" ? "dark" : "light" } } }} onEditItem={onEditItem} />

          </div>
        </div>

        {/* ── Düzenleme paneli ── */}
        <aside className={`${mobileTab === "controls" ? "block" : "hidden"} min-h-0 space-y-6 overflow-y-auto border-l border-slate-200 bg-white p-5 lg:block`}>
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Tasarım</h3>
            <GroupTabs value={groupTab} onChange={setGroupTab} />
            <div className="grid grid-cols-3 gap-2">
              {MENU_DESIGNS.filter((d) => d.group === groupTab).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setLayout(d.id)}
                  aria-pressed={layout === d.id}
                  className={`overflow-hidden rounded-xl border text-left transition ${layout === d.id ? "border-emerald-500 ring-2 ring-emerald-100" : "border-slate-200 hover:border-slate-300"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${MENU_BASE_URL}/designs/${d.id}-light.jpg`} alt="" className="aspect-[3/4] w-full object-cover object-top" />
                  <span className="flex items-center justify-between gap-1 px-2 py-1.5 text-[11px] font-semibold text-slate-800">
                    <span className="truncate">{d.name}</span>
                    {d.id === initialLayout && <span className="shrink-0 text-[9px] font-bold uppercase text-emerald-700">{menuLive ? "Yayında" : "Kayıtlı"}</span>}
                  </span>
                </button>
              ))}
            </div>
            <DesignWarnings warnings={designWarnings(layout, designOf(layout).group, stats)} />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Renkler</h3>
            <div className="space-y-2">
              {presets.map((p) => {
                const active = sameTheme(p.theme, theme);
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setTheme(p.theme)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition ${active ? "border-emerald-500 bg-emerald-50/60" : "border-slate-200 hover:border-slate-300"}`}
                  >
                    <span className="flex -space-x-1.5">
                      {[p.theme.primary, p.theme.primaryDark, p.theme.accent].map((c, i) => (
                        <span key={i} className="h-6 w-6 rounded-full border-2 border-white shadow-sm" style={{ background: c }} />
                      ))}
                    </span>
                    <span className="flex-1 font-medium text-slate-800">{p.label}</span>
                    {active && <Check className="h-4 w-4 text-emerald-600" />}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["primary", "Ana"],
                  ["primaryDark", "Koyu"],
                  ["accent", "Vurgu"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700">
                  <input type="color" value={theme[key]} onChange={(e) => setTheme({ ...theme, [key]: e.target.value })} className="h-7 w-8 cursor-pointer rounded border border-slate-200" />
                  {label}
                </label>
              ))}
            </div>
            {contrastOnWhite(theme.primary) < 4.5 && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Ana renk açık: beyaz buton yazıları zor okunabilir. Daha koyu bir ton seçin.</p>}
          </section>

          <section className="space-y-3"><h3 className="text-sm font-bold text-slate-900">Menü açılış modu</h3><select aria-label="Menü açılış modu" value={defaultMode ?? ""} onChange={(e) => setDefaultMode(e.target.value ? e.target.value as "light" | "dark" : undefined)} className="w-full rounded-xl border p-2 text-sm"><option value="">Tasarımın varsayılanı</option><option value="light">Gündüz</option><option value="dark">Gece</option></select><label className="flex gap-2 text-sm text-slate-600"><input type="checkbox" checked={darkToggle} onChange={(e) => setDarkToggle(e.target.checked)} />Müşteri gece modunu değiştirebilsin</label></section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Ürünler ve fotoğraflar</h3>
            <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-snug text-slate-600">
              <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              Ürüne dokunarak düzenleyin. Ürün kaydı menüye yansır; tasarım değişiklikleri üstteki yayınlama düğmesini bekler.
            </p>
            {withoutPhoto.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-700">Fotoğrafı olmayan ürünler ({withoutPhoto.length})</p>
                <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                  {withoutPhoto.map((i) => (
                    <li key={i.id}>
                      <button type="button" onClick={() => onEditItem(i.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                        <ImageOff className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                        <span className="min-w-0 flex-1 truncate">{i.name.tr}</span>
                        <span className="text-xs font-semibold text-emerald-700">Ekle</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <p className="text-[11px] leading-snug text-slate-400">
            Logo ve kapak fotoğrafı: İşletme Yönetimi · Menü linki, Wi-Fi ve diller: QR Menü → Ayarlar.
          </p>
        </aside>
      </div>
    </div>
  );
}
