"use client";

import type { ComponentType } from "react";

type Props = {
  label: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
};

export default function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: Props) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
            {label}
          </p>
          <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
          <p className="mt-2 text-sm text-slate-500">{hint}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}