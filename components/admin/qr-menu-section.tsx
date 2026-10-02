"use client";

import { QrCode, Search } from "lucide-react";
import { useMemo, useState } from "react";
import QrMenuEditor from "@/components/qr-menu/qr-menu-editor";

type CafeOption = { id: string; name: string };

const cardCls = "rounded-3xl border border-slate-200 bg-white shadow-sm";

export default function QrMenuSection({ cafes }: { cafes: CafeOption[] }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const selected = cafes.find((c) => c.id === selectedId);
  const matches = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    const sorted = [...cafes].sort((a, b) => a.name.localeCompare(b.name, "tr"));
    return q ? sorted.filter((c) => c.name.toLocaleLowerCase("tr").includes(q) || c.id.toLowerCase().includes(q)) : sorted;
  }, [cafes, search]);

  return (
    <section id="section-qr-menu" className={cardCls}>
      <div className="border-b border-slate-200 px-6 py-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">QR Menü</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">İşletme menülerini düzenle</h2>
        <p className="mt-1 text-sm text-slate-500">
          Kategoriler, ürünler, içindekiler, alerjenler ve kalori bilgileri. Değişiklikler menu.loopygo.app üzerinde yayınlanır.
        </p>
      </div>

      <div className="space-y-5 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İşletme ara"
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />
          </div>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
          >
            <option value="">İşletme seçin ({matches.length})</option>
            {matches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.id}
              </option>
            ))}
          </select>
        </div>

        {selected ? (
          // key: işletme değişince editör sıfırdan yüklenir.
          <QrMenuEditor key={selected.id} cafeId={selected.id} cafeName={selected.name} />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center">
            <QrCode className="mx-auto h-6 w-6 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">Menüsünü düzenlemek için bir işletme seçin.</p>
          </div>
        )}
      </div>
    </section>
  );
}
