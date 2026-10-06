"use client";

import { httpsCallable } from "firebase/functions";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { functions } from "@/lib/firebase";
import { ALLERGENS, DIET_TAGS, type MenuCategory, type MenuItem } from "@/lib/qr-menu/types";

/** firebase/menu-functions/stats.js aggregateStats çıktısı. */
export type MenuStats = {
  from: string;
  to: string;
  daily: { day: string; opens: number }[];
  opens: number;
  hours: number[];
  lang: Record<string, number>;
  tables: Record<string, number>;
  items: Record<string, number>;
  soldOut: Record<string, number>;
  cats: Record<string, number>;
  filters: Record<string, number>;
  misses: Record<string, number>;
};

const getMenuStats = httpsCallable<{ cafeId: string; days: 7 | 30 }, MenuStats>(functions, "getMenuStats");

type Props = { cafeId: string; items: MenuItem[]; categories: MenuCategory[] };

const top = (counts: Record<string, number>, n: number) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);

const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

function filterLabel(key: string) {
  const [kind, value] = key.split(":");
  if (kind === "diet") return DIET_TAGS.find((d) => d.key === value)?.label ?? value;
  const allergen = ALLERGENS.find((a) => a.key === value)?.label ?? value;
  return `${allergen} içermeyen`;
}

/** Menü istatistikleri: anonim sayaçlardan son 7/30 gün (menü sitesi → menuEvents → menuStats). */
export default function StatsCard({ cafeId, items, categories }: Props) {
  const [days, setDays] = useState<7 | 30>(7);
  const [stats, setStats] = useState<MenuStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStats((await getMenuStats({ cafeId, days })).data);
    } catch (err) {
      console.error("getMenuStats", err);
      setError("İstatistikler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [cafeId, days]);

  useEffect(() => {
    load();
  }, [load]);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs font-semibold">
        {([7, 30] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={days === d}
            onClick={() => setDays(d)}
            className={`rounded-full px-3 py-1 transition ${days === d ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            Son {d} gün
          </button>
        ))}
      </div>
      <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800">
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Yenile
      </button>
    </div>
  );

  if (loading && !stats) {
    return (
      <div className="space-y-4">
        {header}
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Yükleniyor…
        </div>
      </div>
    );
  }
  if (error || !stats) {
    return (
      <div className="space-y-4">
        {header}
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error || "Veri yok."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}
      <StatsBody stats={stats} days={days} items={items} categories={categories} />
    </div>
  );
}

/** Rapor gövdesi (veriden bağımsız; yükleme ve dönem seçimi StatsCard'da). */
export function StatsBody({ stats, days, items, categories }: { stats: MenuStats; days: 7 | 30; items: MenuItem[]; categories: MenuCategory[] }) {
  const itemName = (id: string) => items.find((i) => i.id === id)?.name.tr ?? "Silinmiş ürün";
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name.tr ?? "Silinmiş kategori";
  const productViews = Object.values(stats.items).reduce((a, b) => a + b, 0);
  const langTotal = Object.values(stats.lang).reduce((a, b) => a + b, 0);
  const enShare = langTotal ? Math.round(((stats.lang.en ?? 0) / langTotal) * 100) : 0;

  if (stats.opens === 0 && productViews === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center">
          <p className="text-sm font-semibold text-slate-700">Henüz veri yok</p>
          <p className="mt-1 text-xs text-slate-500">Müşteriler menünüzü açtıkça hangi ürünlere baktıkları burada görünür.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile value={stats.opens.toLocaleString("tr-TR")} label="menü açılışı" />
        <StatTile value={(Math.round((stats.opens / days) * 10) / 10).toLocaleString("tr-TR")} label="günlük ortalama" />
        <StatTile value={productViews.toLocaleString("tr-TR")} label="ürün incelemesi" />
        <StatTile value={`%${enShare}`} label="İngilizce menü" />
      </div>

      <ChartBox title="Günlere göre menü açılışı">
        <Columns
          values={stats.daily.map((d) => d.opens)}
          labels={stats.daily.map((d) => shortDay(d.day))}
          tooltip={(v, i) => `${shortDay(stats.daily[i].day)}: ${v} açılış`}
          labelEvery={days === 7 ? 1 : 5}
        />
      </ChartBox>

      <ChartBox title="Saatlere göre menü açılışı">
        <Columns values={stats.hours} labels={stats.hours.map((_, h) => `${h}`)} tooltip={(v, h) => `${String(h).padStart(2, "0")}:00–${String(h).padStart(2, "0")}:59: ${v} açılış`} labelEvery={3} />
      </ChartBox>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartBox title="En çok bakılan ürünler" hint="Ürüne tıklanıp ayrıntısı açılma sayısı">
          <Rows rows={top(stats.items, 10).map(([id, n]) => ({ label: itemName(id), value: n }))} empty="Henüz ürün incelenmedi." />
        </ChartBox>
        <ChartBox title="Kategorilere ulaşma" hint="Müşterinin kaydırarak ya da sekmeden ulaştığı kategoriler">
          <Rows rows={top(stats.cats, 10).map(([id, n]) => ({ label: categoryName(id), value: n }))} empty="Henüz veri yok." />
        </ChartBox>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ListBox
          title="Aranıp bulunamayanlar"
          hint="Müşterinin aradığı ama menünüzde olmayan ürünler: eklemeyi düşünebilirsiniz."
          rows={top(stats.misses, 10).map(([term, n]) => ({ label: `“${term}”`, value: n }))}
          empty="Bulunamayan arama yok."
        />
        <ListBox
          title="Tükendiyken bakılanlar"
          hint="Bitmiş ürüne gelen ilgi, yani kaçan talep."
          rows={top(stats.soldOut, 10).map(([id, n]) => ({ label: itemName(id), value: n }))}
          empty="Tükenmiş ürüne bakılmadı."
        />
        <ListBox
          title="Masalar"
          hint="Masa QR'larından açılış sayısı."
          rows={top(stats.tables, 10).map(([t, n]) => ({ label: `Masa ${t}`, value: n }))}
          empty="Masa QR'ından açılış yok."
        />
        <ListBox
          title="Filtre kullanımı"
          hint="Alerjen ve beslenme filtrelerini kullanan müşteriler."
          rows={top(stats.filters, 10).map(([k, n]) => ({ label: filterLabel(k), value: n }))}
          empty="Filtre kullanılmadı."
        />
      </div>

      <p className="text-[11px] text-slate-400">
        {shortDay(stats.from)} – {shortDay(stats.to)} · Anonim sayımdır; müşteri kimliği tutulmaz. Panel önizlemeleri sayılmaz.
      </p>
    </div>
  );
}

function StatTile({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function ChartBox({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 p-4">
      <h4 className="text-sm font-bold text-slate-900">{title}</h4>
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Dikey sütunlar: tek seri, tek renk; üstüne gelince değer. */
function Columns({ values, labels, tooltip, labelEvery }: { values: number[]; labels: string[]; tooltip: (v: number, i: number) => string; labelEvery: number }) {
  const max = Math.max(1, ...values);
  return (
    <div>
      <div className="flex h-36 items-end gap-0.5 border-b border-slate-200">
        {values.map((v, i) => (
          <div key={i} className="group relative flex h-full flex-1 items-end justify-center" aria-label={tooltip(v, i)}>
            <div className="w-full max-w-[28px] rounded-t-[4px] bg-emerald-500 transition group-hover:bg-emerald-600" style={{ height: v ? `${Math.max(3, (v / max) * 100)}%` : 0 }} />
            <span className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition group-hover:opacity-100">
              {tooltip(v, i)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5">
        {labels.map((l, i) => (
          <span key={i} className="flex-1 truncate text-center text-[10px] text-slate-400">
            {i % labelEvery === 0 ? l : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Yatay çubuklar: ad solda, değer sağda, çubuk altta. */
function Rows({ rows, empty }: { rows: { label: string; value: number }[]; empty: string }) {
  if (!rows.length) return <p className="text-xs text-slate-400">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="group">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-slate-700">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">{r.value}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-emerald-500 transition group-hover:bg-emerald-600" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ListBox({ title, hint, rows, empty }: { title: string; hint: string; rows: { label: string; value: number }[]; empty: string }) {
  return (
    <ChartBox title={title} hint={hint}>
      {rows.length ? (
        <ul className="divide-y divide-slate-100 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex justify-between gap-3 py-1.5">
              <span className="truncate text-slate-700">{r.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-900">{r.value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">{empty}</p>
      )}
    </ChartBox>
  );
}
