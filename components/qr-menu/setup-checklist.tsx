"use client";

import { Check, ChevronRight, Rocket, Wand2, X } from "lucide-react";
import { useState } from "react";
import { MENU_BASE_URL, MENU_DESIGNS, type QrMenuSettings } from "@/lib/qr-menu/types";
import { primaryBtnCls, smallBtnCls } from "./ui";

type Props = {
  settings: QrMenuSettings;
  savedSlug: string | null;
  categoryCount: number;
  visibleItemCount: number;
  onOpenSettings: () => void;
  onAddProducts: () => void;
  onOpenDesigns: () => void;
  onOpenQr: () => void;
  onPublish: () => Promise<void>;
  onDismiss: () => void;
  onOpenWizard: () => void;
};

const smallPrimaryCls =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50";

type Step = {
  title: string;
  detail: string;
  done: boolean;
  /** Önceki adımlar bitmeden açılmaz. */
  locked?: boolean;
  action?: { label: string; onClick: () => void; primary?: boolean };
};

/**
 * Yeni işletme için menü kurulum adımları. Menü yayına girip işletme listeyi kapatana kadar
 * QR Menü sekmesinin en üstünde durur.
 */
export default function SetupChecklist({
  settings,
  savedSlug,
  categoryCount,
  visibleItemCount,
  onOpenSettings,
  onAddProducts,
  onOpenDesigns,
  onOpenQr,
  onPublish,
  onDismiss,
  onOpenWizard,
}: Props) {
  const [previewing, setPreviewing] = useState(false);
  const infoDone = savedSlug !== null;
  const productsDone = visibleItemCount > 0;
  const designChosen = settings.layout !== undefined;
  const live = infoDone && settings.enabled;
  const designName = MENU_DESIGNS.find((d) => d.id === (settings.layout ?? "classic"))?.name;

  const steps: Step[] = [
    {
      title: "Menü bilgilerini girin",
      detail: infoDone ? "Kaydedildi" : "Menü linki, kısa tanıtım, telefon ve Wi-Fi",
      done: infoDone,
      action: infoDone ? undefined : { label: "Bilgileri gir", onClick: onOpenSettings, primary: true },
    },
    {
      title: "Ürünlerinizi ekleyin",
      detail: productsDone ? `${categoryCount} kategori · ${visibleItemCount} ürün` : "Kategori, ürün, fiyat ve fotoğraf",
      done: productsDone,
      locked: !infoDone,
      action: { label: productsDone ? "Ürün ekle" : "İlk ürünü ekle", onClick: onAddProducts, primary: infoDone && !productsDone },
    },
    {
      title: "Tasarımınızı seçin",
      detail: designChosen ? `Seçili: ${designName}` : `${MENU_DESIGNS.length} hazır tasarım; seçmezseniz Klasik kullanılır`,
      done: designChosen,
      locked: !infoDone,
      action: { label: "Tasarımlar", onClick: onOpenDesigns },
    },
    {
      title: "Önizleyin ve yayına alın",
      detail: live ? "Menünüz yayında" : "Menünüzü müşterinin göreceği hâliyle görün",
      done: live,
      locked: !infoDone || !productsDone,
      action: live ? undefined : { label: "Önizle ve yayına al", onClick: () => setPreviewing(true), primary: infoDone && productsDone },
    },
    {
      title: "QR kodlarını basın",
      detail: "Masa kartları ve kapı/kasa için genel QR",
      done: false,
      locked: !live,
      action: { label: "QR kodları", onClick: onOpenQr, primary: live },
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">{live ? "Menünüz yayında 🎉" : "Menünüzü hazırlayın"}</h3>
          <p className="text-xs text-slate-500">
            {live ? "Son adım: QR kodlarını basıp masalara koyun." : "Adımları sırayla tamamlayın; yayına alana kadar menünüz müşterilere görünmez."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-emerald-700">
            {doneCount} / {steps.length}
          </span>
          {live && (
            <button type="button" onClick={onOpenWizard} className={smallBtnCls}>
              <Wand2 className="h-3.5 w-3.5" /> Menü Sihirbazı
            </button>
          )}
          {live && (
            <button type="button" onClick={onDismiss} aria-label="Listeyi kapat" title="Listeyi kapat" className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {!live && (
        <button
          type="button"
          onClick={onOpenWizard}
          className="mt-4 flex w-full items-center gap-3 rounded-xl bg-emerald-600 px-4 py-3 text-left text-white transition hover:bg-emerald-700"
        >
          <Wand2 className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Menü Sihirbazı ile hızlı kur</span>
            <span className="block text-xs text-emerald-50">Logonuza ve ürünlerinize göre tasarım ve renk önerir, adım adım yayına alır.</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0" />
        </button>
      )}

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>

      <ol className="mt-4 space-y-2">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className={`flex flex-wrap items-center gap-3 rounded-xl bg-white px-3 py-2.5 ${step.locked ? "opacity-50" : ""}`}
          >
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                step.done ? "bg-emerald-600 text-white" : "border border-slate-300 text-slate-500"
              }`}
            >
              {step.done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${step.done ? "text-slate-500" : "text-slate-900"}`}>{step.title}</p>
              <p className="truncate text-xs text-slate-500">{step.detail}</p>
            </div>
            {step.action && (
              <button
                type="button"
                disabled={step.locked}
                onClick={step.action.onClick}
                className={step.action.primary ? smallPrimaryCls : smallBtnCls}
              >
                {step.action.label}
              </button>
            )}
          </li>
        ))}
      </ol>

      {previewing && savedSlug && (
        <PublishPreview
          slug={savedSlug}
          settings={settings}
          onPublish={async () => {
            await onPublish();
            setPreviewing(false);
          }}
          onClose={() => setPreviewing(false)}
        />
      )}
    </div>
  );
}

/** Menünün müşteriye görüneceği hâli (henüz kapalıyken de) ve yayına alma onayı. */
function PublishPreview({
  slug,
  settings,
  onPublish,
  onClose,
}: {
  slug: string;
  settings: QrMenuSettings;
  onPublish: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Taslak tasarım değil, yayına girecek olan gösterilir.
  const src = `${MENU_BASE_URL}/${slug}?tasarim=${settings.layout ?? "classic"}&onizleme=1`;

  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      await onPublish();
    } catch (err) {
      console.error(err);
      setError("Yayına alınamadı, tekrar deneyin.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4">
      <div className="relative flex w-full max-w-3xl flex-col gap-6 rounded-3xl bg-white p-5 shadow-2xl md:flex-row md:p-8">
        <button type="button" onClick={onClose} aria-label="Kapat" className="absolute right-4 top-4 rounded-xl p-2 text-slate-500 hover:bg-slate-100">
          <X className="h-5 w-5" />
        </button>

        <div className="mx-auto shrink-0">
          <div className="h-[640px] w-[320px] overflow-hidden rounded-[44px] border-[10px] border-slate-900 bg-slate-100 shadow-xl">
            <iframe src={src} title="Menü önizleme" className="h-full w-full border-0" />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="pr-8 text-2xl font-bold text-slate-900">Menünüz böyle görünecek</h3>
          <p className="mt-2 text-sm text-slate-500">
            Telefonda kaydırarak kontrol edin. Ürün adı, fiyat veya fotoğrafta bir eksik görürseniz kapatıp düzeltebilirsiniz.
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
            <li>• Yayına aldığınızda menü linkiniz ve QR kodlarınız çalışmaya başlar.</li>
            <li>• Sonradan yaptığınız her değişiklik menüye anında yansır.</li>
            <li>• İstediğiniz zaman Menü ayarlarından yayından kaldırabilirsiniz.</li>
          </ul>

          {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="mt-auto flex flex-wrap gap-2 pt-8">
            <button type="button" className={primaryBtnCls} disabled={busy} onClick={publish}>
              <Rocket className="h-4 w-4" />
              {busy ? "Yayına alınıyor…" : "Menüyü yayına al"}
            </button>
            <button type="button" className={smallBtnCls} onClick={onClose}>
              Düzenlemeye devam et
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
