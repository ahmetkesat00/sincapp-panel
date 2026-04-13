"use client";

import { useEffect, useState } from "react";
import { Gift, Percent, Sparkles, WalletCards } from "lucide-react";

import {
  collectionGroup,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import StatCard from "../ui/stat-card";
import SectionTitle from "../ui/section-title";
import { shellCardClass } from "../helpers";

import type {
  BusinessForm,
  Campaign,
  ChartDataItem,
  Customer,
  DashboardStats,
  LoyaltyForm,
} from "../types";

type Props = {
  businessForm: BusinessForm;
  loyaltyForm: LoyaltyForm;
  stats: DashboardStats;
  customers: Customer[];
  campaigns: Campaign[];
  weeklyStampData: ChartDataItem[];
  topCampaignData: ChartDataItem[];
  previewText: string;
};

type PointsData = {
  activeCards: number;
  totalRewards: number;
  totalStamps: number;
};

export default function DashboardTab({
  businessForm,
  loyaltyForm,
  stats,
  customers,
  campaigns,
  previewText,
}: Props) {

  const [pointsData, setPointsData] = useState<PointsData>({
    activeCards: 0,
    totalRewards: 0,
    totalStamps: 0,
  });

  const [activeCampaignCount, setActiveCampaignCount] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    async function loadStats() {
      if (!businessForm?.cafeId) return;

      try {
        // 🔥 collectionGroup ile tüm users/{uid}/points/{cafeId} dökümanlarını çek
        const pointsQuery = query(
          collectionGroup(db, "points"),
          where("cafeId", "==", businessForm.cafeId)
        );

        const pointsSnap = await getDocs(pointsQuery);

        let totalRewards = 0;
        let totalStamps = 0;

        pointsSnap.docs.forEach((d) => {
          const data = d.data();
          totalRewards += Number(data.rewards ?? 0);
          totalStamps += Number(data.stamps ?? 0);
        });

        setPointsData({
          activeCards: pointsSnap.size,
          totalRewards,
          totalStamps,
        });

        // 🔥 Kafeye katılan aktif kampanya sayısı
        const campaignSnap = await getDocs(
          collection(db, "cafes", businessForm.cafeId, "campaigns")
        );

        const activeCamps = campaignSnap.docs.filter(
          (d) => d.data().isEnabled === true
        ).length;

        setActiveCampaignCount(activeCamps);

      } catch (err) {
        console.error("Dashboard stats hatası:", err);
      } finally {
        setLoadingStats(false);
      }
    }

    loadStats();
  }, [businessForm?.cafeId]);

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-500" />
          <div className="relative px-6 py-7 text-white sm:px-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">
              SincApp Owner Panel
            </p>
            <h1 className="text-3xl font-bold">
              {businessForm.cafeName || "Kafe adı"}
            </h1>
          </div>
        </div>
      </section>

      {/* STATS */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">

        <StatCard
          label="Toplam Damga"
          value={loadingStats ? "..." : String(pointsData.totalStamps)}
          hint="Tüm müşterilerin toplam damgası"
          icon={Sparkles}
        />

        <StatCard
          label="Aktif Kartlar"
          value={loadingStats ? "..." : String(pointsData.activeCards)}
          hint="Bu kafede kartı olan kullanıcı sayısı"
          icon={WalletCards}
        />

        <StatCard
          label="Toplam Ödül"
          value={loadingStats ? "..." : String(pointsData.totalRewards)}
          hint="Müşterilerin birikmiş toplam ödülü"
          icon={Gift}
        />

        <StatCard
          label="Aktif Kampanya"
          value={loadingStats ? "..." : String(activeCampaignCount)}
          hint="Katıldığın aktif kampanya sayısı"
          icon={Percent}
        />

      </div>

      {/* Sadakat Programı Özeti */}
      {(loyaltyForm.rewardBuy > 0 || loyaltyForm.rewardTitle) && (
        <section className={`${shellCardClass()} overflow-hidden`}>
          <SectionTitle
            eyebrow="Sadakat Programı"
            title="Kart ayarlarına genel bakış"
            description="Detaylı düzenleme için Sadakat Kart Programı sekmesine git."
          />
          <div className="grid gap-4 p-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Gerekli Damga</p>
              <p className="mt-2 text-2xl font-bold text-emerald-600">{loyaltyForm.rewardBuy}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Verilecek Hediye</p>
              <p className="mt-2 text-2xl font-bold text-emerald-600">{loyaltyForm.rewardGift}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Kart Başlığı</p>
              <p className="mt-2 text-sm font-bold text-slate-700 truncate">{loyaltyForm.rewardTitle || "—"}</p>
            </div>
          </div>
        </section>
      )}

    </div>
  );
}