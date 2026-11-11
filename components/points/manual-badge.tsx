import { Hand } from "lucide-react";

/** Panelden elle verilen damga (QR okutulmadan) — işlem listelerinde gösterilir. */
export default function ManualBadge({ role }: { role?: string }) {
  return (
    <span
      title={role === "admin" ? "Admin tarafından panelden manuel eklendi" : "İşletme tarafından panelden manuel eklendi (QR okutulmadı)"}
      className="ml-2 inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 align-middle text-[11px] font-semibold text-sky-700"
    >
      <Hand className="h-3 w-3" />
      Manuel
    </span>
  );
}
