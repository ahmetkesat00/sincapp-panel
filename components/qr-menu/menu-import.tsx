"use client";

import { Check, ChevronDown, FileText, Image as ImageIcon, Link2, LoaderCircle, Sparkles, TriangleAlert, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { saveImportedMenu, touchPricesUpdatedAt } from "@/lib/qr-menu/firestore";
import { ACCEPTED_FILES, MAX_FILES, readMenu, toMenuRecords, type ImportedMenu } from "@/lib/qr-menu/import";
import type { MenuCategory, MenuItem } from "@/lib/qr-menu/types";
import { inputCls, primaryBtnCls } from "./ui";

type Props = {
  cafeId: string;
  existingCategoryCount: number;
  existingItemCount: number;
  menuLive: boolean;
  onImported: (categories: MenuCategory[], items: MenuItem[], pricesUpdatedAt: string | null) => void;
};

type Phase = "idle" | "reading" | "preview" | "saving" | "done";

const formatPrice = (n: number | null) => (n === null ? "?" : `₺${n.toLocaleString("tr-TR")}`);

/** Menü Sihirbazı 1. adım: PDF/fotoğraf/link yükle → yapay zekâ okusun → önizle → ekle. */
export default function MenuImport({ cafeId, existingCategoryCount, existingItemCount, menuLive, onImported }: Props) {
  const [mode, setMode] = useState<"file" | "url">("file");
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<ImportedMenu | null>(null);
  const [added, setAdded] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (phase !== "reading") return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const accepted = [...list].filter((f) => ACCEPTED_FILES.split(",").includes(f.type));
    if (accepted.length < list.length) setError("Sadece PDF, JPG, PNG veya WEBP yükleyebilirsiniz.");
    else setError("");
    setFiles((prev) => [...prev, ...accepted].slice(0, MAX_FILES));
  };

  const canRead = mode === "file" ? files.length > 0 : /^https?:\/\/\S+\.\S+/.test(url.trim());

  const read = async () => {
    setPhase("reading");
    setError("");
    setElapsed(0);
    try {
      const result = await readMenu(cafeId, mode === "file" ? { files } : { url: url.trim() });
      if (!result.menu.categories.some((c) => c.items.length)) {
        throw new Error("Bu kaynakta menü bulunamadı. Menünün okunaklı bir fotoğrafını veya PDF'ini deneyin.");
      }
      setMenu(result.menu);
      setPhase("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Menü okunamadı.");
      setPhase("idle");
    }
  };

  const save = async () => {
    if (!menu) return;
    setPhase("saving");
    setError("");
    try {
      const { categories, items } = toMenuRecords(menu, cafeId, { startOrder: existingCategoryCount, visible: !menuLive });
      await saveImportedMenu(cafeId, categories, items);
      const date = await touchPricesUpdatedAt(cafeId).catch(() => null);
      onImported(categories, items, date);
      setAdded(items.length);
      setPhase("done");
    } catch (err) {
      console.error("import save", err);
      setError("Ürünler kaydedilemedi, tekrar deneyin.");
      setPhase("preview");
    }
  };

  const reset = () => {
    setMenu(null);
    setFiles([]);
    setUrl("");
    setPhase("idle");
  };

  if (phase === "done") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
          <Check className="h-4 w-4" /> {added} ürün menünüze eklendi
        </p>
        <p className="mt-1 text-xs text-emerald-900/80">
          {menuLive
            ? "Menünüz yayında olduğu için ürünler gizli eklendi; kontrol edip ürün listesinden görünür yapabilirsiniz."
            : "İçindekiler ve alerjenler yapay zekâ önerisidir; yayına almadan önce ürünlerde kontrol edin."}
        </p>
      </div>
    );
  }

  if ((phase === "preview" || phase === "saving") && menu) {
    const itemCount = menu.categories.reduce((n, c) => n + c.items.length, 0);
    const noPrice = menu.categories.reduce((n, c) => n + c.items.filter((i) => i.price === null && !i.sizes.length).length, 0);
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <Sparkles className="h-4 w-4 text-violet-600" /> {menu.categories.length} kategori ve {itemCount} ürün bulundu
            </p>
            <p className="text-xs text-slate-500">Göz atın; ekledikten sonra her ürünü düzenleyebilirsiniz.</p>
          </div>
          <button type="button" onClick={reset} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
            Baştan başla
          </button>
        </div>

        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {menu.categories.map((c, ci) => (
            <details key={ci} className="group rounded-xl bg-slate-50 px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-slate-800">
                <span className="truncate">
                  {c.name} <span className="font-normal text-slate-400">({c.items.length})</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {c.items.map((i, ii) => (
                  <li key={ii} className="flex justify-between gap-3">
                    <span className="truncate">{i.name}</span>
                    <span className="shrink-0 font-medium text-slate-800">
                      {i.sizes.length > 1 ? i.sizes.map((s) => formatPrice(s.price)).join(" / ") : formatPrice(i.price ?? i.sizes[0]?.price ?? null)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>

        {(menu.notes.length > 0 || noPrice > 0) && (
          <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <p className="flex items-center gap-1.5 font-bold">
              <TriangleAlert className="h-3.5 w-3.5" /> Kontrol etmeniz gerekenler
            </p>
            {noPrice > 0 && <p>• {noPrice} ürünün fiyatı okunamadı; ₺0 olarak eklenecek.</p>}
            {menu.notes.map((n, i) => (
              <p key={i}>• {n}</p>
            ))}
          </div>
        )}

        <p className="text-[11px] leading-snug text-slate-500">
          İçindekiler ve alerjenler yapay zekâ önerisidir ve &quot;doğrulanmadı&quot; olarak işaretlenir; müşteriye kesin bilgi gibi gösterilmez. Her üründe
          kontrol edip onaylayın.
          {existingItemCount > 0 && ` Mevcut ${existingItemCount} ürününüz silinmez; yeniler yanına eklenir.`}
        </p>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button type="button" className={`${primaryBtnCls} w-full`} disabled={phase === "saving"} onClick={save}>
          {phase === "saving" ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" /> Ekleniyor…
            </>
          ) : (
            <>
              <Check className="h-4 w-4" /> {itemCount} ürünü menüme ekle
            </>
          )}
        </button>
      </div>
    );
  }

  if (phase === "reading") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-8 text-center">
        <LoaderCircle className="h-7 w-7 animate-spin text-violet-600" />
        <div>
          <p className="text-sm font-bold text-slate-900">Menünüz okunuyor… {elapsed > 0 && <span className="font-normal text-slate-500">{elapsed} sn</span>}</p>
          <p className="mt-1 text-xs text-slate-500">
            Kategoriler, ürünler, fiyatlar ve içerikler çıkarılıyor. Menünün uzunluğuna göre 1–3 dakika sürebilir; bu pencereyi kapatmayın.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <Sparkles className="h-4 w-4 text-violet-600" /> Menünüzü yükleyin, ürünleri biz ekleyelim
          </p>
          <p className="text-xs text-slate-500">Basılı menünün fotoğrafı, PDF ya da web sitenizdeki menü linki.</p>
        </div>
      </div>

      <div className="inline-flex rounded-full bg-white p-1 text-xs font-semibold shadow-sm">
        {(
          [
            ["file", "Dosya / fotoğraf", Upload],
            ["url", "Web linki", Link2],
          ] as const
        ).map(([m, label, Icon]) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              setError("");
            }}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 transition ${mode === m ? "bg-violet-600 text-white" : "text-slate-500"}`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {mode === "file" ? (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${
              dragging ? "border-violet-500 bg-violet-100/60" : "border-slate-300 bg-white hover:border-violet-400"
            }`}
          >
            <Upload className="h-5 w-5 text-violet-500" />
            <span className="text-sm font-semibold text-slate-800">Dosya seçin veya buraya sürükleyin</span>
            <span className="text-[11px] text-slate-500">PDF, JPG, PNG · en fazla {MAX_FILES} dosya · her sayfa için ayrı fotoğraf</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_FILES}
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-700">
                  {f.type === "application/pdf" ? <FileText className="h-3.5 w-3.5 text-slate-400" /> : <ImageIcon className="h-3.5 w-3.5 text-slate-400" />}
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="text-slate-400">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  <button type="button" aria-label="Kaldır" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="space-y-1">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://kafeniz.com/menu" className={inputCls} />
          <p className="text-[11px] text-slate-500">Sadece herkese açık menü sayfaları okunabilir. Açılmazsa menünün PDF&apos;ini veya fotoğrafını yükleyin.</p>
        </div>
      )}

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button type="button" className={`${primaryBtnCls} w-full !bg-violet-600 hover:!bg-violet-700`} disabled={!canRead} onClick={read}>
        <Sparkles className="h-4 w-4" /> Menüyü oku
      </button>
      <p className="text-center text-[11px] text-slate-400">Günde 5 okuma hakkınız var. Okunan menü siz onaylamadan eklenmez.</p>
    </div>
  );
}

