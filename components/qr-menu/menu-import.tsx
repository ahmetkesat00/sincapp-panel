"use client";

import { Check, LoaderCircle, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { ACCEPTED_FILES, MAX_FILES, readMenu, toMenuRecords, type ImportedMenu } from "@/lib/qr-menu/import";
import { normalizeSearch } from "@/lib/qr-menu/product-tools";
import type { MenuCategory, MenuItem } from "@/lib/qr-menu/types";
import { inputCls, primaryBtnCls, smallBtnCls } from "./ui";

type Props = {
  cafeId: string;
  existingCategoryCount: number;
  existingItemCount: number;
  existingCategories: MenuCategory[];
  existingItems: MenuItem[];
  menuLive: boolean;
  onImported: (categories: MenuCategory[], items: MenuItem[], date: null) => void;
  onBusyChange: (busy: boolean) => void;
};
type Action = "add" | "update" | "skip";

/** Okuma ve düzeltme yerel taslaktır; kayıt sihirbazın son onayında yapılır. */
export default function MenuImport({ cafeId, existingCategoryCount, existingItemCount, existingCategories, existingItems, menuLive, onImported, onBusyChange }: Props) {
  const [mode, setMode] = useState<"file" | "url">("file");
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<"idle" | "reading" | "preview" | "done">("idle");
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<ImportedMenu | null>(null);
  const [actions, setActions] = useState<Record<string, Action>>({});
  const [categoryTargets, setCategoryTargets] = useState<Record<number, string>>({});
  const [elapsed, setElapsed] = useState(0);
  const [added, setAdded] = useState(0);
  useEffect(() => {
    onBusyChange(phase === "reading");
    if (phase !== "reading") return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase, onBusyChange]);

  const matches = (ci: number, ii: number) => {
    if (!menu) return [];
    const cat = menu.categories[ci];
    const categoryId = categoryTargets[ci];
    return existingItems.filter((item) => item.categoryId === categoryId && normalizeSearch(item.name.tr) === normalizeSearch(cat.items[ii].name));
  };
  const read = async () => {
    setPhase("reading"); setElapsed(0); setError(""); onBusyChange(true);
    try {
      const result = await readMenu(cafeId, mode === "file" ? { files } : { url: url.trim() });
      if (!result.menu.categories.some((c) => c.items.length)) throw new Error("Menü bulunamadı. Okunaklı bir fotoğraf veya PDF deneyin.");
      const targets: Record<number, string> = {};
      const initialActions: Record<string, Action> = {};
      result.menu.categories.forEach((c, ci) => {
        const matchedCategories = existingCategories.filter((x) => normalizeSearch(x.name.tr) === normalizeSearch(c.name));
        targets[ci] = matchedCategories.length === 1 ? matchedCategories[0].id : "";
        c.items.forEach((i, ii) => {
          const duplicate = existingItems.some((x) => x.categoryId === targets[ci] && normalizeSearch(x.name.tr) === normalizeSearch(i.name));
          initialActions[`${ci}:${ii}`] = duplicate ? "skip" : "add";
        });
      });
      setCategoryTargets(targets); setActions(initialActions); setMenu(result.menu); setPhase("preview");
    } catch (err) { setError(err instanceof Error ? err.message : "Menü okunamadı."); setPhase("idle"); }
  };

  const updatePrice = (ci: number, ii: number, value: string, size?: number) => {
    const price = value.trim() === "" ? null : Number(value);
    setMenu((prev) => prev ? { ...prev, categories: prev.categories.map((c, cIndex) => cIndex !== ci ? c : { ...c, items: c.items.map((item, iIndex) => iIndex !== ii ? item : size === undefined ? { ...item, price } : { ...item, sizes: item.sizes.map((s, si) => si === size ? { ...s, price: price as number } : s) }) }) } : prev);
  };

  const prepare = () => {
    if (!menu) return;
    setError("");
    const chosen = menu.categories.map((c, ci) => ({ ...c, items: c.items.filter((_i, ii) => actions[`${ci}:${ii}`] !== "skip") }));
    const records = toMenuRecords({ ...menu, categories: chosen }, cafeId, { startOrder: existingCategoryCount, visible: !menuLive });
    const categories: MenuCategory[] = [];
    const items: MenuItem[] = [];
    for (let ci = 0; ci < chosen.length; ci++) {
      const category = records.categories[ci];
      const target = categoryTargets[ci];
      const imported = records.items.filter((i) => i.categoryId === category.id);
      if (!imported.length) continue;
      if (!target) categories.push({ ...category, sortOrder: existingCategoryCount + categories.length });
      const originals = existingItems.filter((i) => i.categoryId === target);
      let nextOrder = originals.reduce((max, i) => Math.max(max, i.sortOrder + 1), 0);
      let index = 0;
      for (let ii = 0; ii < menu.categories[ci].items.length; ii++) {
        const action = actions[`${ci}:${ii}`];
        if (action === "skip") continue;
        const item = imported[index++];
        const source = menu.categories[ci].items[ii];
        if (source.sizes.some((s) => s.price === null || !Number.isFinite(s.price) || s.price < 0) || (source.price !== null && (!Number.isFinite(source.price) || source.price < 0))) { setError(`${source.name}: fiyatları kontrol edin.`); return; }
        if (action === "update") {
          const candidates = matches(ci, ii);
          if (candidates.length !== 1) { setError(`${source.name}: güncellenecek ürün tek olarak eşleşmiyor. Yeni ekleyin veya atlayın.`); return; }
          const previous = candidates[0];
          const sizeGroup = item.variants?.[0];
          const previousSize = previous.variants?.find((g) => g.id === "size" || normalizeSearch(g.name.tr) === "boy");
          const sizesChanged = Boolean(sizeGroup);
          const variants = sizeGroup ? [...(previous.variants ?? []).filter((g) => g.id !== previousSize?.id), { ...sizeGroup, id: previousSize?.id ?? sizeGroup.id, options: sizeGroup.options.map((o) => ({ ...previousSize?.options.find((p) => normalizeSearch(p.name.tr) === normalizeSearch(o.name.tr)), ...o })) }] : previous.variants;
          items.push({ ...previous, name: item.name, description: item.description ?? previous.description, price: item.price, priceNeedsReview: item.priceNeedsReview ?? false, variants, ...(sizesChanged ? { allergensConfirmed: false, recipe: undefined } : {}), isVisible: item.priceNeedsReview ? false : previous.isVisible });
        } else items.push({ ...item, categoryId: target || category.id, sortOrder: target ? nextOrder++ : item.sortOrder });
      }
    }
    if (!items.length) { setError("En az bir ürün seçin."); return; }
    if (categories.length + items.length > 450) { setError("Tek işlemde en fazla 450 kategori ve ürün seçebilirsiniz."); return; }
    if (new Set(items.map((i) => i.id)).size !== items.length) { setError("Aynı mevcut ürünü birden fazla kez güncellemeyi seçtiniz. Fazla satırı atlayın."); return; }
    onImported(categories, items, null); setAdded(items.length); setPhase("done");
  };

  if (phase === "done") return <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900"><p className="flex items-center gap-2 font-bold"><Check className="h-4 w-4" />{added} ürün son onay için hazır</p><p className="mt-1 text-xs">Henüz kaydedilmedi. Sihirbazı bitirerek kaydedin; vazgeçerseniz bu ürünler eklenmez.</p><button type="button" className={`${smallBtnCls} mt-3`} onClick={() => { onImported([], [], null); setPhase("preview"); }}>Seçimi düzenle</button></div>;
  if (phase === "reading") return <div className="rounded-2xl bg-violet-50 p-6 text-center" role="status"><LoaderCircle className="mx-auto h-6 w-6 animate-spin text-violet-600" /><p className="mt-2 text-sm font-semibold">Menünüz okunuyor… {elapsed} sn</p><p className="mt-1 text-xs text-slate-500">Genellikle 1–3 dakika sürer. İşlem tamamlanana kadar bekleyin.</p></div>;
  if (phase === "preview" && menu) {
    const count = menu.categories.reduce((n, c, ci) => n + c.items.filter((_i, ii) => actions[`${ci}:${ii}`] !== "skip").length, 0);
    const missing = menu.categories.reduce((n, c, ci) => n + c.items.filter((i, ii) => actions[`${ci}:${ii}`] !== "skip" && i.price === null && !i.sizes.length).length, 0);
    return <div className="space-y-3 rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-2"><p className="text-sm font-bold">{count} ürün seçili{missing ? ` · ${missing} fiyat eksik` : ""}</p><button type="button" className={smallBtnCls} onClick={() => { onImported([], [], null); setPhase("idle"); setMenu(null); }}>Baştan başla</button></div>
      <p className="text-xs text-slate-500">Fiyatları düzeltin, eşleşen ürünleri güncelleyin veya atlayın.</p>
      <div className="max-h-[50dvh] space-y-3 overflow-y-auto">
        {menu.categories.map((c, ci) => <details key={ci} open className="rounded-xl bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-bold">{c.name} ({c.items.length})</summary>
          <label className="mt-2 block text-xs text-slate-500">Kategoriye ekle<select className={`${inputCls} mt-1`} value={categoryTargets[ci] ?? ""} onChange={(e) => { setCategoryTargets((prev) => ({ ...prev, [ci]: e.target.value })); const target = e.target.value; setActions((prev) => ({ ...prev, ...Object.fromEntries(c.items.map((i, ii) => [`${ci}:${ii}`, target && existingItems.some((x) => x.categoryId === target && normalizeSearch(x.name.tr) === normalizeSearch(i.name)) ? "skip" : "add"])) })); }}><option value="">Yeni kategori: {c.name}</option>{existingCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name.tr}</option>)}</select></label>
          <ul className="mt-3 space-y-3">{c.items.map((item, ii) => <li key={ii} className="space-y-2 border-t border-slate-200 pt-2">
            <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{item.name}</span><select aria-label={`${item.name} aktarım işlemi`} value={actions[`${ci}:${ii}`] ?? "add"} onChange={(e) => setActions((prev) => ({ ...prev, [`${ci}:${ii}`]: e.target.value as Action }))} className="rounded-lg border bg-white p-1 text-xs"><option value="add">Yeni ekle</option>{matches(ci, ii).length === 1 && <option value="update">Mevcut ürünü güncelle</option>}<option value="skip">Atla</option></select></div>
            {actions[`${ci}:${ii}`] !== "skip" && <div className="flex flex-wrap gap-2">{item.sizes.length ? item.sizes.map((size, si) => <label key={si} className="text-xs text-slate-500">{size.name} (₺)<input type="number" min="0" step="0.01" aria-label={`${item.name} ${size.name} fiyatı`} className={`${inputCls} mt-1 w-28`} value={size.price ?? ""} onChange={(e) => updatePrice(ci, ii, e.target.value, si)} /></label>) : <label className="text-xs text-slate-500">Fiyat (₺)<input type="number" min="0" step="0.01" aria-label={`${item.name} fiyatı`} className={`${inputCls} mt-1 w-28`} value={item.price ?? ""} onChange={(e) => updatePrice(ci, ii, e.target.value)} /></label>}</div>}
          </li>)}</ul>
        </details>)}
      </div>
      {missing > 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Fiyatı eksik {missing} ürün gizli hazırlanacak. Fiyatını kontrol etmeden menüde gösterilemez.</p>}
      {menu.notes.length > 0 && <details className="text-xs text-slate-500"><summary className="cursor-pointer">Okuma notları ({menu.notes.length})</summary>{menu.notes.map((note, i) => <p className="mt-1" key={i}>{note}</p>)}</details>}
      <p className="text-xs text-slate-500">Yeni ürünlerin içerikleri AI önerisidir; yayınlamadan önce kontrol edin. {existingItemCount > 0 && "Mevcut ürünler silinmez. Güncelleme seçeneği ad, açıklama ve fiyatları değiştirir."}</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="button" className={`${primaryBtnCls} w-full`} disabled={!count} onClick={prepare}>{count} ürünü onay ekranına taşı</button>
    </div>;
  }
  return <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
    <p className="text-sm font-bold">Menünüzü yükleyin</p>
    <div className="flex gap-2">{(["file", "url"] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`${smallBtnCls} ${mode === value ? "!border-violet-400 !text-violet-700" : ""}`}>{value === "file" ? "Dosya / fotoğraf" : "Web linki"}</button>)}</div>
    {mode === "file" ? <><label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed bg-white p-5 text-center"><Upload className="h-5 w-5 text-violet-600" /><span className="text-sm font-semibold">Dosya seçin</span><span className="text-xs text-slate-500">PDF, JPG, PNG, WEBP · En fazla {MAX_FILES} dosya · PDF başına 12 MB</span><input type="file" accept={ACCEPTED_FILES} multiple className="sr-only" onChange={(e) => { const picked = Array.from(e.target.files ?? []); const accepted = picked.filter((f) => ACCEPTED_FILES.split(",").includes(f.type)); if (picked.length !== accepted.length) setError("Sadece PDF, JPG, PNG veya WEBP seçin."); else if (files.length + accepted.length > MAX_FILES) setError(`En fazla ${MAX_FILES} dosya seçebilirsiniz.`); else setError(""); setFiles((prev) => [...prev, ...accepted].slice(0, MAX_FILES)); e.target.value = ""; }} /></label>{files.map((file, i) => <div className="flex items-center justify-between gap-2 text-xs" key={`${file.name}-${i}`}><span className="truncate">{file.name} · {(file.size / 1048576).toFixed(1)} MB</span><button type="button" className={smallBtnCls} onClick={() => setFiles((prev) => prev.filter((_f, index) => index !== i))}>Kaldır</button></div>)}</> : <><input aria-label="Menü web adresi" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://kafeniz.com/menu" className={inputCls} /><p className="text-xs text-slate-500">Herkese açık menü sayfası.</p></>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button type="button" className={`${primaryBtnCls} w-full`} disabled={mode === "file" ? !files.length : !/^https?:\/\/\S+\.\S+/.test(url.trim())} onClick={read}>Menüyü oku</button>
    <p className="text-xs text-slate-500">Günde 5 okuma. Son onayınıza kadar ürünler kaydedilmez.</p>
  </div>;
}
