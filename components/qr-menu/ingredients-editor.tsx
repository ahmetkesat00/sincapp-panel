"use client";

import { Plus, Trash2 } from "lucide-react";
import { ALLERGENS, type Allergen, type Ingredient } from "@/lib/qr-menu/types";
import { ChipToggle, inputCls, smallBtnCls } from "./ui";

type Props = {
  value: Ingredient[];
  onChange: (v: Ingredient[]) => void;
  showEn: boolean;
  /** Seçenek içinde kullanılırken daha sade görünüm. */
  compact?: boolean;
};

const allergenLabel = (a: Allergen) => ALLERGENS.find((x) => x.key === a)?.label ?? a;

export default function IngredientsEditor({ value, onChange, showEn, compact }: Props) {
  const update = (index: number, patch: Partial<Ingredient>) =>
    onChange(value.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)));

  const toggleAllergen = (index: number, a: Allergen) => {
    const current = value[index].allergens ?? [];
    update(index, { allergens: current.includes(a) ? current.filter((x) => x !== a) : [...current, a] });
  };

  return (
    <div className="space-y-2">
      {value.map((ing, index) => (
        <div key={index} className={`rounded-xl border border-slate-200 ${compact ? "bg-white p-2" : "bg-slate-50/60 p-3"}`}>
          <div className="flex items-start gap-2">
            <div className={`grid flex-1 gap-2 ${showEn ? "sm:grid-cols-2" : ""}`}>
              <input
                value={ing.name.tr}
                onChange={(e) => update(index, { name: { ...ing.name, tr: e.target.value } })}
                placeholder="Bileşen adı (ör. Süt)"
                className={inputCls}
              />
              {showEn && (
                <input
                  value={ing.name.en ?? ""}
                  onChange={(e) => update(index, { name: { ...ing.name, en: e.target.value } })}
                  placeholder="İngilizce (opsiyonel)"
                  className={inputCls}
                />
              )}
            </div>
            <button
              type="button"
              aria-label="Bileşeni sil"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              className="mt-1 rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {(ing.allergens ?? []).map((a) => (
              <ChipToggle key={a} active tone="amber" onClick={() => toggleAllergen(index, a)}>
                {allergenLabel(a)} ✕
              </ChipToggle>
            ))}
            <select
              value=""
              onChange={(e) => e.target.value && toggleAllergen(index, e.target.value as Allergen)}
              className="rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-600 outline-none"
            >
              <option value="">+ Alerjen</option>
              {ALLERGENS.filter((a) => !(ing.allergens ?? []).includes(a.key)).map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
            <ChipToggle active={!!ing.alcohol} tone="rose" onClick={() => update(index, { alcohol: !ing.alcohol || undefined })}>
              Alkol
            </ChipToggle>
            <ChipToggle active={!!ing.pork} tone="rose" onClick={() => update(index, { pork: !ing.pork || undefined })}>
              Domuz kaynaklı
            </ChipToggle>
          </div>
        </div>
      ))}

      <button type="button" className={smallBtnCls} onClick={() => onChange([...value, { name: { tr: "" } }])}>
        <Plus className="h-3.5 w-3.5" />
        Bileşen ekle
      </button>
    </div>
  );
}
