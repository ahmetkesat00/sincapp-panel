"use client";

import QrMenuEditor from "@/components/qr-menu/qr-menu-editor";
import { shellCardClass } from "../helpers";

type Props = { cafeId: string; cafeName: string };

/** QR Menü sekmesi: başlık, Menü Sihirbazı ve sekmeler editörün kendi kartlarında. */
export default function QrMenuTab({ cafeId, cafeName }: Props) {
  if (!cafeId) {
    return (
      <section className={`${shellCardClass()} p-6`}>
        <p className="text-sm text-slate-500">İşletme bilgileri yükleniyor…</p>
      </section>
    );
  }
  return <QrMenuEditor key={cafeId} cafeId={cafeId} cafeName={cafeName} />;
}
