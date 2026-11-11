"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { collectionGroup, collection, query, where, getDocs, getDoc, doc } from "firebase/firestore";
import { Search, Smartphone } from "lucide-react";
import { db } from "@/lib/firebase";
import AdjustPointsForm from "@/components/points/adjust-points-form";
import { findCustomerByPhone, isCompleteTrMobile, looksLikePhone } from "@/lib/points";
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
  phoneMasked?: string;
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function CustomersTab({ cafeId }: { cafeId: string }) {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [errorText, setErrorText] = useState("");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ uid: string; text: string } | null>(null);
  const [goal, setGoal] = useState<number | undefined>(undefined);
  // Telefonla kayıtlı müşteriler: numara Firestore'da yok, sunucudan numarayla bulunur
  const [phoneMatch, setPhoneMatch] = useState<{ query: string; uid: string } | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const phoneSearch = looksLikePhone(search);

  const lastPhoneQuery = useRef("");

  const lookupPhone = async (q: string = search) => {
    lastPhoneQuery.current = q;
    setPhoneBusy(true);
    setPhoneError("");
    try {
      const r = await findCustomerByPhone(q, cafeId);
      setCustomers((prev) =>
        prev.some((x) => x.uid === r.uid)
          ? prev.map((x) => (x.uid === r.uid ? { ...x, phoneMasked: r.phoneMasked } : x))
          : [...prev, { uid: r.uid, displayName: r.displayName, email: r.email, stamps: r.stamps, rewards: r.rewards, phoneMasked: r.phoneMasked }]
      );
      setPhoneMatch({ query: q, uid: r.uid });
      setSelectedUid(r.uid);
    } catch (e) {
      setPhoneError((e as Error).message);
    } finally {
      setPhoneBusy(false);
    }
  };

  // Tam bir cep numarası yazılınca kısa bir beklemeden sonra kendiliğinden ara (aynı numarayı tekrar sormadan)
  useEffect(() => {
    if (!isCompleteTrMobile(search) || search === lastPhoneQuery.current) return;
    const t = setTimeout(() => lookupPhone(search), 500);
    return () => clearTimeout(t);
    // lookupPhone her render'da yeniden oluşur; sadece arama metni değişince tetiklenmeli
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const runSearch = () => {
    if (phoneSearch && !phoneBusy) lookupPhone(search);
  };

  // Kart hedefi (damga formundaki önizleme için)
  useEffect(() => {
    if (!cafeId) return;
    (async () => {
      try {
        const cafe = (await getDoc(doc(db, "cafes", cafeId))).data();
        if (!cafe) return;
        if (cafe.chainId) {
          const chain = (await getDoc(doc(db, "chains", String(cafe.chainId)))).data();
          setGoal(Number(chain?.loyaltyCard?.rewardBuy ?? 5));
        } else {
          setGoal(Number(cafe.loyaltyCards?.[0]?.rewardBuy ?? cafe.rewardBuy ?? 5));
        }
      } catch {
        // önizleme dönüşümsüz gösterilir
      }
    })();
  }, [cafeId]);

  useEffect(() => {
    if (!cafeId) return;
    let active = true;

    (async () => {
      try {
        const pointsSnap = await getDocs(
          query(
            collectionGroup(db, "points"),
            where("cafeId", "==", cafeId)
          )
        );

        if (!active) return;

        if (pointsSnap.empty) {
          setCustomers([]);
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
                  displayName =
                    userData.fullName ||
                    userData.displayName ||
                    [userData.name, userData.surname].filter(Boolean).join(" ") ||
                    displayName;
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
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [cafeId]);

  const matchedByPhone = phoneMatch && phoneMatch.query === search ? phoneMatch.uid : null;
  const filtered = matchedByPhone
    ? customers.filter((c) => c.uid === matchedByPhone)
    : customers.filter((c) => {
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
          description="Bu mağazada sadakat kartı olan tüm kullanıcılar listelenir."
        />

        {errorText && (
          <div className="mx-6 mb-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorText}
          </div>
        )}

        <div className="p-6">
          {/* Arama + sayaç */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <form
              className="flex w-full max-w-md items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                runSearch();
              }}
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  inputMode="search"
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPhoneError("");
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  placeholder="İsim, email veya telefon (0532...)"
                />
              </div>
              <button
                type="submit"
                disabled={!search.trim() || phoneBusy}
                title="Ara"
                aria-label="Ara"
                className="flex h-[46px] shrink-0 items-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {phoneBusy ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Ara</span>
              </button>
            </form>
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
              {phoneSearch && !matchedByPhone ? (
                <div className="flex flex-col items-center gap-3 border-t border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                  <p>{phoneBusy ? "Numara aranıyor..." : "Telefonla kayıt olan müşteriler numarasıyla bulunur."}</p>
                  <button
                    type="button"
                    onClick={() => lookupPhone(search)}
                    disabled={phoneBusy}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Smartphone className="h-4 w-4" />
                    {phoneBusy ? "Aranıyor..." : "Bu numarayla müşteri bul"}
                  </button>
                  {phoneError && <p className="text-xs font-medium text-red-600">{phoneError}</p>}
                </div>
              ) : filtered.length === 0 ? (
                <div className="border-t border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                  {customers.length === 0
                    ? "Bu mağazada henüz kart oluşturulmamış."
                    : "Arama sonucu bulunamadı."}
                </div>
              ) : (
                filtered.map((c) => (
                  <Fragment key={c.uid}>
                  <div
                    onClick={() => setSelectedUid(selectedUid === c.uid ? null : c.uid)}
                    className={`grid cursor-pointer grid-cols-[2fr_1fr_1fr_1fr] items-center border-t border-slate-200 px-4 py-4 text-sm transition hover:bg-slate-50 ${
                      selectedUid === c.uid ? "bg-slate-50" : "bg-white"
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{c.displayName}</p>
                      {c.email && <p className="text-xs text-slate-400">{c.email}</p>}
                      {c.phoneMasked && <p className="text-xs text-slate-400">📱 {c.phoneMasked}</p>}
                      {flash?.uid === c.uid && <p className="mt-1 text-xs font-semibold text-emerald-700">{flash.text}</p>}
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
                  {selectedUid === c.uid && c.uid && (
                    <div className="border-t border-slate-100 bg-slate-50 px-4 pb-4 pt-1">
                      <AdjustPointsForm
                        mode="owner"
                        userUid={c.uid}
                        cafeId={cafeId}
                        stamps={c.stamps}
                        rewards={c.rewards}
                        goal={goal}
                        onCancel={() => setSelectedUid(null)}
                        onDone={(r) => {
                          setCustomers((prev) =>
                            prev.map((x) => (x.uid === c.uid ? { ...x, stamps: r.stampsAfter, rewards: r.rewardsAfter } : x))
                          );
                          setFlash({
                            uid: c.uid,
                            text: r.earned > 0 ? `Damga verildi, müşteri ${r.earned} ödül kazandı.` : "Damga verildi.",
                          });
                          setSelectedUid(null);
                        }}
                      />
                    </div>
                  )}
                  </Fragment>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}