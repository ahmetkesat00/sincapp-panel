"use client";

import { LogOut } from "lucide-react";
import type { NavId, NavItem } from "./types";

type Props = {
  navItems: NavItem[];
  activePage: NavId;
  onChangePage: (page: NavId) => void;
  cafeName: string;
  category: string;
  onLogout: () => void;
};

export default function DashboardSidebar({
  navItems,
  activePage,
  onChangePage,
  cafeName,
  category,
  onLogout,
}: Props) {
  return (
    <aside className="border-r border-slate-200 bg-slate-950 text-white">
      <div className="flex h-full flex-col p-5 overflow-y-auto">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500 font-bold text-white">
              S
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                SincApp
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                Owner Panel
              </p>
            </div>
          </div>
        </div>

        <nav className="mt-6 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangePage(item.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                  isActive
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto rounded-3xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold text-white">
            {cafeName || "Kafe adı"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {category || "Kategori"}
          </p>
          <button
            type="button"
            onClick={onLogout}
            className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
          >
            <LogOut className="h-4 w-4" />
            Çıkış yap
          </button>
        </div>
      </div>
    </aside>
  );
}