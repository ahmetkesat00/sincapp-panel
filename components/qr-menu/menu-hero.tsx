"use client";

import { ArrowRight, Check, ChevronRight, Copy, ExternalLink, Rocket, Smartphone, Wand2 } from "lucide-react";
import { useState } from "react";
import { MENU_BASE_URL, MENU_DESIGNS, type QrMenuSettings } from "@/lib/qr-menu/types";
import PublishPreview from "./publish-preview";
import type { PreviewData } from "./menu-preview";

type Props = {
  /** Üstteki başlık; admin sayfasında kafe adı verilir. */
  title?: string;
  settings: QrMenuSettings;
  savedSlug: string | null;
  categoryCount: number;
  itemCount: number;
  visibleItemCount: number;
  onOpenWizard: () => void;
  /** Canlı önizlemeli düzenleme (menü kurulmuş ve ürün varsa). */
  onOpenStudio?: () => void;
  onAddProductsManually: () => void;
  onPublish: () => Promise<void>;
  previewData: PreviewData;
};

const formatDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
};

/**
 * QR Menü sekmesinin başı: başlık, Menü Sihirbazı (işletmeyi buraya yönlendiriyoruz),
 * menü durumu/linki, kısa bilgiler ve menü yayında değilse tek bir "sıradaki adım".
 */
export default function MenuHero({ title, settings, savedSlug, categoryCount, itemCount, visibleItemCount, onOpenWizard, onOpenStudio, onAddProductsManually, onPublish, previewData }: Props) {
  const [copied, setCopied] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const live = savedSlug !== null && settings.enabled;
  const link = savedSlug ? `${MENU_BASE_URL}/${savedSlug}` : null;
  const design = MENU_DESIGNS.find((d) => d.id === (settings.layout ?? "classic"))?.name ?? "Klasik";

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Pano izni yoksa link zaten ekranda.
    }
  };

  // Menü yayında değilse tek, net bir yönlendirme.
  const next = live
    ? null
    : savedSlug === null
      ? { tone: "emerald", text: "Menünüz henüz kurulmadı. Menü Sihirbazı ile birkaç dakikada hazırlayın.", action: { label: "Sihirbazı başlat", onClick: onOpenWizard } }
      : visibleItemCount === 0
        ? {
            tone: "amber",
            text: "Menünüzde henüz ürün yok. Basılı menünüzü sihirbaza yükleyin ya da ürünleri elle ekleyin.",
            action: { label: "Menümü yükle", onClick: onOpenWizard },
            secondary: { label: "Elle ekle", onClick: onAddProductsManually },
          }
        : { tone: "amber", text: "Menünüz hazır ama müşterilere kapalı.", action: { label: "Önizle ve yayına al", onClick: () => setPreviewing(true), icon: true } };

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-5 bg-gradient-to-br from-white via-white to-emerald-50/70 p-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">QR Menü</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900 md:text-2xl">{title ?? "Dijital menünüzü yönetin"}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                live ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-slate-400"}`} />
              {live ? "Yayında" : savedSlug ? "Kapalı" : "Kurulmadı"}
            </span>
            {link && (
              <>
                <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 text-sm font-medium text-slate-700 hover:text-emerald-700">
                  <span className="truncate">{link.replace(/^https?:\/\//, "")}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </a>
                <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-700">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Kopyalandı" : "Kopyala"}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 md:min-w-[290px]">
        <button
          type="button"
          onClick={live ? onAddProductsManually : onOpenWizard}
          className="group flex shrink-0 items-center gap-4 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 px-5 py-4 text-left text-white shadow-lg shadow-emerald-700/20 transition hover:shadow-xl hover:shadow-emerald-700/25 md:min-w-[290px]"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
            {live ? <Smartphone className="h-5 w-5" /> : <Wand2 className="h-5 w-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold">{live ? "Ürünleri düzenle" : "Menünü oluştur"}</span>
            <span className="block text-xs text-emerald-50/90">{live ? "Fiyat, fotoğraf ve satış durumunu güncelle" : "Menünü yükle veya elle oluştur"}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 transition group-hover:translate-x-0.5" />
        </button>
        {onOpenStudio && (
          <button
            type="button"
            onClick={onOpenStudio}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800"
          >
            <Smartphone className="h-4 w-4 text-emerald-600" />
            Tasarımı düzenle
            <span className="text-xs font-normal text-slate-400">· canlı önizleme</span>
          </button>
        )}
        {live && <button type="button" onClick={onOpenWizard} className="py-1 text-xs font-semibold text-slate-500 hover:text-emerald-700">Dosya veya linkten ürün içe aktar</button>}
        {!live && <button type="button" onClick={onAddProductsManually} className="py-1 text-xs font-semibold text-slate-500 hover:text-emerald-700">Elle ürün ekle</button>}
        </div>
      </div>

      <dl className="grid grid-cols-2 border-t border-slate-100 md:grid-cols-4">
        {[
          ["Kategori", categoryCount.toLocaleString("tr-TR")],
          ["Ürün", itemCount.toLocaleString("tr-TR")],
          ["Tasarım", design],
          ["Fiyat güncelleme", formatDate(settings.pricesUpdatedAt)],
        ].map(([label, value], i) => (
          <div key={label} className={`px-6 py-3.5 ${i % 2 === 1 ? "border-l border-slate-100" : ""} ${i >= 2 ? "border-t border-slate-100 md:border-t-0" : ""} ${i === 2 ? "md:border-l" : ""}`}>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="mt-0.5 truncate text-sm font-semibold text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>

      {next && (
        <div className={`flex flex-wrap items-center gap-3 border-t px-6 py-3.5 ${next.tone === "emerald" ? "border-emerald-100 bg-emerald-50/60" : "border-amber-100 bg-amber-50/70"}`}>
          <p className={`min-w-0 flex-1 text-sm ${next.tone === "emerald" ? "text-emerald-900" : "text-amber-900"}`}>{next.text}</p>
          {"secondary" in next && next.secondary && (
            <button type="button" onClick={next.secondary.onClick} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
              {next.secondary.label}
            </button>
          )}
          <button
            type="button"
            onClick={next.action.onClick}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            {"icon" in next.action && next.action.icon ? <Rocket className="h-4 w-4" /> : null}
            {next.action.label}
            {!("icon" in next.action) && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      )}

      {previewing && savedSlug && (
        <PublishPreview
          previewData={previewData}
          onPublish={async () => {
            await onPublish();
            setPreviewing(false);
          }}
          onClose={() => setPreviewing(false)}
        />
      )}
    </section>
  );
}
