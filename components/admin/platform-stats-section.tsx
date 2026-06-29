"use client";

import { useEffect, useState } from "react";
import {
  collectionGroup,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { Search } from "lucide-react";
import { db } from "@/lib/firebase";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type CafeOption = { id: string; name: string };

type PlatformStats = {
  totalCards: number;
  totalUniqueUsers: number;
  totalStamps: number;
  totalRewards: number;
  topCafes: Array<{ cafeId: string; cafeName: string; customerCount: number; stamps: number }>;
  topCustomers: Array<{ uid: string; displayName: string; totalStamps: number; cafeCount: number }>;
};

type CafeCustomer = {
  uid: string;
  displayName: string;
  email: string;
  stamps: number;
  rewards: number;
};

type TxRow = {
  id: string;
  userId: string;
  cafeId: string;
  cafeName: string;
  type: string;
  status: string;
  createdAt: Timestamp | null;
};

type DateFilter = "daily" | "weekly" | "monthly";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getFilterStart(filter: DateFilter): Date {
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
  const d = new Date(now);
  d.setDate(d.getDate() - 30);
  return d;
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
  if (status === "processed" || status === "approved") return "Tamamlandı";
  if (status === "rejected") return "Reddedildi";
  if (status === "scanned") return "Onay Bekliyor";
  if (status === "expired") return "Süresi Doldu";
  return status;
}

function statusStyle(status: string): string {
  if (status === "processed" || status === "approved")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
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

const cardCls = "rounded-3xl border border-slate-200 bg-white shadow-sm";

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function PlatformStatsSection({ cafes }: { cafes: CafeOption[] }) {
  // ── Platform-wide stats ──
  const [platformLoading, setPlatformLoading] = useState(true);
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);

  // ── Cafe customer list ──
  const [selectedCafeId, setSelectedCafeId] = useState("");
  const [cafeCustomers, setCafeCustomers] = useState<CafeCustomer[]>([]);
  const [cafeCustomersLoading, setCafeCustomersLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");

  // ── Platform transactions ──
  const [txDateFilter, setTxDateFilter] = useState<DateFilter>("daily");
  const [txList, setTxList] = useState<TxRow[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  // ── Load platform-wide stats ──
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const pointsSnap = await getDocs(collectionGroup(db, "points"));

        const uniqueUsers = new Set<string>();
        let totalStamps = 0;
        let totalRewards = 0;
        const cafeMap = new Map<string, { cafeName: string; customerCount: number; stamps: number }>();
        const userMap = new Map<string, { totalStamps: number; cafeCount: number }>();

        for (const d of pointsSnap.docs) {
          const data = d.data();
          const userUid = (data.userUid as string) ?? "";
          const cafeId = (data.cafeId as string) ?? "";
          const cafeName = (data.cafeName as string) ?? "";
          const stamps = Number(data.stamps ?? 0);
          const rewards = Number(data.rewards ?? 0);

          uniqueUsers.add(userUid);
          totalStamps += stamps;
          totalRewards += rewards;

          if (cafeId) {
            const existing = cafeMap.get(cafeId) ?? { cafeName, customerCount: 0, stamps: 0 };
            cafeMap.set(cafeId, {
              cafeName: existing.cafeName || cafeName,
              customerCount: existing.customerCount + 1,
              stamps: existing.stamps + stamps,
            });
          }

          if (userUid) {
            const existing = userMap.get(userUid) ?? { totalStamps: 0, cafeCount: 0 };
            userMap.set(userUid, {
              totalStamps: existing.totalStamps + stamps,
              cafeCount: existing.cafeCount + 1,
            });
          }
        }

        const topCafes = Array.from(cafeMap.entries())
          .map(([cafeId, v]) => ({ cafeId, ...v }))
          .sort((a, b) => b.customerCount - a.customerCount)
          .slice(0, 5);

        const topCustomers = Array.from(userMap.entries())
          .map(([uid, v]) => ({ uid, displayName: uid.slice(0, 8) + "...", ...v }))
          .sort((a, b) => b.totalStamps - a.totalStamps)
          .slice(0, 5);

        if (active) {
          setPlatformStats({
            totalCards: pointsSnap.size,
            totalUniqueUsers: uniqueUsers.size,
            totalStamps,
            totalRewards,
            topCafes,
            topCustomers,
          });
        }
      } catch (err) {
        console.error("Platform stats error:", err);
      } finally {
        if (active) setPlatformLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // ── Load cafe customers when selection changes ──
  useEffect(() => {
    if (!selectedCafeId) return;
    let active = true;
    setCafeCustomersLoading(true);
    setCafeCustomers([]);

    (async () => {
      try {
        const pointsSnap = await getDocs(
          query(collectionGroup(db, "points"), where("cafeId", "==", selectedCafeId))
        );

        const rows: CafeCustomer[] = await Promise.all(
          pointsSnap.docs.map(async (pointDoc) => {
            const data = pointDoc.data();
            const userUid = (data.userUid as string) ?? "";
            let displayName = userUid ? `Kullanıcı (${userUid.slice(0, 6)}...)` : "Bilinmiyor";
            let email = "";

            if (userUid) {
              try {
                const userSnap = await getDocs(
                  query(collection(db, "users"), where("__name__", "==", userUid))
                );
                if (!userSnap.empty) {
                  const ud = userSnap.docs[0].data();
                  displayName = ud.fullName || ud.displayName || displayName;
                  email = ud.email || "";
                }
              } catch { /* devam */ }
            }

            return {
              uid: userUid,
              displayName,
              email,
              stamps: Number(data.stamps ?? 0),
              rewards: Number(data.rewards ?? 0),
            };
          })
        );

        rows.sort((a, b) => b.stamps - a.stamps);
        if (active) setCafeCustomers(rows);
      } catch (err) {
        console.error("Cafe customers error:", err);
      } finally {
        if (active) setCafeCustomersLoading(false);
      }
    })();

    return () => { active = false; };
  }, [selectedCafeId]);

  // ── Load all platform transactions ──
  useEffect(() => {
    let active = true;
    setTxLoading(true);

    (async () => {
      try {
        const start = getFilterStart(txDateFilter);
        const snap = await getDocs(
          query(
            collection(db, "qrTokens"),
            where("createdAt", ">=", Timestamp.fromDate(start)),
            orderBy("createdAt", "desc")
          )
        );

        const rows: TxRow[] = snap.docs
          .map((d) => {
            const data = d.data();
            const cafeId = (data.cafeId as string) ?? "";
            const cafe = cafes.find((c) => c.id === cafeId);
            return {
              id: d.id,
              userId: ((data.scannedUserId || data.userId || "") as string),
              cafeId,
              cafeName: cafe?.name ?? (cafeId ? cafeId.slice(0, 10) + "…" : "—"),
              type: ((data.processedType || data.type || "") as string),
              status: ((data.status || "") as string),
              createdAt: (data.createdAt as Timestamp) ?? null,
            };
          })
          .filter((tx) => tx.status !== "pending");

        if (active) setTxList(rows);
      } catch (err) {
        console.error("TX load error:", err);
      } finally {
        if (active) setTxLoading(false);
      }
    })();

    return () => { active = false; };
  }, [txDateFilter, cafes]);

  const filteredCustomers = cafeCustomers.filter((c) => {
    const q = customerSearch.toLowerCase();
    return c.displayName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <div id="section-platform-stats" className="space-y-6">

      {/* ── 1. Platform İstatistikleri ── */}
      <section className={cardCls}>
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700">
            Platform İstatistikleri
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Tüm platform geneli özet</h2>
          <p className="mt-1 text-sm text-slate-500">
            Tüm kafelerdeki kullanıcı, damga ve ödül verileri.
          </p>
        </div>

        {platformLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
              <p className="text-sm text-slate-500">Veriler yükleniyor...</p>
            </div>
          </div>
        ) : platformStats ? (
          <div className="space-y-6 p-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: "Toplam Kart",
                  value: platformStats.totalCards,
                  color: "text-violet-700",
                  border: "border-violet-200 bg-violet-50",
                },
                {
                  label: "Benzersiz Kullanıcı",
                  value: platformStats.totalUniqueUsers,
                  color: "text-blue-700",
                  border: "border-blue-200 bg-blue-50",
                },
                {
                  label: "Toplam Damga",
                  value: platformStats.totalStamps,
                  color: "text-emerald-700",
                  border: "border-emerald-200 bg-emerald-50",
                },
                {
                  label: "Toplam Ödül",
                  value: platformStats.totalRewards,
                  color: "text-amber-700",
                  border: "border-amber-200 bg-amber-50",
                },
              ].map((s) => (
                <div key={s.label} className={`rounded-2xl border px-4 py-4 ${s.border}`}>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {s.label}
                  </p>
                  <p className={`mt-2 text-2xl font-bold ${s.color}`}>
                    {s.value.toLocaleString("tr-TR")}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Top cafes */}
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                  En Aktif 5 Kafe
                </p>
                <div className="space-y-2">
                  {platformStats.topCafes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                      Veri yok
                    </div>
                  ) : (
                    platformStats.topCafes.map((c, i) => {
                      const displayName =
                        cafes.find((x) => x.id === c.cafeId)?.name ||
                        c.cafeName ||
                        c.cafeId.slice(0, 10);
                      return (
                        <div
                          key={c.cafeId}
                          className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                              {i + 1}
                            </div>
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {displayName}
                            </p>
                          </div>
                          <div className="ml-2 flex shrink-0 items-center gap-3">
                            <span className="text-xs text-slate-500">{c.customerCount} müşteri</span>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                              ☕ {c.stamps}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Top customers */}
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                  En Aktif 5 Müşteri
                </p>
                <div className="space-y-2">
                  {platformStats.topCustomers.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                      Veri yok
                    </div>
                  ) : (
                    platformStats.topCustomers.map((c, i) => (
                      <div
                        key={c.uid}
                        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                            {i + 1}
                          </div>
                          <p className="truncate font-mono text-xs text-slate-600">
                            {c.displayName}
                          </p>
                        </div>
                        <div className="ml-2 flex shrink-0 items-center gap-3">
                          <span className="text-xs text-slate-500">{c.cafeCount} kafe</span>
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            ☕ {c.totalStamps}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Veriler yüklenemedi.
          </div>
        )}
      </section>

      {/* ── 2. Kafe Bazlı Müşteri Listesi ── */}
      <section className={cardCls}>
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
            Kafe Müşteri Listesi
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">
            Kafe seç — müşterileri görüntüle
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Bir kafe seçerek o kafeye ait tüm müşterilerin damga ve ödül bilgilerini görüntüleyin.
          </p>
        </div>

        <div className="space-y-4 p-6">
          {/* Cafe selector */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">Kafe Seçin</label>
            <select
              value={selectedCafeId}
              onChange={(e) => {
                setSelectedCafeId(e.target.value);
                setCustomerSearch("");
              }}
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">-- Kafe seçin --</option>
              {cafes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || "İsimsiz kafe"}
                </option>
              ))}
            </select>
          </div>

          {selectedCafeId && (
            <>
              {/* Search + count */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="İsim veya email ile ara"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
                {!cafeCustomersLoading && (
                  <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                    {filteredCustomers.length} müşteri
                  </div>
                )}
              </div>

              {/* Table */}
              {cafeCustomersLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    <p className="text-sm text-slate-500">Müşteriler yükleniyor...</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-3xl border border-slate-200">
                  <div className="min-w-[680px]">
                    <div className="grid grid-cols-[2fr_1fr_1fr_1fr] bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                      <div>Kullanıcı</div>
                      <div>Damga</div>
                      <div>Ödül</div>
                      <div>Durum</div>
                    </div>
                    {filteredCustomers.length === 0 ? (
                      <div className="border-t border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                        {cafeCustomers.length === 0
                          ? "Bu kafede henüz müşteri yok."
                          : "Arama sonucu bulunamadı."}
                      </div>
                    ) : (
                      filteredCustomers.map((c) => (
                        <div
                          key={c.uid}
                          className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center border-t border-slate-200 bg-white px-4 py-4 text-sm transition hover:bg-slate-50"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">{c.displayName}</p>
                            {c.email && (
                              <p className="text-xs text-slate-400">{c.email}</p>
                            )}
                          </div>
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                              ☕ {c.stamps}
                            </span>
                          </div>
                          <div>
                            {c.rewards > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                                🎁 {c.rewards}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </div>
                          <div>
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                                c.stamps > 0
                                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border border-slate-200 bg-slate-50 text-slate-500"
                              }`}
                            >
                              {c.stamps > 0 ? "Aktif" : "Pasif"}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── 3. Platform QR İşlem Geçmişi ── */}
      <section className={cardCls}>
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-rose-700">
              Platform İşlem Geçmişi
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Tüm QR işlem kayıtları</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Tüm kafelerdeki damga ve ödül işlemleri.
            </p>
          </div>

          {/* Date filter */}
          <div className="flex shrink-0 gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-1">
            {(["daily", "weekly", "monthly"] as DateFilter[]).map((f) => {
              const labels: Record<DateFilter, string> = {
                daily: "Günlük",
                weekly: "Haftalık",
                monthly: "Aylık",
              };
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setTxDateFilter(f)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    txDateFilter === f
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
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
                <p className="text-sm text-slate-500">İşlemler yükleniyor...</p>
              </div>
            </div>
          ) : txList.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              Bu dönemde işlem kaydı yok.
            </div>
          ) : (
            <div className="space-y-2">
              {txList.map((tx) => (
                <div
                  key={tx.id}
                  className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                      {tx.userId ? tx.userId.slice(0, 2).toUpperCase() : "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-700">
                        {tx.cafeName}
                      </p>
                      <p className="truncate font-mono text-xs text-slate-400">
                        {tx.userId ? `${tx.userId.slice(0, 12)}...` : "Kullanıcı bilinmiyor"}
                      </p>
                      <p className={`text-sm font-semibold ${typeStyle(tx.type)}`}>
                        {typeLabel(tx.type)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyle(tx.status)}`}
                    >
                      {statusLabel(tx.status)}
                    </span>
                    <p className="whitespace-nowrap text-xs text-slate-400">
                      {formatTime(tx.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {txList.length > 0 && (
            <p className="mt-4 text-right text-xs text-slate-400">
              {txList.length} işlem gösteriliyor
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
