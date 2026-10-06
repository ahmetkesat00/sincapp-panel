"use client";

import { Rocket, X } from "lucide-react";
import { useState } from "react";
import { MENU_BASE_URL, type QrMenuSettings } from "@/lib/qr-menu/types";
import { primaryBtnCls, smallBtnCls } from "./ui";

/** Menünün müşteriye görüneceği hâli (henüz kapalıyken de) ve yayına alma onayı. */
export default function PublishPreview({
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
