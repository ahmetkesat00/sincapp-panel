"use client";

import { Rocket, X } from "lucide-react";
import { useState } from "react";
import { primaryBtnCls, smallBtnCls } from "./ui";
import MenuPreview, { type PreviewData } from "./menu-preview";
import { useDialog } from "./use-dialog";

/** Menünün müşteriye görüneceği hâli (henüz kapalıyken de) ve yayına alma onayı. */
export default function PublishPreview({
  onPublish,
  onClose,
  previewData,
}: {
  onPublish: () => Promise<void>;
  onClose: () => void;
  previewData: PreviewData;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const ref = useDialog(() => { if (!busy) onClose(); });

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
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Yayın önizlemesi" tabIndex={-1} className="relative flex w-full max-w-3xl flex-col gap-6 rounded-3xl bg-white p-5 shadow-2xl outline-none md:flex-row md:p-8">
        <button type="button" onClick={onClose} aria-label="Kapat" className="absolute right-4 top-4 rounded-xl p-2 text-slate-500 hover:bg-slate-100">
          <X className="h-5 w-5" />
        </button>

        <div className="mx-auto shrink-0">
          <div className="h-[min(640px,65dvh)] w-[min(320px,calc(100vw-80px))] overflow-hidden rounded-[44px] border-[10px] border-slate-900 bg-slate-100 shadow-xl">
            <MenuPreview data={previewData} onReady={() => setReady(true)} />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="pr-8 text-2xl font-bold text-slate-900">Menünüz böyle görünecek</h3>
          <p className="mt-2 text-sm text-slate-500">
            Telefonda kaydırarak kontrol edin. Ürün adı, fiyat veya fotoğrafta bir eksik görürseniz kapatıp düzeltebilirsiniz.
          </p>
          <p className="mt-4 text-sm text-slate-600">Yayınladığınızda QR kodlarınız menüyü açar. Sonraki ürün değişiklikleri kaydedildiğinde, müşterinin menüyü yeniden açmasına yansır.</p>

          {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="mt-auto flex flex-wrap gap-2 pt-8">
            <button type="button" className={primaryBtnCls} disabled={busy || !ready} onClick={publish}>
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
