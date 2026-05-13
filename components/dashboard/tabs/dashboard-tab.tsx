"use client";

import { useEffect, useState } from "react";
import {
  Gift,
  Percent,
  Sparkles,
  WalletCards,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  Clock,
} from "lucide-react";
import {
  collectionGroup,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { BusinessForm, LoyaltyForm } from "../types";

type Props = {
  businessForm: BusinessForm;
  loyaltyForm: LoyaltyForm;
};

type Stats = {
  activeCards: number;
  totalRewards: number;
  totalStamps: number;
  activeCampaigns: number;
};

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  loading,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
            {label}
          </p>
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {loading ? (
              <span className="inline-block h-7 w-12 animate-pulse rounded-lg bg-slate-100" />
            ) : (
              value.toLocaleString("tr-TR")
            )}
          </p>
          <p className="mt-2 text-sm text-slate-500">{hint}</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardTab({ businessForm, loyaltyForm }: Props) {
  const [stats, setStats] = useState<Stats>({
    activeCards: 0,
    totalRewards: 0,
    totalStamps: 0,
    activeCampaigns: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!businessForm?.cafeId) return;
      try {
        const pointsSnap = await getDocs(
          query(
            collectionGroup(db, "points"),
            where("cafeId", "==", businessForm.cafeId)
          )
        );

        let totalRewards = 0;
        let totalStamps = 0;
        pointsSnap.forEach((d) => {
          totalRewards += Number(d.data().rewards ?? 0);
          totalStamps += Number(d.data().stamps ?? 0);
        });

        const campSnap = await getDocs(
          collection(db, "cafes", businessForm.cafeId, "campaigns")
        );
        const activeCampaigns = campSnap.docs.filter(
          (d) => d.data().isEnabled === true
        ).length;

        setStats({ activeCards: pointsSnap.size, totalRewards, totalStamps, activeCampaigns });
      } catch (err) {
        console.error("Dashboard stats error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [businessForm?.cafeId]);

  const initials = (businessForm.cafeName || "K")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const approvalLabel =
    businessForm.approvalStatus === "approved"
      ? "Onaylı"
      : businessForm.approvalStatus === "pending"
      ? "Onay Bekliyor"
      : businessForm.approvalStatus === "rejected"
      ? "Reddedildi"
      : "—";

  const approvalColor =
    businessForm.approvalStatus === "approved"
      ? "bg-emerald-100 text-emerald-700"
      : businessForm.approvalStatus === "pending"
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-600";

  return (
    <div className="space-y-6">

      {/* ── HERO HEADER ── */}
      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-500" />
          <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/5" />
          <div className="absolute -bottom-6 right-24 h-32 w-32 rounded-full bg-white/5" />

          <div className="relative flex flex-col gap-4 px-6 py-7 sm:flex-row sm:items-center sm:px-8">
            {/* Logo / Avatar */}
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/15 text-2xl font-bold text-white ring-2 ring-white/20">
              {businessForm.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={businessForm.logoUrl}
                  alt={businessForm.cafeName}
                  className="h-full w-full object-cover"
                />
              ) : (
                initials
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">
                LoopyGo Owner Panel
              </p>
              <h1 className="mt-0.5 truncate text-2xl font-bold text-white sm:text-3xl">
                {businessForm.cafeName || "Kafe adı"}
              </h1>
              {businessForm.category && (
                <p className="mt-1 text-sm text-white/70">{businessForm.category}</p>
              )}
            </div>

            {/* Status badges */}
            <div className="flex flex-wrap gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  businessForm.isOpen
                    ? "bg-white/20 text-white"
                    : "bg-black/20 text-white/60"
                }`}
              >
                {businessForm.isOpen ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
                {businessForm.isOpen ? "Açık" : "Kapalı"}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  businessForm.isVisible
                    ? "bg-white/20 text-white"
                    : "bg-black/20 text-white/60"
                }`}
              >
                {businessForm.isVisible ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
                {businessForm.isVisible ? "Yayında" : "Gizli"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Toplam Damga"
          value={stats.totalStamps}
          hint="Tüm müşterilerin toplam damgası"
          icon={Sparkles}
          loading={loading}
        />
        <StatCard
          label="Aktif Kartlar"
          value={stats.activeCards}
          hint="Bu kafede kartı olan kullanıcı"
          icon={WalletCards}
          loading={loading}
        />
        <StatCard
          label="Toplam Ödül"
          value={stats.totalRewards}
          hint="Müşterilerin birikmiş toplam ödülü"
          icon={Gift}
          loading={loading}
        />
        <StatCard
          label="Aktif Kampanya"
          value={stats.activeCampaigns}
          hint="Şu an aktif kampanya sayısı"
          icon={Percent}
          loading={loading}
        />
      </div>

      {/* ── BOTTOM ROW ── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Sadakat Programı */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              Sadakat Programı
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-900">
              Kart ayarlarına genel bakış
            </h2>
          </div>

          {loyaltyForm.rewardBuy > 0 ? (
            <div className="space-y-3 p-6">
              <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-500">Gerekli Damga</span>
                <span className="text-lg font-bold text-emerald-600">
                  {loyaltyForm.rewardBuy}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-500">Verilecek Hediye</span>
                <span className="text-lg font-bold text-emerald-600">
                  {loyaltyForm.rewardGift}
                </span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs text-slate-500">Program aktif</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
              <WalletCards className="mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">
                Henüz sadakat programı kurulmamış.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Sadakat Kart Programı sekmesinden ayarlayın.
              </p>
            </div>
          )}
        </div>

        {/* Kafe Durumu */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              Kafe Durumu
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-900">
              Mevcut durum özeti
            </h2>
          </div>

          <div className="space-y-3 p-6">
            <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2">
                {businessForm.isVisible ? (
                  <Eye className="h-4 w-4 text-emerald-600" />
                ) : (
                  <EyeOff className="h-4 w-4 text-slate-400" />
                )}
                <span className="text-sm text-slate-600">Yayın Durumu</span>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  businessForm.isVisible
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {businessForm.isVisible ? "Yayında" : "Gizli"}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-600">Kafe Durumu</span>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  businessForm.isOpen
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-600"
                }`}
              >
                {businessForm.isOpen ? "Açık" : "Kapalı"}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-600">Admin Onayı</span>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${approvalColor}`}>
                {approvalLabel}
              </span>
            </div>

            {businessForm.address && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="mb-0.5 text-xs font-semibold text-slate-400">Adres</p>
                <p className="line-clamp-2 text-sm text-slate-700">
                  {businessForm.address}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
