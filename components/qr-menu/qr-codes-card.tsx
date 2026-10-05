"use client";

import { Check, Copy, Download, FileText, LoaderCircle, Palette, Printer, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { buildCardsHtml } from "@/lib/qr-menu/print-cards";
import {
  CARD_TEMPLATES,
  CORNER_STYLES,
  DEFAULT_QR_STYLE,
  DOT_STYLES,
  loadLogoDataUrl,
  renderQrPng,
  renderQrSvg,
  type QrStyle,
} from "@/lib/qr-menu/qr-style";
import { MENU_BASE_URL, type QrMenuSettings } from "@/lib/qr-menu/types";
import QrCustomizeModal from "./qr-customize-modal";
import { inputCls, primaryBtnCls, smallBtnCls } from "./ui";

type Props = {
  cafeId: string;
  cafeName: string;
  logoUrl?: string;
  heroImage?: string;
  settings: QrMenuSettings;
  /** Ayarlar en az bir kez kaydedilmeden /q linki menüyü bulamaz. */
  isSaved: boolean;
  onSaveStyle: (style: QrStyle) => Promise<void>;
};

const MAX_TABLES = 200;

/**
 * Basılı QR'lar slug yerine değişmeyen /q/{cafeId} linkini taşır; kafe adını veya menü linkini
 * değiştirse bile masalardaki QR'lar çalışmaya devam eder (menü sitesi güncel linke yönlendirir).
 */
export const qrUrl = (cafeId: string, table?: number) =>
  `${MENU_BASE_URL}/q/${cafeId}${table ? `?masa=${table}` : ""}`;

const label = <K extends string>(list: { key: K; label: string }[], key: K) => list.find((x) => x.key === key)?.label ?? key;

export default function QrCodesCard({ cafeId, cafeName, logoUrl, heroImage, settings, isSaved, onSaveStyle }: Props) {
  const style = settings.qrStyle ?? DEFAULT_QR_STYLE;
  const [tableCount, setTableCount] = useState(10);
  const [copied, setCopied] = useState(false);
  const [previewSvg, setPreviewSvg] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [customizing, setCustomizing] = useState(false);
  const fileBase = `${settings.slug || "menu"}-qr`;
  const mainUrl = qrUrl(cafeId);

  /** Logo açıksa QR'a gömülecek data URL; alınamazsa logosuz devam edilir. */
  const logoData = async () => {
    if (!style.logo || !logoUrl) return undefined;
    try {
      return await loadLogoDataUrl(logoUrl);
    } catch {
      setError("Logo yüklenemedi; QR logosuz üretildi.");
      return undefined;
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const logoDataUrl = style.logo && logoUrl ? await loadLogoDataUrl(logoUrl).catch(() => undefined) : undefined;
      const svg = await renderQrSvg(style, mainUrl, { size: 264, logoDataUrl });
      if (active) setPreviewSvg(svg);
    })().catch((err) => console.error("QR preview error:", err));
    return () => {
      active = false;
    };
  }, [style, mainUrl, logoUrl]);

  const download = (href: string, name: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError("");
    try {
      await fn();
    } catch (err) {
      console.error(err);
      setError("QR oluşturulamadı, tekrar deneyin.");
    } finally {
      setBusy("");
    }
  };

  const downloadPng = () =>
    run("png", async () => {
      const png = await renderQrPng(style, mainUrl, { size: 1024, margin: 48, logoDataUrl: await logoData() });
      const url = URL.createObjectURL(png);
      download(url, `${fileBase}.png`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

  const downloadSvg = () =>
    run("svg", async () => {
      const svg = await renderQrSvg(style, mainUrl, { size: 1024, margin: 48, logoDataUrl: await logoData() });
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      download(url, `${fileBase}.svg`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(mainUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Pano izni yoksa link zaten ekranda görünüyor.
    }
  };

  /** tables boşsa tek bir genel kart (kapı/kasa için), değilse her masa için bir kart basar. */
  const printCards = (tables: number[], key: string) => {
    // Pencere tıklama anında açılmalı; aksi halde açılır pencere engelleyicisine takılır.
    const win = window.open("", "_blank");
    if (!win) return setError("Yazdırma penceresi açılamadı; tarayıcının açılır pencere iznini kontrol edin.");
    win.document.write("<p style='font-family:system-ui;padding:24px;color:#555'>QR kartları hazırlanıyor…</p>");
    return run(key, async () => {
      const logoDataUrl = await logoData();
      const entries = await Promise.all(
        (tables.length ? tables : [undefined]).map(async (table) => ({
          table,
          svg: await renderQrSvg(style, qrUrl(cafeId, table), { size: 300, logoDataUrl }),
        })),
      );
      win.document.open();
      win.document.write(
        buildCardsHtml({
          cafeName,
          logoUrl,
          heroImage,
          color: settings.theme.primary,
          template: style.template === "cover" && !heroImage ? "minimal" : style.template,
          entries,
          autoPrint: true,
        }),
      );
      win.document.close();
    });
  };

  const tables = Array.from({ length: Math.min(Math.max(tableCount, 1), MAX_TABLES) }, (_, i) => i + 1);
  const isDefault = JSON.stringify(style) === JSON.stringify(DEFAULT_QR_STYLE);
  const summary = [
    style.logo ? `${style.logoSize === "medium" ? "Orta" : "Küçük"} logo` : "Logosuz",
    `${label(DOT_STYLES, style.dots)} noktalar`,
    `${label(CORNER_STYLES, style.corners)} köşeler`,
    `Şablon: ${label(CARD_TEMPLATES, style.template)}`,
  ].join(" · ");

  return (
    <div className="space-y-5">
      {!isSaved ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          QR oluşturmak için önce menü ayarlarını kaydedin.
        </p>
      ) : (
        <>
          {!settings.enabled && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Menü şu an yayında değil. QR&apos;ları basabilirsiniz, ancak okutulduğunda menü açılmaz; ayarlardan &quot;Yayında&quot; yapıp kaydedin.
            </p>
          )}
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* ── Genel QR ── */}
            <div className="flex gap-4">
              <div className="flex h-[156px] w-[156px] shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white p-3">
                {previewSvg ? (
                  // SVG kütüphane tarafından üretildi; kullanıcı girdisi içermez.
                  <div className="h-[132px] w-[132px] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: previewSvg }} />
                ) : (
                  <LoaderCircle className="h-5 w-5 animate-spin text-slate-300" />
                )}
              </div>
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-semibold text-slate-900">Genel menü QR&apos;ı</p>
                <p className="text-xs text-slate-500">Kapı, vitrin, kasa veya sosyal medya için.</p>
                <button type="button" onClick={copyLink} className="flex max-w-full items-center gap-1.5 truncate text-left text-xs font-medium text-emerald-700 hover:underline">
                  {copied ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Copy className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{mainUrl}</span>
                </button>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" className={smallBtnCls} onClick={downloadPng} disabled={!!busy}>
                    <Download className="h-3.5 w-3.5" /> {busy === "png" ? "Hazırlanıyor…" : "PNG"}
                  </button>
                  <button type="button" className={smallBtnCls} onClick={downloadSvg} disabled={!!busy} title="Matbaa için: istenen boyutta bulanıklaşmaz">
                    <Download className="h-3.5 w-3.5" /> {busy === "svg" ? "Hazırlanıyor…" : "SVG (baskı)"}
                  </button>
                  <button type="button" className={smallBtnCls} onClick={() => printCards([], "main")} disabled={!!busy}>
                    <Printer className="h-3.5 w-3.5" /> Kart yazdır
                  </button>
                </div>
                <p className="text-[11px] leading-snug text-slate-400">
                  {isDefault ? "Standart siyah-beyaz QR · " : ""}
                  {summary}
                </p>
                <button type="button" className={smallBtnCls} onClick={() => setCustomizing(true)}>
                  <Palette className="h-3.5 w-3.5" />
                  Kişiselleştir (logo, renk, şablon)
                </button>
              </div>
            </div>

            {/* ── Masa QR'ları ── */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-900">Masa QR kartları</p>
              <p className="text-xs text-slate-500">
                Her masaya ayrı QR; okutulunca menüde masa numarası görünür. A4&apos;e basılır, kesip masaya koyabilirsiniz.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-700">Masa sayısı</span>
                  <input
                    type="number"
                    min={1}
                    max={MAX_TABLES}
                    value={tableCount}
                    onChange={(e) => setTableCount(Number(e.target.value) || 1)}
                    className={`${inputCls} w-24`}
                  />
                </label>
                <button type="button" className={primaryBtnCls} onClick={() => printCards(tables, "tables")} disabled={!!busy}>
                  <Printer className="h-4 w-4" />
                  {busy === "tables" ? "Hazırlanıyor…" : `${tables.length} masa kartını yazdır`}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">Yazdırma penceresinde &quot;PDF olarak kaydet&quot; seçerek matbaaya da gönderebilirsiniz.</p>
            </div>
          </div>

          {/* Kılavuz md. 41.4: QR okutamayan misafire bilgi talep hâlinde sunulur — personel bu çıktıyı verir. */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
            <FileText className="h-5 w-5 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">Basılı menü</p>
              <p className="text-xs text-slate-500">
                QR okutamayan misafirler için içindekiler, alerjen ve kalori bilgili tam menü. Bir kopyasını kasada bulundurun.
              </p>
            </div>
            {settings.enabled ? (
              <a href={`${MENU_BASE_URL}/${settings.slug}/print`} target="_blank" rel="noopener noreferrer" className={smallBtnCls}>
                <Printer className="h-3.5 w-3.5" /> Basılı menüyü aç
              </a>
            ) : (
              <span className="text-xs text-slate-400">Menü yayına alınınca açılır.</span>
            )}
          </div>
        </>
      )}

      {customizing && (
        <QrCustomizeModal
          initial={style}
          qrData={mainUrl}
          cafeName={cafeName}
          logoUrl={logoUrl}
          heroImage={heroImage}
          theme={settings.theme}
          onSave={async (next) => {
            await onSaveStyle(next);
            setCustomizing(false);
          }}
          onClose={() => setCustomizing(false)}
        />
      )}
    </div>
  );
}
