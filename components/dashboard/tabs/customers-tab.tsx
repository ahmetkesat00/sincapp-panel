"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collectionGroup, collection, query, where, getDocs } from "firebase/firestore";
import { Search } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import SectionTitle from "../ui/section-title";
import { shellCardClass } from "../helpers";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type CustomerRow = {
  uid: string;
  displayName: string;
  email: string;
  stamps: number;
  rewards: number;
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function CustomersTab() {
  const [cafeId, setCafeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }

      try {
        // Kafe bul
        const cafeSnap = await getDocs(
          query(collection(db, "cafes"), where("ownerUid", "==", user.uid))
        );

        if (cafeSnap.empty) {
          setErrorText("Kafe bulunamadı.");
          setLoading(false);
          return;
        }

        const foundCafeId = cafeSnap.docs[0].id;
        setCafeId(foundCafeId);

        // 🔥 collectionGroup("points") ile tüm users/{uid}/points/{cafeId} çek
        const pointsSnap = await getDocs(
          query(
            collectionGroup(db, "points"),
            where("cafeId", "==", foundCafeId)
          )
        );

        if (pointsSnap.empty) {
          setCustomers([]);
          setLoading(false);
          return;
        }

        // Her points dokümanından userUid al, users koleksiyonundan isim çek
        const rows: CustomerRow[] = await Promise.all(
          pointsSnap.docs.map(async (pointDoc) => {
            const data = pointDoc.data();
            const userUid = data.userUid as string ?? "";

            let displayName = userUid ? `Kullanıcı (${userUid.slice(0, 6)}...)` : "Bilinmiyor";
            let email = "";

            if (userUid) {
              try {
                const userSnap = await getDocs(
                  query(collection(db, "users"), where("__name__", "==", userUid))
                );
                if (!userSnap.empty) {
                  const userData = userSnap.docs[0].data();
                  displayName = userData.fullName || userData.displayName || displayName;
                  email = userData.email || "";
                }
              } catch {
                // kullanıcı okunamazsa devam et
              }
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

        // Damgaya göre sırala
        rows.sort((a, b) => b.stamps - a.stamps);
        setCustomers(rows);

      } catch (err) {
        console.error("CustomersTab load error:", err);
        setErrorText("Veriler yüklenirken hata oluştu.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.displayName.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  });

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-600">Müşteriler yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className={`${shellCardClass()} overflow-hidden`}>
        <SectionTitle
          eyebrow="Müşteriler"
          title="Kullanıcı puan ve damga takibi"
          description="Bu kafede sadakat kartı olan tüm kullanıcılar listelenir."
        />

        {errorText && (
          <div className="mx-6 mb-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorText}
          </div>
        )}

        <div className="p-6">
          {/* Arama + sayaç */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                placeholder="İsim veya email ile ara"
              />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
              {filtered.length} kayıtlı kullanıcı
            </div>
          </div>

          {/* Tablo */}
          <div className="overflow-x-auto rounded-3xl border border-slate-200">
            <div className="min-w-[700px]">

              {/* Header */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                <div>Kullanıcı</div>
                <div>Damga</div>
                <div>Ödül</div>
                <div>Durum</div>
              </div>

              {/* Rows */}
              {filtered.length === 0 ? (
                <div className="border-t border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                  {customers.length === 0
                    ? "Bu kafede henüz kart oluşturulmamış."
                    : "Arama sonucu bulunamadı."}
                </div>
              ) : (
                filtered.map((c) => (
                  <div
                    key={c.uid}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center border-t border-slate-200 bg-white px-4 py-4 text-sm transition hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{c.displayName}</p>
                      {c.email && <p className="text-xs text-slate-400">{c.email}</p>}
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
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                        c.stamps > 0
                          ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border border-slate-200 bg-slate-50 text-slate-500"
                      }`}>
                        {c.stamps > 0 ? "Aktif" : "Pasif"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}