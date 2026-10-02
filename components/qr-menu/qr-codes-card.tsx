"use client";

import { Check, Copy, Download, Printer, TriangleAlert } from "lucide-react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { useRef, useState } from "react";
import { MENU_BASE_URL, type QrMenuSettings } from "@/lib/qr-menu/types";
import { inputCls, primaryBtnCls, smallBtnCls } from "./ui";

type Props = {
  cafeId: string;
  cafeName: string;
  logoUrl?: string;
  settings: QrMenuSettings;
  /** Ayarlar en az bir kez kaydedilmeden /q linki menüyü bulamaz. */
  isSaved: boolean;
};

const MAX_TABLES = 200;

/**
 * Basılı QR'lar slug yerine değişmeyen /q/{cafeId} linkini taşır; kafe adını veya menü linkini
 * değiştirse bile masalardaki QR'lar çalışmaya devam eder (menü sitesi güncel linke yönlendirir).
 */
export const qrUrl = (cafeId: string, table?: number) =>
  `${MENU_BASE_URL}/q/${cafeId}${table ? `?masa=${table}` : ""}`;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export default function QrCodesCard({ cafeId, cafeName, logoUrl, settings, isSaved }: Props) {
  const [tableCount, setTableCount] = useState(10);
  const [copied, setCopied] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileBase = `${settings.slug || "menu"}-qr`;
  const mainUrl = qrUrl(cafeId);

  const download = (href: string, name: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
  };

  const downloadPng = () => canvasRef.current && download(canvasRef.current.toDataURL("image/png"), `${fileBase}.png`);

  const downloadSvg = () => {
    if (!svgRef.current) return;
    const xml = new XMLSerializer().serializeToString(svgRef.current);
    const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
    download(url, `${fileBase}.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

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
  const printCards = async (tables: number[]) => {
    // Pencere tıklama anında açılmalı; aksi halde açılır pencere engelleyicisine takılır.
    const win = window.open("", "_blank");
    if (!win) return;
    const { renderToStaticMarkup } = await import("react-dom/server");

    const color = settings.theme.primary;
    const name = escapeHtml(cafeName);
    const logo = logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="" />` : "";
    const cards = (tables.length ? tables : [undefined])
      .map((table) => {
        const qr = renderToStaticMarkup(<QRCodeSVG value={qrUrl(cafeId, table)} size={256} level="M" marginSize={0} />);
        return `
        <div class="card">
          <div class="brand">${logo}<span class="name">${name}</span></div>
          <div class="cta">Menü için okutun<span>Scan for menu</span></div>
          <div class="qr">${qr}</div>
          ${table ? `<div class="table">Masa ${table}</div>` : ""}
          <p class="notice">Ürünlerin içerik, alerjen ve kalori bilgilerine bu karekod ile ulaşabilirsiniz. Karekod okutacak cihazı olmayan misafirlerimize talep etmeleri hâlinde bu bilgiler ayrıca sunulur.</p>
          <div class="footer">LoopyGo QR Menü</div>
        </div>`;
      })
      .join("");

    win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8" />
      <title>${name} · QR ${tables.length ? "masa kartları" : "kartı"}</title>
      <style>
        @page { size: A4; margin: 10mm; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1d1b; }
        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm; }
        .card { height: 132mm; border: 1px dashed #b8b8b8; border-radius: 4mm; padding: 7mm 6mm; display: flex; flex-direction: column;
                align-items: center; justify-content: space-between; text-align: center; break-inside: avoid; page-break-inside: avoid; }
        .brand { display: flex; align-items: center; gap: 3mm; }
        .brand img { width: 12mm; height: 12mm; border-radius: 3mm; object-fit: cover; }
        .name { font-size: 15pt; font-weight: 800; }
        .cta { font-size: 14pt; font-weight: 800; color: ${color}; }
        .cta span { display: block; font-size: 9pt; font-weight: 600; color: #777; }
        .qr svg { width: 58mm; height: 58mm; display: block; }
        .table { font-size: 18pt; font-weight: 800; color: #fff; background: ${color}; padding: 1.5mm 7mm; border-radius: 20mm; }
        .notice { margin: 0; font-size: 6.5pt; line-height: 1.35; color: #555; }
        .footer { font-size: 6.5pt; color: #9a9a9a; letter-spacing: 0.05em; }
        @media screen { body { background: #eee; padding: 10mm; } .grid { max-width: 190mm; margin: 0 auto; } .card { background: #fff; } }
      </style></head>
      <body><div class="grid">${cards}</div>
      <script>
        // Logo yüklendikten sonra yazdırma penceresini aç.
        const imgs = [...document.images];
        Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))).then(() => setTimeout(() => window.print(), 200));
      </script></body></html>`);
    win.document.close();
  };

  const tables = Array.from({ length: Math.min(Math.max(tableCount, 1), MAX_TABLES) }, (_, i) => i + 1);

  return (
    <div className="space-y-5 rounded-2xl border border-slate-200 p-5">
      <div>
        <h3 className="text-sm font-bold text-slate-900">QR kodları</h3>
        <p className="text-xs text-slate-500">
          Masalara, kapıya veya kasaya koyacağınız QR kodlar. Menü linkinizi değiştirseniz bile basılı QR&apos;lar çalışmaya devam eder.
        </p>
      </div>

      {!isSaved ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          QR oluşturmak için önce yukarıdaki menü ayarlarını kaydedin.
        </p>
      ) : (
        <>
          {!settings.enabled && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Menü şu an yayında değil. QR&apos;ları basabilirsiniz, ancak okutulduğunda menü açılmaz; ayarlardan &quot;Yayında&quot; yapıp kaydedin.
            </p>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* ── Genel QR ── */}
            <div className="flex gap-4">
              <div className="shrink-0 rounded-2xl border border-slate-200 bg-white p-3">
                <QRCodeSVG ref={svgRef} value={mainUrl} size={132} level="M" marginSize={2} title={`${cafeName} menü`} />
                {/* PNG indirme için yüksek çözünürlüklü kopya (görünmez). */}
                <QRCodeCanvas ref={canvasRef} value={mainUrl} size={1024} level="M" marginSize={4} className="hidden" />
              </div>
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-semibold text-slate-900">Genel menü QR&apos;ı</p>
                <p className="text-xs text-slate-500">Kapı, vitrin, kasa veya sosyal medya için.</p>
                <button type="button" onClick={copyLink} className="flex max-w-full items-center gap-1.5 truncate text-left text-xs font-medium text-emerald-700 hover:underline">
                  {copied ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Copy className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{mainUrl}</span>
                </button>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" className={smallBtnCls} onClick={downloadPng}>
                    <Download className="h-3.5 w-3.5" /> PNG
                  </button>
                  <button type="button" className={smallBtnCls} onClick={downloadSvg} title="Matbaa için: istenen boyutta bulanıklaşmaz">
                    <Download className="h-3.5 w-3.5" /> SVG (baskı)
                  </button>
                  <button type="button" className={smallBtnCls} onClick={() => printCards([])}>
                    <Printer className="h-3.5 w-3.5" /> Kart yazdır
                  </button>
                </div>
              </div>
            </div>

            {/* ── Masa QR'ları ── */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-900">Masa QR kartları</p>
              <p className="text-xs text-slate-500">
                Her masaya ayrı QR: okutulunca menüde masa numarası görünür. Kartlar A4&apos;e sayfa başına 4 adet basılır; kesip masaya koyabilirsiniz.
                Kartlarda yönetmeliğin istediği &quot;cihazı olmayanlara bilgi talep hâlinde sunulur&quot; notu hazır bulunur.
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
                <button type="button" className={primaryBtnCls} onClick={() => printCards(tables)}>
                  <Printer className="h-4 w-4" />
                  {tables.length} masa kartını yazdır
                </button>
              </div>
              <p className="text-[11px] text-slate-400">Yazdırma penceresinde &quot;PDF olarak kaydet&quot; seçerek matbaaya da gönderebilirsiniz.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
