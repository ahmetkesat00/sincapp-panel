"use client";

import { Check, ImageOff, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { saveBrandingSettings } from "@/lib/qr-menu/firestore";
import { MENU_BASE_URL, type QrMenuSettings } from "@/lib/qr-menu/types";

type Props = {
  cafeId: string;
  settings: QrMenuSettings;
  logoUrl?: string;
  onChange: (patch: Partial<QrMenuSettings>) => void;
};

type CardStyle = NonNullable<QrMenuSettings["loyaltyCardStyle"]>;
type LogoBg = NonNullable<QrMenuSettings["logoBackground"]>;

const CARD_STYLES: { id: CardStyle; name: string; hint: string }[] = [
  { id: "block", name: "Blok başlıklı", hint: "Koyu zemin, büyük \"Kahve Kartı\" başlığı" },
  { id: "split", name: "Klasik damga kartı", hint: "Solda logo ve çizim, sağda damgalar" },
];

const LOGO_BGS: { id: LogoBg; label: string }[] = [
  { id: "auto", label: "Otomatik" },
  { id: "light", label: "Açık" },
  { id: "dark", label: "Koyu" },
];

/** Tasarım sekmesi: menüdeki damga kartının şablonu ve logonun zemini. Kaydedildiği an menüye yansır. */
export default function BrandingCard({ cafeId, settings, logoUrl, onChange }: Props) {
  const [saving, setSaving] = useState<string>("");
  const [error, setError] = useState("");
  const cardStyle: CardStyle = settings.loyaltyCardStyle ?? "block";
  const logoBg: LogoBg = settings.logoBackground ?? "auto";
  const darkApplied = logoBg === "dark" || (logoBg === "auto" && settings.logoIsLight === true);

  const save = async (key: string, patch: Partial<QrMenuSettings>) => {
    setSaving(key);
    setError("");
    try {
      await saveBrandingSettings(cafeId, patch);
      onChange(patch);
    } catch (err) {
      console.error(err);
      setError("Kaydedilemedi, tekrar deneyin.");
    } finally {
      setSaving("");
    }
  };

  return (
    <div className="space-y-6 border-t border-slate-100 pt-6">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Damga kartı</h3>
          <p className="text-xs text-slate-500">
            Menünüzün üstünde, kafenizin logosu, adı, renkleri ve sadakat programınızla görünür. Seçim hemen menüye yansır.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {CARD_STYLES.map((s) => {
            const active = cardStyle === s.id;
            return (
              <button
                key={s.id}
                type="button"
                disabled={!!saving}
                onClick={() => !active && save(`card-${s.id}`, { loyaltyCardStyle: s.id })}
                aria-pressed={active}
                className={`overflow-hidden rounded-2xl border p-3 text-left transition ${
                  active ? "border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-100" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${MENU_BASE_URL}/cards/${s.id}.jpg`} alt={`${s.name} önizleme`} className="w-full rounded-xl" />
                <span className="mt-2.5 flex items-center justify-between gap-2">
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{s.name}</span>
                    <span className="block text-[11px] text-slate-500">{s.hint}</span>
                  </span>
                  {saving === `card-${s.id}` ? (
                    <LoaderCircle className="h-4 w-4 animate-spin text-slate-400" />
                  ) : active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
                      <Check className="h-3 w-3" /> Seçili
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400">Damga sayısı ve ürün türü &quot;Sadakat Kart Programı&quot;ndan gelir; programınız yoksa kart menüde görünmez.</p>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Logo zemini</h3>
          <p className="text-xs text-slate-500">Logonuz menüde kırpılmadan, bir daire ya da kutu içinde gösterilir. Beyaz/açık renkli logolar koyu zeminde daha iyi görünür.</p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs font-semibold">
            {LOGO_BGS.map((b) => (
              <button
                key={b.id}
                type="button"
                disabled={!!saving}
                aria-pressed={logoBg === b.id}
                onClick={() => logoBg !== b.id && save(`logo-${b.id}`, { logoBackground: b.id })}
                className={`rounded-full px-3 py-1 transition ${logoBg === b.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {[false, true].map((dark) => (
              <span
                key={String(dark)}
                className={`grid h-14 w-14 place-items-center overflow-hidden rounded-full ring-2 transition ${
                  darkApplied === dark ? "ring-emerald-500" : "opacity-40 ring-slate-200"
                }`}
                style={{ background: dark ? settings.theme.primaryDark : "#ffffff" }}
                title={dark ? "Koyu zemin" : "Açık zemin"}
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="h-full w-full object-contain p-[12%]" />
                ) : (
                  <ImageOff className="h-4 w-4 text-slate-300" />
                )}
              </span>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          {!logoUrl
            ? "Logo yüklenmemiş; menüde kafe adının baş harfleri gösterilir. Logoyu İşletme Yönetimi'nden ekleyebilirsiniz."
            : logoBg === "auto"
              ? settings.logoIsLight
                ? "Logonuz açık renkli algılandı; koyu zeminde gösteriliyor."
                : settings.logoCheckedFor === logoUrl
                  ? "Logonuz beyaz zeminde gösteriliyor."
                  : "Logonuz inceleniyor…"
              : `Logonuz her zaman ${logoBg === "dark" ? "koyu" : "beyaz"} zeminde gösterilir.`}
        </p>
      </section>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
