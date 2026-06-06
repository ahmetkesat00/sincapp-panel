"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collectionGroup,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
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

type TxRow = {
  id: string;
  userId: string;
  type: "stamp" | "redeem" | string;
  status: string;
  createdAt: Timestamp | null;
  scannedAt: Timestamp | null;
};

type DateFilter = "daily" | "weekly" | "monthly" | "all";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getFilterStart(filter: DateFilter): Date | null {
  const now = new Date();
  if (filter === "daily") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (filter === "weekly") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (filter === "monthly") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }
  return null;
}

function formatTime(ts: Timestamp | null): string {
  if (!ts) return "—";
  try {
    return ts.toDate().toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function statusLabel(status: string): string {
  if (status === "processed") return "Tamamlandı";
  if (status === "approved") return "Tamamlandı";
  if (status === "rejected") return "Reddedildi";
  if (status === "scanned") return "Onay Bekliyor";
  if (status === "expired") return "Süresi Doldu";
  return status;
}

function statusStyle(status: string): string {
  if (status === "processed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "border-red-200 bg-red-50 text-red-600";
  if (status === "scanned") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "expired") return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

function typeLabel(type: string): string {
  if (type === "stamp") return "Damga";
  if (type === "redeem") return "Ödül Kullanımı";
  return type;
}

function typeStyle(type: string): string {
  if (type === "stamp") return "text-emerald-700";
  if (type === "redeem") return "text-amber-700";
  return "text-slate-500";
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function ReportsTab() {
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [cafeId, setCafeId] = useState("");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState<ChartDataItem[]>([]);
  const [totalStamps, setTotalStamps] = useState(0);
  const [totalRewards, setTotalRewards] = useState(0);
  const [allTx, setAllTx] = useState<TxRow[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>("daily");

  // Özet ve müşteri verileri
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }

      try {
        const cafeSnap = await getDocs(
          query(collection(db, "cafes"), where("ownerUid", "==", user.uid))
        );
        if (cafeSnap.empty) { setLoading(false); return; }

        const id = cafeSnap.docs[0].id;
        setCafeId(id);

        const pointsSnap = await getDocs(
          query(collectionGroup(db, "points"), where("cafeId", "==", id))
        );

        let stamps = 0;
        let rewards = 0;
        const rows: CustomerRow[] = [];

        for (const d of pointsSnap.docs) {
          const data = d.data();
          const userUid = (data.userUid as string) ?? "";
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
          rows.push({ uid: userUid, displayName, stamps: Number(data.stamps ?? 0), rewards: Number(data.rewards ?? 0) });
        }

        rows.sort((a, b) => b.stamps - a.stamps);
        setCustomers(rows);
        setTotalStamps(stamps);
        setTotalRewards(rewards);

        const campSnap = await getDocs(collection(db, "cafes", id, "campaigns"));
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

  // İşlem geçmişi — cafeId hazır olunca çek
  useEffect(() => {
    if (!cafeId) return;

    async function loadTx() {
      setTxLoading(true);
      try {
        const snap = await getDocs(
          query(
            collection(db, "qrTokens"),
            where("cafeId", "==", cafeId),
            orderBy("createdAt", "desc"),
            limit(200)
          )
        );
        const rows: TxRow[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: (data.scannedUserId || data.userId || "") as string,
            type: (data.processedType || data.type || "") as string,
            status: (data.status || "") as string,
            createdAt: (data.createdAt as Timestamp) ?? null,
            scannedAt: (data.scannedAt as Timestamp) ?? null,
          };
        });
        setAllTx(rows);
      } catch (err) {
        console.error("TX load error:", err);
      } finally {
        setTxLoading(false);
      }
    }

    loadTx();
  }, [cafeId]);

  // Client-side tarih filtresi
  const filteredTx = allTx.filter((tx) => {
    if (tx.status === "pending") return false; // henüz taranmamış
    const start = getFilterStart(dateFilter);
    if (!start || !tx.createdAt) return dateFilter === "all";
    return tx.createdAt.toDate() >= start;
  });

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
    <div className="space-y-6">

      {/* Özet istatistikler */}
      <section className={`${shellCardClass()} overflow-hidden`}>
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

      <div className="grid gap-6 lg:grid-cols-2">

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
                <div key={c.uid} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{c.displayName}</p>
                        <p className="mt-0.5 text-xs text-slate-500">☕ {c.stamps} damga</p>
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
      </div>

      {/* İşlem Geçmişi */}
      <section className={`${shellCardClass()} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">İşlem Geçmişi</p>
            <h2 className="mt-1 text-base font-semibold text-slate-900">QR işlem kayıtları</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Kasiyerin gerçekleştirdiği tüm damga ve ödül işlemleri.
            </p>
          </div>

          {/* Filtre butonları */}
          <div className="flex shrink-0 gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-1">
            {(["daily", "weekly", "monthly", "all"] as DateFilter[]).map((f) => {
              const labels = { daily: "Günlük", weekly: "Haftalık", monthly: "Aylık", all: "Tümü" };
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setDateFilter(f)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    dateFilter === f
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {labels[f]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6">
          {txLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            </div>
          ) : filteredTx.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              Bu dönemde işlem kaydı yok.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTx.map((tx) => (
                <div
                  key={tx.id}
                  className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  {/* Sol: kullanıcı + tür */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                      {tx.userId ? tx.userId.slice(0, 2).toUpperCase() : "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-mono text-slate-500">
                        {tx.userId ? `${tx.userId.slice(0, 12)}...` : "Kullanıcı bilinmiyor"}
                      </p>
                      <p className={`text-sm font-semibold ${typeStyle(tx.type)}`}>
                        {typeLabel(tx.type)}
                      </p>
                    </div>
                  </div>

                  {/* Sağ: durum + zaman */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyle(tx.status)}`}>
                      {statusLabel(tx.status)}
                    </span>
                    <p className="text-xs text-slate-400 whitespace-nowrap">
                      {formatTime(tx.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filteredTx.length > 0 && (
            <p className="mt-4 text-right text-xs text-slate-400">
              {filteredTx.length} işlem gösteriliyor
            </p>
          )}
        </div>
      </section>

    </div>
  );
}
