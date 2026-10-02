"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  collectionGroup,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { db } from "@/lib/firebase";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type CafeOption = { id: string; name: string };

type UserCard = {
  cafeId: string;
  cafeName: string;
  stamps: number;
  goal: number;
  pendingRewards: number;
  redeemCount: number;
  lastVisit: Date | null;
};

type UserRow = {
  uid: string;
  displayName: string;
  email: string;
  cards: UserCard[];
  totalStamps: number;
  pendingRewards: number;
  redeemCount: number;
  lastVisit: Date | null;
};

type SortKey = "lastVisit" | "redeemCount" | "totalStamps" | "cardCount";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const COMPLETED_STATUSES = ["processed", "approved"];

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function maxDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeDays(d: Date | null): string {
  if (!d) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "bugün";
  if (days === 1) return "dün";
  return `${days} gün önce`;
}

const cardCls = "rounded-3xl border border-slate-200 bg-white shadow-sm";

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function AllUsersSection({ cafes }: { cafes: CafeOption[] }) {
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lastVisit");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [pointsSnap, usersSnap, tokensSnap] = await Promise.all([
          getDocs(collectionGroup(db, "points")),
          getDocs(collection(db, "users")),
          getDocs(
            query(collection(db, "qrTokens"), where("status", "in", COMPLETED_STATUSES))
          ),
        ]);

        // Kullanıcı + kafe bazında ödül kullanımı ve son işlem zamanı
        const redeemByKey = new Map<string, number>();
        const lastVisitByKey = new Map<string, Date>();
        for (const d of tokensSnap.docs) {
          const data = d.data();
          const userId = (data.scannedUserId || data.userId || "") as string;
          const cafeId = (data.cafeId || "") as string;
          if (!userId) continue;
          const key = `${userId}__${cafeId}`;
          const type = (data.processedType || data.type || "") as string;
          if (type === "redeem") {
            redeemByKey.set(key, (redeemByKey.get(key) ?? 0) + 1);
          }
          const at =
            toDate(data.processedAt) ?? toDate(data.scannedAt) ?? toDate(data.createdAt);
          const prev = lastVisitByKey.get(key) ?? null;
          const next = maxDate(prev, at);
          if (next) lastVisitByKey.set(key, next);
        }

        // Kullanıcı profilleri
        const profileMap = new Map<string, { displayName: string; email: string; role: string }>();
        for (const d of usersSnap.docs) {
          const u = d.data();
          const fullName =
            (u.fullName as string) ||
            (u.displayName as string) ||
            [u.name, u.surname].filter(Boolean).join(" ");
          profileMap.set(d.id, {
            displayName: fullName || "",
            email: (u.email as string) || "",
            role: (u.role as string) || "user",
          });
        }

        // Kartlar
        const rowMap = new Map<string, UserRow>();
        const ensureRow = (uid: string): UserRow => {
          let row = rowMap.get(uid);
          if (!row) {
            const p = profileMap.get(uid);
            row = {
              uid,
              displayName: p?.displayName || `Kullanıcı (${uid.slice(0, 6)}...)`,
              email: p?.email || "",
              cards: [],
              totalStamps: 0,
              pendingRewards: 0,
              redeemCount: 0,
              lastVisit: null,
            };
            rowMap.set(uid, row);
          }
          return row;
        };

        for (const d of pointsSnap.docs) {
          const data = d.data();
          const uid = (data.userUid as string) || d.ref.parent.parent?.id || "";
          if (!uid) continue;
          const cafeId = (data.cafeId as string) || d.id;
          const key = `${uid}__${cafeId}`;
          const card: UserCard = {
            cafeId,
            cafeName: (data.cafeName as string) || "",
            stamps: Number(data.stamps ?? 0),
            goal: Number(data.goal ?? 0),
            pendingRewards: Number(data.rewards ?? 0),
            redeemCount: redeemByKey.get(key) ?? 0,
            lastVisit: maxDate(lastVisitByKey.get(key) ?? null, toDate(data.updatedAt)),
          };
          const row = ensureRow(uid);
          row.cards.push(card);
          row.totalStamps += card.stamps;
          row.pendingRewards += card.pendingRewards;
          row.redeemCount += card.redeemCount;
          row.lastVisit = maxDate(row.lastVisit, card.lastVisit);
        }

        // Kartı olmayan normal kullanıcıları da listele
        for (const [uid, p] of profileMap) {
          if (p.role === "user") ensureRow(uid);
        }

        for (const row of rowMap.values()) {
          row.cards.sort((a, b) => (b.lastVisit?.getTime() ?? 0) - (a.lastVisit?.getTime() ?? 0));
        }

        if (active) setUsers(Array.from(rowMap.values()));
      } catch (err) {
        console.error("All users load error:", err);
        if (active) setErrorText("Kullanıcı verileri yüklenemedi.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, []);

  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? users.filter(
          (u) =>
            u.displayName.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            u.uid.toLowerCase().includes(q)
        )
      : users;
    const sortValue = (u: UserRow): number => {
      if (sortKey === "lastVisit") return u.lastVisit?.getTime() ?? 0;
      if (sortKey === "redeemCount") return u.redeemCount;
      if (sortKey === "totalStamps") return u.totalStamps;
      return u.cards.length;
    };
    return [...filtered].sort((a, b) => sortValue(b) - sortValue(a));
  }, [users, search, sortKey]);

  const cafeNameOf = (c: UserCard) =>
    cafes.find((x) => x.id === c.cafeId)?.name || c.cafeName || c.cafeId.slice(0, 10);

  const toggleExpanded = (uid: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <section id="section-all-users" className={cardCls}>
      <div className="border-b border-slate-200 px-6 py-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">
          Tüm Kullanıcılar
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">
          Kartlar, damgalar, ödül kullanımı ve son geliş
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Platformdaki tüm kullanıcılar. Satıra tıklayarak kafe bazlı kart detaylarını görün.
        </p>
      </div>

      <div className="space-y-4 p-6">
        {errorText && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorText}
          </div>
        )}

        {/* Search + sort + count */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İsim, email veya UID ile ara"
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            >
              <option value="lastVisit">Son gelişe göre</option>
              <option value="redeemCount">Ödül kullanımına göre</option>
              <option value="totalStamps">Damgaya göre</option>
              <option value="cardCount">Kart sayısına göre</option>
            </select>
            {!loading && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                {visibleUsers.length} kullanıcı
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              <p className="text-sm text-slate-500">Kullanıcılar yükleniyor...</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-slate-200">
            <div className="min-w-[820px]">
              <div className="grid grid-cols-[2fr_0.8fr_0.9fr_1fr_1fr_1.4fr] bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                <div>Kullanıcı</div>
                <div>Kart</div>
                <div>Damga</div>
                <div>Ödül Hakkı</div>
                <div>Kullanılan Ödül</div>
                <div>Son Geliş</div>
              </div>

              {visibleUsers.length === 0 ? (
                <div className="border-t border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                  {users.length === 0 ? "Henüz kullanıcı yok." : "Arama sonucu bulunamadı."}
                </div>
              ) : (
                visibleUsers.map((u) => {
                  const isOpen = expanded.has(u.uid);
                  return (
                    <Fragment key={u.uid}>
                      <button
                        type="button"
                        onClick={() => toggleExpanded(u.uid)}
                        className="grid w-full grid-cols-[2fr_0.8fr_0.9fr_1fr_1fr_1.4fr] items-center border-t border-slate-200 bg-white px-4 py-4 text-left text-sm transition hover:bg-slate-50"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">{u.displayName}</p>
                            {u.email && <p className="truncate text-xs text-slate-400">{u.email}</p>}
                          </div>
                        </div>
                        <div className="text-slate-700">{u.cards.length}</div>
                        <div>
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                            ☕ {u.totalStamps}
                          </span>
                        </div>
                        <div>
                          {u.pendingRewards > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                              🎁 {u.pendingRewards}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </div>
                        <div>
                          {u.redeemCount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">
                              ✅ {u.redeemCount}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">0</span>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-slate-700">{formatDate(u.lastVisit)}</p>
                          {u.lastVisit && (
                            <p className="text-xs text-slate-400">{relativeDays(u.lastVisit)}</p>
                          )}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 pl-10">
                          {u.cards.length === 0 ? (
                            <p className="py-2 text-xs text-slate-500">Bu kullanıcının henüz kartı yok.</p>
                          ) : (
                            <div className="space-y-2">
                              {u.cards.map((c) => (
                                <div
                                  key={c.cafeId}
                                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1.4fr] items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs"
                                >
                                  <p className="truncate font-semibold text-slate-800">{cafeNameOf(c)}</p>
                                  <p className="text-emerald-700">
                                    ☕ {c.stamps}
                                    {c.goal > 0 && <span className="text-slate-400"> / {c.goal}</span>}
                                  </p>
                                  <p className="text-amber-700">🎁 {c.pendingRewards} hak</p>
                                  <p className="text-violet-700">✅ {c.redeemCount} kullanım</p>
                                  <p className="text-slate-500">{formatDate(c.lastVisit)}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </Fragment>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
