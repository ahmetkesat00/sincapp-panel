"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { adjustPoints, type AdjustPointsResult } from "@/lib/points";

type Props = {
  mode: "owner" | "admin";
  userUid: string;
  cafeId: string;
  stamps: number;
  rewards: number;
  /** Kart hedefi biliniyorsa önizlemede yıldız → ödül dönüşümü gösterilir. */
  goal?: number;
  onDone: (result: AdjustPointsResult) => void;
  onCancel: () => void;
};

const OWNER_MAX = 10;

function Stepper({ value, onChange, min, max, label }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string }) {
  const btn =
    "flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-40";
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-xs font-medium text-slate-500">{label}</span>
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`${label} azalt`}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-10 text-center text-sm font-bold tabular-nums text-slate-900">{value > 0 ? `+${value}` : value}</span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`${label} artır`}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function AdjustPointsForm({ mode, userUid, cafeId, stamps, rewards, goal, onDone, onCancel }: Props) {
  const isAdmin = mode === "admin";
  const [stampDelta, setStampDelta] = useState(1);
  const [rewardDelta, setRewardDelta] = useState(0);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Önizleme (sunucu aynı hesabı yapar; hedef bilinmiyorsa dönüşüm gösterilmez)
  const raw = stamps + stampDelta;
  const earned = goal && goal > 0 && raw > 0 ? Math.floor(raw / goal) : 0;
  const nextStamps = goal && goal > 0 && raw > 0 ? raw % goal : raw;
  const nextRewards = rewards + earned + rewardDelta;
  const invalid =
    (stampDelta === 0 && rewardDelta === 0) || raw < 0 || nextRewards < 0 || (isAdmin && reason.trim().length < 3);

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await adjustPoints({
        userUid,
        cafeId,
        stampDelta,
        ...(isAdmin && { rewardDelta }),
        ...(reason.trim() && { reason: reason.trim() }),
      });
      onDone(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Stepper
          label="Damga"
          value={stampDelta}
          onChange={setStampDelta}
          min={isAdmin ? -stamps : 1}
          max={isAdmin ? 100 : OWNER_MAX}
        />
        {isAdmin && <Stepper label="Ödül" value={rewardDelta} onChange={setRewardDelta} min={-(rewards + earned)} max={20} />}
        <p className="text-xs text-slate-500">
          ☕ {stamps} → <b className="text-slate-800">{nextStamps}</b>
          <span className="mx-2 text-slate-300">·</span>
          🎁 {rewards} → <b className="text-slate-800">{nextRewards}</b>
          {earned > 0 && <span className="ml-2 font-semibold text-amber-700">(+{earned} ödül kazanır)</span>}
          {!goal && stampDelta > 0 && <span className="ml-2 text-slate-400">(kart hedefine ulaşırsa ödüle dönüşür)</span>}
        </p>
      </div>

      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={200}
        placeholder={isAdmin ? "Açıklama (zorunlu) — örn. QR hatası telafisi" : "Not (isteğe bağlı) — örn. QR okunmadı"}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
      />

      {error && <p className="text-xs font-medium text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100">
          Vazgeç
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving || invalid}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Kaydediliyor..." : isAdmin ? "Kaydet" : `${stampDelta} damga ver`}
        </button>
      </div>
    </div>
  );
}
