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
    <main className="bg-slate-100 text-slate-900">
      <div className="flex min-h-screen lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="hidden lg:block sticky top-0 h-screen overflow-y-auto shrink-0 w-[280px]">
          {sidebar}
        </div>
        <div className="min-w-0 flex flex-col">
          {header}
          <div className="flex-1 p-4 sm:p-6">{children}</div>
        </div>
      </div>
    </main>
  );
}