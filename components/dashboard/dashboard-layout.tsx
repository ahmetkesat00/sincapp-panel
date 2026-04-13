"use client";

import type { ReactNode } from "react";

type Props = {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
};

export default function DashboardLayout({
  sidebar,
  header,
  children,
}: Props) {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        {sidebar}
        <div className="min-w-0">
          {header}
          <div className="p-4 sm:p-6">{children}</div>
        </div>
      </div>
    </main>
  );
}