"use client";

import QrMenuEditor from "@/components/qr-menu/qr-menu-editor";
import { shellCardClass } from "../helpers";
import SectionTitle from "../ui/section-title";

type Props = { cafeId: string; cafeName: string };

export default function QrMenuTab({ cafeId, cafeName }: Props) {
  return (
    <div className="space-y-6">
      <section className={`${shellCardClass()} overflow-hidden`}>
        <SectionTitle eyebrow="QR Menü" title="Dijital menünüzü yönetin" />
        <div className="p-6">
          {cafeId ? (
            <QrMenuEditor key={cafeId} cafeId={cafeId} cafeName={cafeName} />
          ) : (
            <p className="text-sm text-slate-500">İşletme bilgileri yükleniyor…</p>
          )}
        </div>
      </section>
    </div>
  );
}
