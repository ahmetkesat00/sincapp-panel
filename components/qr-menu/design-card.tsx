"use client";

import { Check, ChevronLeft, ChevronRight, Eye, Moon, Rocket, Sun, Trash2, X } from "lucide-react";
import { useState } from "react";
import { publishDesign, saveDarkModeSettings, saveDesignDraft } from "@/lib/qr-menu/firestore";
import { MENU_BASE_URL, MENU_DESIGNS, type MenuLayout, type QrMenuSettings } from "@/lib/qr-menu/types";
import { Toggle, primaryBtnCls, smallBtnCls } from "./ui";

type Props = {
  cafeId: string;
  settings: QrMenuSettings;
  /** Önizleme menü linkiyle açılır; ayarlar en az bir kez kaydedilmiş olmalı. */
  savedSlug: string | null;
  /** Ürün yoksa önizleme örnek menüyle açılır (boş menüde tasarım anlaşılmıyor). */
  hasItems: boolean;
  onChange: (patch: Partial<QrMenuSettings>) => void;
};

type Mode = "light" | "dark";

const designOf = (id: MenuLayout) => MENU_DESIGNS.find((d) => d.id === id) ?? MENU_DESIGNS[0];
const thumbUrl = (id: MenuLayout, mode: Mode) => `${MENU_BASE_URL}/designs/${id}-${mode}.jpg`;

export default function DesignCard({ cafeId, settings, savedSlug, hasItems, onChange }: Props) {
  const live: MenuLayout = settings.layout ?? "classic";
  const draft = settings.layoutDraft && settings.layoutDraft !== live ? settings.layoutDraft : null;
  const [thumbMode, setThumbMode] = useState<Mode>("light");
  const [previewing, setPreviewing] = useState<MenuLayout | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      console.error(err);
      setError("Kaydedilemedi, tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = (id: MenuLayout) =>
    run(async () => {
      // Yayındakiyle aynıysa taslak tutmaya gerek yok.
      const next = id === live ? null : id;
      await saveDesignDraft(cafeId, next);
      onChange({ layoutDraft: next ?? undefined });
    });

  const publish = (id: MenuLayout) =>
    run(async () => {
      await publishDesign(cafeId, id);
      onChange({ layout: id, layoutDraft: undefined });
      setPreviewing(null);
    });

  const darkToggle = settings.darkToggle !== false;
  const saveDark = (toggle: boolean, mode: Mode | null) =>
    run(async () => {
      await saveDarkModeSettings(cafeId, toggle, mode);
      onChange({ darkToggle: toggle, defaultMode: mode ?? undefined });
    });

  return (
    <div className="space-y-5 rounded-2xl border border-slate-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Menü tasarımı</h3>
          <p className="text-xs text-slate-500">
            Bir tasarıma tıklayın, menünüzü o tasarımla önizleyin. Taslak olarak kaydedebilir, hazır olduğunuzda yayınlayabilirsiniz.
          </p>
        </div>
        <ModeSwitch value={thumbMode} onChange={setThumbMode} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
          <Check className="h-3.5 w-3.5" /> Yayında: {designOf(live).name}
        </span>
      </div>

      {draft && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-amber-900">
            <span className="font-bold">Taslak: {designOf(draft).name}</span> — müşterileriniz henüz eski tasarımı görüyor.
          </p>
          <button type="button" className={smallBtnCls} onClick={() => setPreviewing(draft)}>
            <Eye className="h-3.5 w-3.5" /> Önizle
          </button>
          <button type="button" className={smallBtnCls} disabled={busy} onClick={() => saveDraft(live)}>
            <Trash2 className="h-3.5 w-3.5" /> Taslağı sil
          </button>
          <button type="button" className={primaryBtnCls} disabled={busy} onClick={() => publish(draft)}>
            <Rocket className="h-4 w-4" /> Yayınla
          </button>
        </div>
      )}

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {MENU_DESIGNS.map((d) => {
          const isLive = d.id === live;
          const isDraft = d.id === draft;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setPreviewing(d.id)}
              className={`group overflow-hidden rounded-2xl border text-left transition hover:shadow-md ${
                isDraft ? "border-amber-400 ring-2 ring-amber-200" : isLive ? "border-emerald-500 ring-2 ring-emerald-100" : "border-slate-200"
              }`}
            >
              <div className="relative aspect-[3/4] overflow-hidden bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbUrl(d.id, thumbMode)} alt={`${d.name} tasarımı`} loading="lazy" className="h-full w-full object-cover object-top transition group-hover:scale-[1.03]" />
                {(isLive || isDraft) && (
                  <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${isDraft ? "bg-amber-500" : "bg-emerald-600"}`}>
                    {isDraft ? "Taslak" : "Yayında"}
                  </span>
                )}
              </div>
              <div className="p-2.5">
                <p className="text-sm font-bold text-slate-900">{d.name}</p>
                <p className="line-clamp-2 text-[11px] leading-snug text-slate-500">{d.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl bg-slate-50 px-4 py-3">
        <Toggle checked={darkToggle} onChange={(v) => saveDark(v, settings.defaultMode ?? null)} label="Müşteriler gece modunu açıp kapatabilsin" />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Menü açılış modu:
          <select
            value={settings.defaultMode ?? ""}
            disabled={busy}
            onChange={(e) => saveDark(darkToggle, (e.target.value || null) as Mode | null)}
            className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none"
          >
            <option value="">Tasarımın varsayılanı</option>
            <option value="light">Gündüz (açık)</option>
            <option value="dark">Gece (koyu)</option>
          </select>
        </label>
        <p className="text-[11px] text-slate-400">Gece modu ayarları kaydedildiği an yayına girer.</p>
      </div>

      {previewing && (
        <DesignPreview
          initial={previewing}
          live={live}
          draft={draft}
          slug={savedSlug}
          hasItems={hasItems}
          initialMode={settings.defaultMode ?? ("defaultDark" in designOf(previewing) ? "dark" : "light")}
          busy={busy}
          onSaveDraft={saveDraft}
          onPublish={publish}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}

function ModeSwitch({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs font-semibold">
      {(
        [
          ["light", "Gündüz", Sun],
          ["dark", "Gece", Moon],
        ] as const
      ).map(([m, label, Icon]) => (
        <button
          key={m}
          type="button"
          aria-pressed={value === m}
          onClick={() => onChange(m)}
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 transition ${value === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
        >
          <Icon className="h-3.5 w-3.5" /> {label}
        </button>
      ))}
    </div>
  );
}

function DesignPreview({
  initial,
  live,
  draft,
  slug,
  hasItems,
  initialMode,
  busy,
  onSaveDraft,
  onPublish,
  onClose,
}: {
  initial: MenuLayout;
  live: MenuLayout;
  draft: MenuLayout | null;
  slug: string | null;
  hasItems: boolean;
  initialMode: Mode;
  busy: boolean;
  onSaveDraft: (id: MenuLayout) => void;
  onPublish: (id: MenuLayout) => void;
  onClose: () => void;
}) {
  const [id, setId] = useState<MenuLayout>(initial);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [confirming, setConfirming] = useState(false);
  // Kendi menüsü ancak ürün varsa ve link kaydedilmişse gösterilebilir.
  const canShowOwn = hasItems && slug !== null;
  const [source, setSource] = useState<"own" | "demo">(canShowOwn ? "own" : "demo");
  const index = MENU_DESIGNS.findIndex((d) => d.id === id);
  const design = MENU_DESIGNS[index];
  const go = (dir: -1 | 1) => {
    setId(MENU_DESIGNS[(index + dir + MENU_DESIGNS.length) % MENU_DESIGNS.length].id);
    setConfirming(false);
  };
  const params = `tasarim=${id}&mod=${mode === "dark" ? "gece" : "gunduz"}`;
  const src = source === "own" && slug ? `${MENU_BASE_URL}/${slug}?${params}&onizleme=1` : `${MENU_BASE_URL}/ornek?${params}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4">
      <div className="relative flex w-full max-w-4xl flex-col gap-6 rounded-3xl bg-white p-5 shadow-2xl md:flex-row md:p-8">
        <button type="button" onClick={onClose} aria-label="Kapat" className="absolute right-4 top-4 rounded-xl p-2 text-slate-500 hover:bg-slate-100">
          <X className="h-5 w-5" />
        </button>

        {/* Telefon çerçevesi: kafenin kendi menüsü seçilen tasarımla */}
        <div className="mx-auto shrink-0">
          <div className="h-[640px] w-[320px] overflow-hidden rounded-[44px] border-[10px] border-slate-900 bg-slate-100 shadow-xl">
            <iframe key={src} src={src} title={`${design.name} önizleme`} className="h-full w-full border-0" />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => go(-1)} aria-label="Önceki tasarım" className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-semibold text-slate-400">
              {index + 1} / {MENU_DESIGNS.length}
            </span>
            <button type="button" onClick={() => go(1)} aria-label="Sonraki tasarım" className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <h3 className="mt-4 text-2xl font-bold text-slate-900">{design.name}</h3>
          <p className="mt-1 text-sm text-slate-500">{design.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {id === live && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Yayında</span>}
            {id === draft && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Taslak</span>}
          </div>

          <div className="mt-5 space-y-2">
            <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs font-semibold">
              {(
                [
                  ["own", "Kendi menüm"],
                  ["demo", "Örnek menü"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={source === value}
                  disabled={value === "own" && !canShowOwn}
                  onClick={() => setSource(value)}
                  className={`rounded-full px-3 py-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    source === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {!canShowOwn && (
              <p className="text-xs text-slate-400">
                {slug
                  ? "Menünüze henüz ürün eklemediniz; tasarım örnek bir kafe menüsüyle gösteriliyor."
                  : "Kendi menünüzü görmek için önce menü ayarlarını kaydedin; şimdilik örnek menü gösteriliyor."}
              </p>
            )}
          </div>

          <div className="mt-4">
            <ModeSwitch value={mode} onChange={setMode} />
            <p className="mt-2 text-xs text-slate-400">Önizlemede gece modunu deneyin; müşterileriniz de menüde açıp kapatabilir.</p>
          </div>

          <div className="mt-auto space-y-3 pt-8">
            {id === live ? (
              <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">Bu tasarım şu an yayında.</p>
            ) : confirming ? (
              <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
                <p className="text-sm text-slate-700">
                  Müşterileriniz menünüzü <span className="font-bold">hemen</span> {design.name} tasarımıyla görecek. Emin misiniz?
                </p>
                <div className="flex gap-2">
                  <button type="button" className={primaryBtnCls} disabled={busy} onClick={() => onPublish(id)}>
                    <Rocket className="h-4 w-4" /> Evet, yayınla
                  </button>
                  <button type="button" className={smallBtnCls} onClick={() => setConfirming(false)}>
                    Vazgeç
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={smallBtnCls} disabled={busy || id === draft} onClick={() => onSaveDraft(id)}>
                  {id === draft ? <Check className="h-3.5 w-3.5" /> : null}
                  {id === draft ? "Taslak olarak kaydedildi" : "Taslak olarak kaydet"}
                </button>
                <button type="button" className={primaryBtnCls} disabled={busy || !slug} onClick={() => setConfirming(true)}>
                  <Rocket className="h-4 w-4" /> Yayınla
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
