"use client";

import { useEffect, useRef, useState } from "react";
import { MENU_BASE_URL, type MenuCategory, type MenuItem, type QrMenuSettings } from "@/lib/qr-menu/types";

export type PreviewData = {
  cafe: { id: string; name: string; logoUrl?: string; heroImage?: string; address?: string; instagramUrl?: string; location?: { lat: number; lng: number }; workingHours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", { isOpen: boolean; openTime: string; closeTime: string }>>; qrMenu: QrMenuSettings; loyaltyCards?: { id: string; itemTypeId: string; rewardBuy: number; rewardGift: number }[] };
  categories: MenuCategory[];
  items: MenuItem[];
};

/** Panelin zaten yetkili olarak okuduğu veriyi iframe'e yollar; kapalı menüyü herkese açmaz. */
export default function MenuPreview({ data, className = "h-full w-full border-0", onReady, onEditItem }: { data: PreviewData; className?: string; onReady?: () => void; onEditItem?: (id: string) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rendered, setRendered] = useState(false);
  const origin = new URL(MENU_BASE_URL).origin;
  const payload = useRef(data);
  payload.current = data;
  const callbacks = useRef({ onReady, onEditItem });
  callbacks.current = { onReady, onEditItem };
  const send = () => {
    const publicData = JSON.parse(JSON.stringify(payload.current, (key, value) => ["recipe", "recipeDelta", "calorieInfo"].includes(key) ? undefined : value));
    frame.current?.contentWindow?.postMessage({ source: "loopygo-panel", type: "preview-data", data: publicData, editMode: Boolean(callbacks.current.onEditItem) }, origin);
  };
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow || event.data?.source !== "loopygo-menu") return;
      if (event.data.type === "preview-ready") { setReady(true); setFailed(false); send(); }
      if (event.data.type === "preview-rendered") { setRendered(true); setFailed(false); callbacks.current.onReady?.(); }
      if (event.data.type === "edit-item" && typeof event.data.itemId === "string") callbacks.current.onEditItem?.(event.data.itemId);
    };
    window.addEventListener("message", receive);
    const timeout = setTimeout(() => setFailed(true), 15000);
    return () => { window.removeEventListener("message", receive); clearTimeout(timeout); };
    // İlk el sıkışma; güncel veri aşağıdaki effect ile gönderilir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin]);
  useEffect(() => { if (ready) send(); }, [data, ready, onEditItem]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="relative h-full w-full">
    <iframe ref={frame} src={`${MENU_BASE_URL}/preview`} title="Kendi menünüzün önizlemesi" className={className} />
    {!rendered && <div className="absolute inset-0 grid place-items-center bg-slate-50 p-5 text-center text-sm text-slate-500" role="status">{failed ? "Önizleme açılamadı. Menü sitesi güncel sürümünü kontrol edip yeniden deneyin." : "Menünüz hazırlanıyor…"}</div>}
  </div>;
}
