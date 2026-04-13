"use client";

import { Clock3, Save } from "lucide-react";
import type { NavId, NavItem } from "./types";
import { ghostButtonClass, primaryButtonClass } from "./helpers";

type Props = {
  activePage: NavId;
  navItems: NavItem[];
  lastUpdatedText: string;
};

export default function DashboardHeader({
  activePage,
  navItems,
  lastUpdatedText,
}: Props) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
            {navItems.find((item) => item.id === activePage)?.label}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-500">
            SincApp owner paneli
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" className={ghostButtonClass()}>
            <Clock3 className="mr-2 h-4 w-4" />
            Son güncelleme: {lastUpdatedText}
          </button>
          <button type="button" className={primaryButtonClass()}>
            <Save className="h-4 w-4" />
            Değişiklikleri Kaydet
          </button>
        </div>
      </div>
    </header>
  );
}