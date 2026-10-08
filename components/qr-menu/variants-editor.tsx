"use client";

import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { VARIANT_TEMPLATES, newOptionId } from "@/lib/qr-menu/templates";
import type { VariantGroup, VariantOption } from "@/lib/qr-menu/types";
import IngredientsEditor from "./ingredients-editor";
import { LocalizedInput, inputCls, numberOrUndefined, smallBtnCls } from "./ui";

type Props = {
  basePrice: number;
  onDefaultChange: (groupId: string, optionId: string) => void;
  value: VariantGroup[];
  onChange: (v: VariantGroup[]) => void;
  showEn: boolean;
};

export default function VariantsEditor({ basePrice, onDefaultChange, value, onChange, showEn }: Props) {
  const updateGroup = (gi: number, patch: Partial<VariantGroup>) =>
    onChange(value.map((g, i) => (i === gi ? { ...g, ...patch } : g)));

  const updateOption = (gi: number, oi: number, patch: Partial<VariantOption>) =>
    updateGroup(gi, { options: value[gi].options.map((o, i) => (i === oi ? { ...o, ...patch } : o)) });

  return (
    <div className="space-y-3">
      {value.map((group, gi) => (
        <div key={group.id} className="rounded-2xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-[220px] flex-1">
              <LocalizedInput value={group.name} onChange={(name) => updateGroup(gi, { name })} placeholder="Grup adı (ör. Boy)" showEn={showEn} />
            </div>
            <select
              value={group.selection}
              onChange={(e) => updateGroup(gi, { selection: e.target.value as VariantGroup["selection"] })}
              className={`${inputCls} w-auto`}
            >
              <option value="single">Tek seçim (zorunlu)</option>
              <option value="multi">Ekstra (isteğe bağlı, çoklu)</option>
            </select>
            <button
              type="button"
              aria-label="Grubu sil"
              onClick={() => onChange(value.filter((_, i) => i !== gi))}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {group.selection === "single" && <label className="mt-2 block text-xs text-slate-500">Varsayılan seçenek<select className={`${inputCls} mt-1`} value={group.options[0]?.id ?? ""} onChange={(e) => onDefaultChange(group.id, e.target.value)}>{group.options.map((o) => <option key={o.id} value={o.id}>{o.name.tr || "Adsız seçenek"}</option>)}</select></label>}

          <div className="mt-3 space-y-2">
            {group.options.map((opt, oi) => (
              <OptionRow
                key={opt.id}
                option={opt}
                isDefault={group.selection === "single" && oi === 0}
                showEn={showEn}
                basePrice={basePrice}
                single={group.selection === "single"}
                onChange={(patch) => updateOption(gi, oi, patch)}
                onDelete={() => updateGroup(gi, { options: group.options.filter((_, i) => i !== oi) })}
              />
            ))}
            <button
              type="button"
              className={smallBtnCls}
              onClick={() => updateGroup(gi, { options: [...group.options, { id: newOptionId(), name: { tr: "" }, priceDelta: 0 }] })}
            >
              <Plus className="h-3.5 w-3.5" />
              Seçenek ekle
            </button>
          </div>
        </div>
      ))}

      <select
        value=""
        onChange={(e) => {
          const tpl = VARIANT_TEMPLATES.find((t) => t.key === e.target.value);
          if (tpl) { const built = tpl.build(); if (!value.some((g) => g.id === built.id)) onChange([...value, built]); }
        }}
        className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none"
      >
        <option value="">+ Seçenek grubu ekle…</option>
        {VARIANT_TEMPLATES.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function OptionRow({
  option,
  isDefault,
  showEn,
  onChange,
  onDelete,
  basePrice, single,
}: {
  option: VariantOption;
  isDefault: boolean;
  showEn: boolean;
  onChange: (patch: Partial<VariantOption>) => void;
  onDelete: () => void;
  basePrice: number;
  single: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ingredientCount = option.ingredients?.length ?? 0;
  const warnDefault = isDefault && (option.priceDelta !== 0 || (option.calorieDelta ?? 0) !== 0);

  return (
    <div className="rounded-xl bg-slate-50 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={option.name.tr}
          onChange={(e) => onChange({ name: { ...option.name, tr: e.target.value } })}
          placeholder="Seçenek (ör. Orta)"
          className={`${inputCls} min-w-[140px] flex-1`}
        />
        {showEn && (
          <input
            value={option.name.en ?? ""}
            onChange={(e) => onChange({ name: { ...option.name, en: e.target.value } })}
            placeholder="EN"
            className={`${inputCls} w-28`}
          />
        )}
        <label className="flex items-center gap-1 text-xs text-slate-500">
          {single ? "₺" : "+₺"}
          <input
            type="number"
            min={single ? 0 : undefined}
            step="0.01"
            disabled={isDefault}
            value={single ? Math.round((basePrice + option.priceDelta) * 100) / 100 : option.priceDelta}
            onChange={(e) => onChange({ priceDelta: single ? Math.round((Number(e.target.value) - basePrice) * 100) / 100 : Number(e.target.value) || 0 })}
            className={`${inputCls} w-20`}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          ±kcal
          <input
            type="number"
            disabled={isDefault}
            value={option.calorieDelta ?? ""}
            onChange={(e) => onChange({ calorieDelta: numberOrUndefined(e.target.value) })}
            className={`${inputCls} w-20`}
          />
        </label>
        <input
          value={option.portion ?? ""}
          onChange={(e) => onChange({ portion: e.target.value || undefined })}
          placeholder="Porsiyon (ör. 350 ml)"
          className={`${inputCls} w-36`}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Bileşen ({ingredientCount})
        </button>
        <button type="button" aria-label="Seçeneği sil" disabled={isDefault} title={isDefault ? "Silmek için önce başka bir varsayılan seçenek seçin" : "Seçeneği sil"} onClick={onDelete} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {warnDefault && <p className="mt-1.5 text-[11px] font-medium text-amber-700">Varsayılan seçeneğin fiyat ve kalori farkı 0 olmalı.</p>}
      {open && (
        <div className="mt-2">
          <p className="mb-1.5 text-[11px] text-slate-400">Bu seçenek seçilince ürüne eklenen bileşenler (ör. yulaf içeceği → gluten).</p>
          <IngredientsEditor value={option.ingredients ?? []} onChange={(ingredients) => onChange({ ingredients })} showEn={showEn} compact />
        </div>
      )}
    </div>
  );
}
