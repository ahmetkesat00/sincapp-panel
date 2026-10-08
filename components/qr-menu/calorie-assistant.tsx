"use client";

import { Check, ChevronDown, Flame, LoaderCircle, Plus, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { saveItems } from "@/lib/qr-menu/firestore";
import { validateProduct } from "@/lib/qr-menu/product-tools";
import {
  INGREDIENT_BY_ID,
  INGREDIENT_CATALOG,
  INGREDIENT_GROUPS,
  RECIPE_BATCH,
  USDA_SOURCE_URL,
  applyRecipe,
  itemNeeds,
  lineKcal,
  lineName,
  recipeKcal,
  requestRecipes,
  toDraft,
  type RecipeDraft,
  type RecipeSuggestion,
} from "@/lib/qr-menu/recipes";
import { ALLERGENS, type MenuCategory, type MenuItem, type RecipeLine } from "@/lib/qr-menu/types";
import { Toggle, inputCls, primaryBtnCls, smallBtnCls } from "./ui";

type Props = {
  cafeId: string;
  items: MenuItem[];
  categories: MenuCategory[];
  onSaved: (updated: MenuItem[]) => void;
  onClose: () => void;
};

type Phase = "intro" | "working" | "review" | "saving" | "done";

type Entry = {
  draft: RecipeDraft;
  confidence: RecipeSuggestion["confidence"];
  note: string | null;
  selected: boolean;
  /** Dolu alanların da üzerine yazılsın mı (varsayılan hayır). */
  overwrite: boolean;
};

const CONFIDENCE = {
  high: { label: "Standart ürün", cls: "bg-emerald-50 text-emerald-700" },
  medium: { label: "Tahmini", cls: "bg-sky-50 text-sky-700" },
  low: { label: "Kontrol edin", cls: "bg-amber-100 text-amber-800" },
} as const;

/** Menüdeki ürünler için reçete önerir; işletme gramajları düzeltip onaylayınca kalori ve içindekiler yazılır. */
export default function CalorieAssistant({ cafeId, items, categories, onSaved, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [includeComplete, setIncludeComplete] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [onlyCheck, setOnlyCheck] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  /** Kaydedilemeyen ürünler: "Ürün adı: neden". */
  const [skipped, setSkipped] = useState<string[]>([]);

  const needing = useMemo(() => items.filter((i) => Object.values(itemNeeds(i)).some(Boolean)), [items]);
  const complete = items.length - needing.length;
  const targets = includeComplete ? items : needing;

  const run = async () => {
    setPhase("working");
    setError("");
    setFailed([]);
    const ids = targets.map((i) => i.id);
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += RECIPE_BATCH) batches.push(ids.slice(i, i + RECIPE_BATCH));
    setProgress({ done: 0, total: ids.length });
    const results: RecipeSuggestion[] = [];
    const failedIds: string[] = [];
    let lastError = "";
    // Aynı anda en fazla iki parça: hızlı ama kotayı ve fonksiyonu zorlamadan.
    let next = 0;
    const worker = async () => {
      while (next < batches.length) {
        const batch = batches[next++];
        try {
          results.push(...(await requestRecipes(cafeId, batch)));
        } catch (err) {
          failedIds.push(...batch);
          lastError = err instanceof Error ? err.message : "Reçeteler hazırlanamadı.";
        }
        setProgress((p) => ({ ...p, done: p.done + batch.length }));
      }
    };
    await Promise.all([worker(), worker()]);

    if (!results.length) {
      setError(lastError || "Reçeteler hazırlanamadı.");
      setPhase("intro");
      return;
    }
    const byId = new Map(results.map((r) => [r.itemId, r]));
    const built: Record<string, Entry> = {};
    for (const item of targets) {
      const s = byId.get(item.id);
      if (!s) continue;
      built[item.id] = {
        draft: toDraft(item, s),
        confidence: s.confidence,
        note: s.note,
        selected: s.recipe.length > 0 && Object.values(itemNeeds(item)).some(Boolean),
        overwrite: false,
      };
    }
    setEntries(built);
    setFailed(failedIds);
    if (failedIds.length) setError(lastError);
    setPhase("review");
  };

  const update = (id: string, patch: Partial<Entry>) => setEntries((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const updateDraft = (id: string, fn: (d: RecipeDraft) => RecipeDraft) => setEntries((prev) => ({ ...prev, [id]: { ...prev[id], draft: fn(prev[id].draft) } }));

  /** Kaydedilecek ürünler: seçili, reçetesi dolu ve yazılacak en az bir alanı olan. */
  const writes = useMemo(() => {
    const list: { item: MenuItem; write: { ingredients: boolean; calories: boolean; portion: boolean } }[] = [];
    for (const item of items) {
      const e = entries[item.id];
      if (!e?.selected || !e.draft.recipe.some((l) => l.amount > 0)) continue;
      const needs = itemNeeds(item);
      const write = { ingredients: needs.ingredients || e.overwrite, calories: needs.calories || e.overwrite, portion: e.overwrite };
      if (write.ingredients || write.calories) list.push({ item, write });
    }
    return list;
  }, [items, entries]);

  const save = async () => {
    setPhase("saving");
    setError("");
    // Üründe asistandan bağımsız eski bir sorun varsa (ör. varsayılan seçeneğin fiyat farkı) o ürün atlanır,
    // diğerleri kaydedilir; atlananlar adıyla gösterilir.
    const updated: MenuItem[] = [];
    const invalid: string[] = [];
    for (const { item, write } of writes) {
      const next = applyRecipe(item, entries[item.id].draft, write);
      const problem = validateProduct(next);
      if (problem) invalid.push(`${item.name.tr}: ${problem}`);
      else updated.push(next);
    }
    const saved: MenuItem[] = [];
    try {
      // Veri katmanı tek işlemde en fazla 450 kayıt yazar; büyük menüler parça parça kaydedilir.
      for (let i = 0; i < updated.length; i += 400) {
        const chunk = updated.slice(i, i + 400);
        await saveItems(cafeId, chunk);
        saved.push(...chunk);
      }
    } catch (err) {
      console.error("calorie assistant save", err);
      if (saved.length) onSaved(saved);
      setSkipped(invalid);
      setError(
        `${saved.length ? `${saved.length} ürün kaydedildi, kalanlar kaydedilemedi` : "Kaydedilemedi"}: ${err instanceof Error ? err.message : "bağlantı sorunu"}. Tekrar deneyin.`,
      );
      setPhase("review");
      return;
    }
    if (saved.length) onSaved(saved);
    setSkipped(invalid);
    setSavedCount(saved.length);
    setPhase("done");
  };

  const reviewIds = items.filter((i) => entries[i.id]).map((i) => i.id);
  const lowCount = reviewIds.filter((id) => entries[id].confidence === "low" || !entries[id].draft.recipe.length).length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8">
      <div className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl">
        <div className="sticky -top-4 z-10 sm:-top-8 flex items-center justify-between rounded-t-3xl border-b border-slate-200 bg-white px-6 py-4">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Flame className="h-5 w-5 text-orange-500" /> Kalori Asistanı
          </h3>
          <button type="button" onClick={onClose} aria-label="Kapat" disabled={phase === "saving"} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {phase === "intro" && (
            <>
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Menünüzdeki her ürün için gerçekçi bir standart reçete hazırlarız. Siz gramajları kendi bardağınıza ve tabağınıza göre düzeltirsiniz;
                  kalori ve içindekiler bu reçeteden otomatik hesaplanır.
                </p>
                <ol className="grid gap-2 sm:grid-cols-3">
                  {[
                    ["Reçete önerisi", "Yapay zekâ ürün adına, açıklamasına ve seçeneklerine bakarak gramaj önerir. Boy seçeneği olmayan üründe boy hesabı yapmaz."],
                    ["Siz düzeltin", "Malzeme ve gramajları değiştirin; kalori anında yeniden hesaplanır."],
                    ["Kaydedin", "Kalori, seçenek farkları, içindekiler ve alerjenler ürüne yazılır; reçete denetim için saklanır."],
                  ].map(([title, text], i) => (
                    <li key={title} className="rounded-2xl bg-slate-50 p-3">
                      <span className="text-[11px] font-bold text-orange-600">{i + 1}. adım</span>
                      <span className="block text-sm font-semibold text-slate-900">{title}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{text}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  {needing.length > 0 ? `${needing.length} üründe kalori veya içindekiler eksik` : "Tüm ürünlerde kalori ve içindekiler dolu"}
                </p>
                {complete > 0 && (
                  <Toggle checked={includeComplete} onChange={setIncludeComplete} label={`Tamamlanmış ${complete} ürün için de reçete hazırla`} />
                )}
                {includeComplete && complete > 0 && (
                  <p className="text-[11px] text-slate-500">Dolu ürünlerdeki bilgiler siz &quot;üzerine yaz&quot;ı işaretlemedikçe değişmez.</p>
                )}
                <button type="button" className={`${primaryBtnCls} w-full !bg-orange-500 hover:!bg-orange-600`} disabled={targets.length === 0} onClick={run}>
                  <Sparkles className="h-4 w-4" /> {targets.length} ürün için reçete hazırla
                </button>
                <p className="text-center text-[11px] text-slate-400">
                  Yaklaşık {Math.max(1, Math.ceil(targets.length / (RECIPE_BATCH * 2)) * 20)} sn sürer · günde 400 ürün hakkı · siz onaylamadan hiçbir şey kaydedilmez
                </p>
              </div>
              <SourceNote />
            </>
          )}

          {phase === "working" && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <LoaderCircle className="h-7 w-7 animate-spin text-orange-500" />
              <p className="text-sm font-bold text-slate-900">
                Reçeteler hazırlanıyor… {progress.done}/{progress.total}
              </p>
              <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
              <p className="text-xs text-slate-500">Bu pencereyi kapatmayın.</p>
            </div>
          )}

          {(phase === "review" || phase === "saving") && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{reviewIds.length} reçete hazır.</span> Ürüne tıklayıp gramajları düzeltin.
                  {failed.length > 0 && <span className="text-red-600"> {failed.length} ürün hazırlanamadı.</span>}
                </p>
                {lowCount > 0 && (
                  <button type="button" onClick={() => setOnlyCheck(!onlyCheck)} className={`${smallBtnCls} ${onlyCheck ? "!border-amber-400 !bg-amber-50" : ""}`}>
                    <TriangleAlert className="h-3.5 w-3.5 text-amber-600" /> Kontrol edilmesi gereken {lowCount}
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {categories.map((cat) => {
                  const list = items.filter(
                    (i) => i.categoryId === cat.id && entries[i.id] && (!onlyCheck || entries[i.id].confidence === "low" || !entries[i.id].draft.recipe.length),
                  );
                  if (!list.length) return null;
                  return (
                    <section key={cat.id} className="space-y-1.5">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">{cat.name.tr}</h4>
                      {list.map((item) => (
                        <ReviewRow
                          key={item.id}
                          item={item}
                          entry={entries[item.id]}
                          open={open === item.id}
                          onToggle={() => setOpen(open === item.id ? null : item.id)}
                          onChange={(patch) => update(item.id, patch)}
                          onDraft={(fn) => updateDraft(item.id, fn)}
                        />
                      ))}
                    </section>
                  );
                })}
              </div>

              <div className="sticky -bottom-4 z-10 sm:-bottom-8 -mx-6 -mb-6 space-y-3 rounded-b-3xl border-t border-slate-200 bg-white px-6 py-4">
                <label className="flex items-start gap-2 text-xs text-slate-700">
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
                  <span>
                    Reçeteleri işletmemdeki gerçek gramajlara göre kontrol ettim. Kalori, içindekiler ve alerjen bilgilerinin doğruluğundan işletmem
                    sorumludur.
                  </span>
                </label>
                <button type="button" className={`${primaryBtnCls} w-full`} disabled={!confirmed || writes.length === 0 || phase === "saving"} onClick={save}>
                  {phase === "saving" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {writes.length ? `${writes.length} ürünü kaydet` : "Kaydedilecek ürün seçin"}
                </button>
              </div>
            </>
          )}

          {phase === "done" && (
            <div className="space-y-4 py-4 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                <Check className="h-6 w-6" />
              </span>
              <div>
                <p className="text-base font-bold text-slate-900">{savedCount} ürün güncellendi</p>
                <p className="mt-1 text-sm text-slate-500">
                  Kalori, içindekiler ve alerjenler menünüze yansıdı. Reçeteler ürünlerde &quot;kalori dayanağı&quot; olarak saklandı.
                </p>
              </div>
              {skipped.length > 0 && (
                <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left text-xs text-amber-900">
                  <p className="flex items-center gap-1.5 font-bold">
                    <TriangleAlert className="h-3.5 w-3.5" /> {skipped.length} ürün kaydedilmedi; ürün formunda düzeltip tekrar deneyin:
                  </p>
                  {skipped.map((s) => (
                    <p key={s}>• {s}</p>
                  ))}
                </div>
              )}
              <button type="button" className={primaryBtnCls} onClick={onClose}>
                Tamam
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SourceNote() {
  return (
    <p className="text-[11px] leading-snug text-slate-400">
      Kalori değerleri{" "}
      <a href={USDA_SOURCE_URL} target="_blank" rel="noreferrer" className="underline">
        USDA FoodData Central
      </a>{" "}
      ortalama besin değerleriyle hesaplanır. Ortalama değerlerdir; markaya ve tarife göre değişebilir.
    </p>
  );
}

function ReviewRow({
  item,
  entry,
  open,
  onToggle,
  onChange,
  onDraft,
}: {
  item: MenuItem;
  entry: Entry;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Entry>) => void;
  onDraft: (fn: (d: RecipeDraft) => RecipeDraft) => void;
}) {
  const { draft } = entry;
  const needs = itemNeeds(item);
  const hasExisting = !needs.calories || !needs.ingredients;
  const fullyComplete = !needs.calories && !needs.ingredients;
  const kcal = recipeKcal(draft.recipe);
  const conf = draft.recipe.length ? CONFIDENCE[entry.confidence] : CONFIDENCE.low;
  const allergens = new Set(draft.recipe.flatMap((l) => INGREDIENT_BY_ID.get(l.ingredientId)?.allergens ?? []));
  const options = (item.variants ?? []).flatMap((g) => g.options.map((o, idx) => ({ g, o, isDefault: g.selection === "single" && idx === 0 })));

  return (
    <div className={`rounded-2xl border ${open ? "border-slate-300" : "border-slate-200"} bg-white`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <input
          type="checkbox"
          aria-label={`${item.name.tr} kaydedilsin`}
          checked={entry.selected}
          onChange={(e) => onChange({ selected: e.target.checked })}
          className="h-4 w-4 shrink-0 accent-emerald-600"
        />
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-slate-900">{item.name.tr}</span>
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${conf.cls}`}>{conf.label}</span>
            </span>
            <span className="block truncate text-[11px] text-slate-500">
              {draft.recipe.length
                ? draft.recipe.map(lineName).join(", ")
                : "Reçete yok — malzeme ekleyin"}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-sm font-bold text-slate-900">{kcal} kcal</span>
            <span className="block max-w-[9rem] truncate text-[10px] text-slate-400">{draft.portion || "porsiyon?"}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="space-y-4 border-t border-slate-100 px-3 py-3">
          {entry.note && (
            <p className="flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" /> {entry.note}
            </p>
          )}

          {hasExisting && (
            <div className="space-y-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
              <p>
                <span className="font-semibold text-slate-800">Mevcut bilgiler:</span>{" "}
                {item.calories !== undefined ? `${item.calories} kcal` : "kalori yok"}
                {item.ingredients.length > 0 && ` · ${item.ingredients.map((i) => i.name.tr).join(", ")}`}
              </p>
              <Toggle
                checked={entry.overwrite}
                onChange={(v) => onChange({ overwrite: v, ...(v ? { selected: true } : {}) })}
                label={fullyComplete ? "Mevcut bilgilerin üzerine yaz" : "Dolu alanların da üzerine yaz"}
              />
              {!entry.overwrite && (
                <p className="text-[11px] text-slate-500">
                  {fullyComplete ? "İşaretlemezseniz bu ürün değişmez." : `Sadece eksik olan ${needs.calories ? "kalori" : "içindekiler"} yazılır.`}
                </p>
              )}
            </div>
          )}

          <label className="block max-w-xs">
            <span className="mb-1 block text-xs font-semibold text-slate-700">Porsiyon</span>
            <input value={draft.portion} onChange={(e) => onDraft((d) => ({ ...d, portion: e.target.value }))} placeholder="ör. 350 ml, 1 dilim (130 g)" className={inputCls} />
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Reçete (1 porsiyon)</span>
            <LinesEditor lines={draft.recipe} onChange={(recipe) => onDraft((d) => ({ ...d, recipe }))} />
            {allergens.size > 0 && (
              <p className="mt-2 text-[11px] text-slate-500">
                Alerjenler: <span className="font-semibold text-slate-700">{ALLERGENS.filter((a) => allergens.has(a.key)).map((a) => a.label).join(", ")}</span>
              </p>
            )}
          </div>

          {options.length > 0 && (
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-slate-700">Seçenekler (temel reçeteye göre fark)</span>
              {options.map(({ g, o, isDefault }) => {
                const od = draft.options[o.id] ?? { portion: "", changes: [] };
                const delta = recipeKcal(od.changes);
                const setOption = (patch: Partial<typeof od>) =>
                  onDraft((d) => ({ ...d, options: { ...d.options, [o.id]: { ...od, ...patch } } }));
                return (
                  <div key={o.id} className="rounded-xl bg-slate-50 p-2.5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-800">
                        {g.name.tr}: {o.name.tr}
                      </span>
                      {isDefault ? (
                        <span className="text-[11px] text-slate-400">varsayılan · temel reçeteye dahil</span>
                      ) : (
                        <span className={`text-[11px] font-bold ${delta > 0 ? "text-orange-600" : delta < 0 ? "text-emerald-600" : "text-slate-400"}`}>
                          {delta > 0 ? "+" : ""}
                          {delta} kcal
                        </span>
                      )}
                      {g.selection === "single" && (
                        <input
                          value={od.portion}
                          onChange={(e) => setOption({ portion: e.target.value })}
                          placeholder="porsiyon"
                          className={`${inputCls} ml-auto !w-28 !py-1 text-xs`}
                        />
                      )}
                    </div>
                    {!isDefault && <LinesEditor lines={od.changes} allowNegative onChange={(changes) => setOption({ changes })} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LinesEditor({ lines, onChange, allowNegative }: { lines: RecipeLine[]; onChange: (lines: RecipeLine[]) => void; allowNegative?: boolean }) {
  const set = (i: number, patch: Partial<RecipeLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="space-y-1.5">
      {lines.map((l, i) => {
        const ing = INGREDIENT_BY_ID.get(l.ingredientId);
        return (
          <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <select value={l.ingredientId} onChange={(e) => set(i, { ingredientId: e.target.value })} className={`${inputCls} min-w-0 basis-full !py-1.5 sm:basis-auto sm:flex-1`}>
              <IngredientOptions />
            </select>
            <input
              value={l.label ?? ""}
              onChange={(e) => set(i, { label: e.target.value || undefined })}
              placeholder="Menüdeki adı"
              title="Müşterinin içindekilerde göreceği ad (ör. Manyas peyniri). Boşsa katalog adı kullanılır; kalori seçili malzemeden hesaplanır."
              className={`${inputCls} min-w-0 flex-1 !py-1.5 text-xs sm:!w-36 sm:flex-none`}
            />
            <AmountInput value={l.amount} allowNegative={allowNegative} onChange={(amount) => set(i, { amount })} />
            <span className="w-6 text-xs text-slate-500">{ing?.unit}</span>
            <span className="ml-auto w-16 text-right text-xs tabular-nums text-slate-600 sm:ml-0">{Math.round(lineKcal(l))} kcal</span>
            <button type="button" aria-label="Malzemeyi çıkar" onClick={() => onChange(lines.filter((_, j) => j !== i))} className="rounded-lg p-1 text-slate-400 hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...lines, { ingredientId: "sut", amount: allowNegative ? 0 : 100 }])} className={smallBtnCls}>
        <Plus className="h-3.5 w-3.5" /> Malzeme ekle
      </button>
    </div>
  );
}

function IngredientOptions() {
  return (
    <>
      {INGREDIENT_GROUPS.map((g) => (
        <optgroup key={g.id} label={g.label}>
          {INGREDIENT_CATALOG.filter((i) => i.group === g.id).map((i) => (
            <option key={i.id} value={i.id}>
              {i.tr}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/** Yazarken "-" ya da "12," gibi ara hâlleri kaybetmeyen sayı alanı. */
function AmountInput({ value, onChange, allowNegative }: { value: number; onChange: (n: number) => void; allowNegative?: boolean }) {
  const [text, setText] = useState(String(value));
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setText(String(value));
  }
  return (
    <input
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(",", ".");
        if (!/^-?\d*\.?\d*$/.test(t) || (!allowNegative && t.startsWith("-"))) return;
        setText(t);
        const n = Number(t);
        if (t !== "" && t !== "-" && Number.isFinite(n)) {
          setLast(n);
          onChange(n);
        }
      }}
      className={`${inputCls} !w-20 !py-1.5 text-right tabular-nums`}
    />
  );
}
