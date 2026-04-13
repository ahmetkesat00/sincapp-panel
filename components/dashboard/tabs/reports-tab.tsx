"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collectionGroup, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

import SectionTitle from "../ui/section-title";
import MiniBarChart from "../ui/mini-bar-chart";
import { shellCardClass } from "../helpers";
import type { ChartDataItem } from "../types";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type CustomerRow = {
  uid: string;
  displayName: string;
  stamps: number;
  rewards: number;
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function ReportsTab() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState<ChartDataItem[]>([]);
  const [totalStamps, setTotalStamps] = useState(0);
  const [totalRewards, setTotalRewards] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }

      try {
        // Kafe bul
        const cafeSnap = await getDocs(
          query(collection(db, "cafes"), where("ownerUid", "==", user.uid))
        );
        if (cafeSnap.empty) { setLoading(false); return; }

        const cafeId = cafeSnap.docs[0].id;

        // 🔥 Tüm points dökümanlarını çek
        const pointsSnap = await getDocs(
          query(collectionGroup(db, "points"), where("cafeId", "==", cafeId))
        );

        let stamps = 0;
        let rewards = 0;
        const rows: CustomerRow[] = [];

        for (const d of pointsSnap.docs) {
          const data = d.data();
          const userUid = data.userUid as string ?? "";
          stamps += Number(data.stamps ?? 0);
          rewards += Number(data.rewards ?? 0);

          let displayName = userUid ? `Kullanıcı (${userUid.slice(0, 6)}...)` : "Bilinmiyor";

          if (userUid) {
            try {
              const userSnap = await getDocs(
                query(collection(db, "users"), where("__name__", "==", userUid))
              );
              if (!userSnap.empty) {
                const ud = userSnap.docs[0].data();
                displayName = ud.fullName || ud.displayName || displayName;
              }
            } catch { /* devam et */ }
          }

          rows.push({
            uid: userUid,
            displayName,
            stamps: Number(data.stamps ?? 0),
            rewards: Number(data.rewards ?? 0),
          });
        }

        rows.sort((a, b) => b.stamps - a.stamps);
        setCustomers(rows);
        setTotalStamps(stamps);
        setTotalRewards(rewards);

        // 🔥 Aktif kampanya sayısı → grafik verisi
        const campSnap = await getDocs(
          collection(db, "cafes", cafeId, "campaigns")
        );
        const campData: ChartDataItem[] = campSnap.docs.map((d) => ({
          label: d.id.slice(0, 8),
          value: d.data().isEnabled ? 1 : 0,
        }));
        setActiveCampaigns(campData.length > 0 ? campData : [
          { label: "Kampanya 1", value: 0 },
          { label: "Kampanya 2", value: 0 },
          { label: "Kampanya 3", value: 0 },
        ]);

      } catch (err) {
        console.error("ReportsTab load error:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const topCustomers = customers.slice(0, 4);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-600">Raporlar yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">

      {/* Özet istatistikler */}
      <section className={`${shellCardClass()} overflow-hidden lg:col-span-2`}>
        <SectionTitle
          eyebrow="Genel Özet"
          title="Sadakat programı istatistikleri"
          description="Tüm müşterilerin toplam damga ve ödül verileri."
        />
        <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Toplam Kullanıcı</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{customers.length}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Toplam Damga</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">{totalStamps}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Toplam Ödül</p>
            <p className="mt-2 text-2xl font-bold text-amber-700">{totalRewards}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ort. Damga/Kişi</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {customers.length > 0 ? (totalStamps / customers.length).toFixed(1) : "0"}
            </p>
          </div>
        </div>
      </section>

      {/* Top müşteriler */}
      <section className={`${shellCardClass()} overflow-hidden`}>
        <SectionTitle
          eyebrow="Müşteri İçgörüsü"
          title="En aktif müşteriler"
          description="Damga sayısına göre sıralı ilk 4 müşteri."
        />
        <div className="space-y-3 p-6">
          {topCustomers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Henüz raporlanacak müşteri verisi yok.
            </div>
          ) : (
            topCustomers.map((c, i) => (
              <div
                key={c.uid}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{c.displayName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        ☕ {c.stamps} damga
                      </p>
                    </div>
                  </div>
                  {c.rewards > 0 && (
                    <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                      🎁 {c.rewards} ödül
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Kampanya analizi */}
      <section className={`${shellCardClass()} overflow-hidden`}>
        <SectionTitle
          eyebrow="Kampanya Analizi"
          title="Katılım durumu"
          description="Aktif / pasif kampanya dağılımı."
        />
        <div className="p-6">
          <MiniBarChart data={activeCampaigns} />
        </div>
      </section>

      {/* Tahmini katkı */}
      <section className={`${shellCardClass()} overflow-hidden lg:col-span-2`}>
        <SectionTitle
          eyebrow="Tahmini Katkı"
          title="Sadakat programı etkisi"
          description="Şimdilik gerçek satış verisi olmadığı için hesaplama yapılamıyor."
        />
        <div className="space-y-4 p-6">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
              Tahmini tekrar ziyaret katkısı
            </p>
            <p className="mt-3 text-3xl font-bold text-emerald-900">₺0</p>
            <p className="mt-2 text-sm text-emerald-800/80">
              Satış / sipariş verisi bağlandığında güncellenecek.
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}