"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { LocalizedText } from "@/lib/qr-menu/types";

export const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";

export const smallBtnCls =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";

export const primaryBtnCls =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60";

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-slate-400">{hint}</span>}
    </label>
  );
}

/** Türkçe zorunlu + İngilizce opsiyonel metin alanı çifti. */
export function LocalizedInput({
  value,
  onChange,
  placeholder,
  multiline,
  showEn = true,
}: {
  value: LocalizedText | undefined;
  onChange: (v: LocalizedText) => void;
  placeholder?: string;
  multiline?: boolean;
  showEn?: boolean;
}) {
  const v = value ?? { tr: "" };
  const Tag = multiline ? "textarea" : "input";
  return (
    <div className={`grid gap-2 ${showEn ? "sm:grid-cols-2" : ""}`}>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-2 text-[10px] font-bold text-slate-400">TR</span>
        <Tag
          value={v.tr}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...v, tr: e.target.value })}
          placeholder={placeholder}
          rows={multiline ? 2 : undefined}
          className={`${inputCls} pl-8`}
        />
      </div>
      {showEn && (
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-2 text-[10px] font-bold text-slate-400">EN</span>
          <Tag
            value={v.en ?? ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...v, en: e.target.value })}
            placeholder="İngilizce (opsiyonel)"
            rows={multiline ? 2 : undefined}
            className={`${inputCls} pl-8`}
          />
        </div>
      )}
    </div>
  );
}

export function ChipToggle({
  active,
  onClick,
  children,
  tone = "emerald",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "emerald" | "amber" | "rose";
}) {
  const on = {
    emerald: "border-emerald-600 bg-emerald-600 text-white",
    amber: "border-amber-500 bg-amber-500 text-white",
    rose: "border-rose-600 bg-rose-600 text-white",
  }[tone];
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${active ? on : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm font-medium text-slate-700"
    >
      <span className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-emerald-600" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

/**
 * Tıklayınca açılan bölüm. Kapalıyken başlık ve tek satırlık özet görünür.
 * İçerik ilk açılıştan sonra kapansa da DOM'da kalır; yarım kalmış form kaybolmaz.
 */
export function Collapsible({
  id,
  icon,
  title,
  summary,
  open,
  onOpenChange,
  children,
}: {
  id?: string;
  icon: React.ReactNode;
  title: string;
  summary?: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  return (
    <div
      id={id}
      className={`scroll-mt-6 overflow-hidden rounded-2xl border transition ${open ? "border-slate-300 shadow-sm" : "border-slate-200 hover:border-slate-300"}`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-900">{title}</span>
          {summary && <span className="block truncate text-xs text-slate-500">{summary}</span>}
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {mounted && (
        <div hidden={!open} className="border-t border-slate-100 p-5">
          {children}
        </div>
      )}
    </div>
  );
}

export const numberOrUndefined = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? undefined : Number(s));
