"use client";

import { Check, LoaderCircle, RotateCcw, Save, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildCardsHtml } from "@/lib/qr-menu/print-cards";
import {
  CARD_TEMPLATES,
  CORNER_STYLES,
  DEFAULT_QR_STYLE,
  DOT_STYLES,
  contrastOnWhite,
  isReadable,
  loadLogoDataUrl,
  renderQrPng,
  renderQrSvg,
  type QrStyle,
} from "@/lib/qr-menu/qr-style";
import { ChipToggle, primaryBtnCls } from "./ui";

type Props = {
  initial: QrStyle;
  qrData: string;
  cafeName: string;
  logoUrl?: string;
  heroImage?: string;
  theme: { primary: string; primaryDark: string };
  onSave: (style: QrStyle) => Promise<void>;
  onClose: () => void;
};

type CheckState = "checking" | "ok" | "fail";

export default function QrCustomizeModal({ initial, qrData, cafeName, logoUrl, heroImage, theme, onSave, onClose }: Props) {
  const [style, setStyle] = useState<QrStyle>(initial);
  const [svg, setSvg] = useState("");
  const [readable, setReadable] = useState<CheckState>("checking");
  const [logoError, setLogoError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof QrStyle>(key: K, value: QrStyle[K]) => setStyle((s) => ({ ...s, [key]: value }));
  const contrast = contrastOnWhite(style.color);
  const swatches = [
    { label: "Siyah", value: "#000000" },
    { label: "Tema", value: theme.primary },
    { label: "Tema koyu", value: theme.primaryDark },
  ];

  // Her değişiklikte önizlemeyi üret ve QR'ı gerçekten okuyarak doğrula.
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setReadable("checking");
      try {
        let logoDataUrl: string | undefined;
        if (style.logo && logoUrl) {
          try {
            logoDataUrl = await loadLogoDataUrl(logoUrl);
            if (active) setLogoError("");
          } catch {
            if (active) setLogoError("Logo yüklenemedi; QR logosuz üretiliyor.");
          }
        }
        const [nextSvg, png] = await Promise.all([
          renderQrSvg(style, qrData, { size: 300, logoDataUrl }),
          renderQrPng(style, qrData, { size: 600, margin: 30, logoDataUrl }),
        ]);
        const ok = await isReadable(png, qrData);
        if (!active) return;
        setSvg(nextSvg);
        setReadable(ok ? "ok" : "fail");
      } catch (err) {
        console.error("QR preview error:", err);
        if (active) setReadable("fail");
      }
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [style, qrData, logoUrl]);

  const cardPreview = useMemo(
    () =>
      svg
        ? buildCardsHtml({
            cafeName,
            logoUrl,
            heroImage,
            color: theme.primary,
            template: style.template,
            entries: [{ table: 1, svg }],
            autoPrint: false,
            preview: true,
          })
        : "",
    [svg, cafeName, logoUrl, heroImage, theme.primary, style.template],
  );

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(style);
    } catch (err) {
      console.error(err);
      setError("Ayarlar kaydedilemedi.");
      setSaving(false);
    }
  };

  const tent = style.template === "tent";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8">
      <div className="w-full max-w-5xl rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">QR&apos;ı kişiselleştir</h3>
            <p className="text-xs text-slate-500">Değişiklikler önizlemede anında görünür; her değişiklikte QR otomatik okunarak test edilir.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-8 p-6 lg:grid-cols-[1fr_380px]">
          {/* ── Ayarlar ── */}
          <div className="space-y-6">
            <Section title="1. Ortada logo">
              {logoUrl ? (
                <div className="flex flex-wrap items-center gap-2">
                  <ChipToggle active={!style.logo} onClick={() => set("logo", false)}>
                    Logosuz
                  </ChipToggle>
                  <ChipToggle active={style.logo && style.logoSize === "small"} onClick={() => setStyle((s) => ({ ...s, logo: true, logoSize: "small" }))}>
                    Küçük logo
                  </ChipToggle>
                  <ChipToggle active={style.logo && style.logoSize === "medium"} onClick={() => setStyle((s) => ({ ...s, logo: true, logoSize: "medium" }))}>
                    Orta logo
                  </ChipToggle>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Logo eklemek için önce İşletme Yönetimi&apos;nden logo yükleyin.</p>
              )}
              {logoError && <p className="mt-1.5 text-xs font-medium text-amber-700">{logoError}</p>}
            </Section>

            <Section title="2. QR rengi">
              <div className="flex flex-wrap items-center gap-2">
                {swatches.map((sw) => (
                  <button
                    key={sw.label}
                    type="button"
                    onClick={() => set("color", sw.value)}
                    className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      style.color.toLowerCase() === sw.value.toLowerCase() ? "border-emerald-600 ring-2 ring-emerald-100" : "border-slate-200"
                    }`}
                  >
                    <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: sw.value }} />
                    {sw.label}
                  </button>
                ))}
                <label className="flex items-center gap-2 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  <input type="color" value={style.color} onChange={(e) => set("color", e.target.value)} className="h-4 w-5 cursor-pointer" />
                  Özel renk
                </label>
              </div>
              {contrast < 4.5 && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-amber-700">
                  <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                  Bu renk açık; bazı telefonlar okumakta zorlanabilir. Daha koyu bir ton seçin.
                </p>
              )}
            </Section>

            <Section title="3. Nokta stili">
              <div className="flex flex-wrap gap-2">
                {DOT_STYLES.map((d) => (
                  <ChipToggle key={d.key} active={style.dots === d.key} onClick={() => set("dots", d.key)}>
                    {d.label}
                  </ChipToggle>
                ))}
              </div>
              <p className="mb-1.5 mt-3 text-xs font-semibold text-slate-600">Köşe kareleri</p>
              <div className="flex flex-wrap gap-2">
                {CORNER_STYLES.map((c) => (
                  <ChipToggle key={c.key} active={style.corners === c.key} onClick={() => set("corners", c.key)}>
                    {c.label}
                  </ChipToggle>
                ))}
              </div>
            </Section>

            <Section title="4. Kart şablonu">
              <div className="grid gap-2 sm:grid-cols-2">
                {CARD_TEMPLATES.map((tpl) => {
                  const disabled = tpl.key === "cover" && !heroImage;
                  const active = style.template === tpl.key;
                  return (
                    <button
                      key={tpl.key}
                      type="button"
                      disabled={disabled}
                      onClick={() => set("template", tpl.key)}
                      className={`rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        active ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{tpl.label}</p>
                      <p className="text-xs text-slate-500">{disabled ? "Önce kapak fotoğrafı yükleyin" : tpl.hint}</p>
                    </button>
                  );
                })}
              </div>
            </Section>
          </div>

          {/* ── Önizleme ── */}
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">Önizleme</p>
              <ReadableBadge state={readable} />
            </div>
            <div className="flex justify-center rounded-2xl bg-slate-100 p-4">
              {cardPreview ? (
                <div
                  className="overflow-hidden rounded-xl shadow-sm"
                  style={{ width: tent ? 174 : 348, height: tent ? 510 : 500 }}
                >
                  {/* 92mm genişliğindeki kart önizleme kutusuna ölçeklenir */}
                  <iframe
                    title="Kart önizleme"
                    srcDoc={cardPreview}
                    className="origin-top-left border-0 bg-white"
                    style={{ width: 348, height: tent ? 1020 : 500, transform: tent ? "scale(0.5)" : undefined }}
                  />
                </div>
              ) : (
                <div className="flex h-[500px] items-center justify-center text-sm text-slate-400">
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Hazırlanıyor…
                </div>
              )}
            </div>
            {readable === "fail" && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                Bu ayarlarla QR okunamıyor. Logoyu küçültün, daha koyu bir renk seçin ya da &quot;Kare&quot; nokta stilini deneyin.
              </p>
            )}
          </div>
        </div>

        {error && <p className="mx-6 mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={() => setStyle(DEFAULT_QR_STYLE)}
            className="inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            <RotateCcw className="h-4 w-4" /> Varsayılana dön
          </button>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">
              Vazgeç
            </button>
            <button type="button" onClick={submit} disabled={saving || readable !== "ok"} className={primaryBtnCls}>
              <Save className="h-4 w-4" />
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-sm font-bold text-slate-900">{title}</h4>
      {children}
    </section>
  );
}

function ReadableBadge({ state }: { state: CheckState }) {
  if (state === "checking")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Test ediliyor
      </span>
    );
  if (state === "ok")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <Check className="h-3.5 w-3.5" /> Okunuyor
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
      <TriangleAlert className="h-3.5 w-3.5" /> Okunamıyor
    </span>
  );
}
