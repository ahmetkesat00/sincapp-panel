"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  Timestamp,
  query,
  where,
  updateDoc,
  serverTimestamp,
  addDoc,
} from "firebase/firestore";

import { onAuthStateChanged, signOut } from "firebase/auth";

import {
  Building2,
  CalendarDays,
  Home,
  LineChart,
  Settings,
  Tag,
  Users,
  WalletCards,
} from "lucide-react";

import { auth, db } from "@/lib/firebase";

import DashboardLayout from "@/components/dashboard/dashboard-layout";
import DashboardSidebar from "@/components/dashboard/dashboard-sidebar";
import DashboardHeader from "@/components/dashboard/dashboard-header";

import DashboardTab from "@/components/dashboard/tabs/dashboard-tab";
import BusinessTab from "@/components/dashboard/tabs/business-tab";
import LoyaltyTab from "@/components/dashboard/tabs/loyalty-tab";
import CampaignsTab from "@/components/dashboard/tabs/campaigns-tab";
import CustomersTab from "@/components/dashboard/tabs/customers-tab";
import ReportsTab from "@/components/dashboard/tabs/reports-tab";
import SettingsTab from "@/components/dashboard/tabs/settings-tab";
import EventsTab from "@/components/dashboard/tabs/events-tab";
import SetupBanner from "@/components/dashboard/screens/setup-banner";
import PendingScreen from "@/components/dashboard/screens/pending-screen";

import {
  formatLocationValue,
  formatTimestamp,
} from "@/components/dashboard/helpers";

import type {
  BusinessForm,
  LoyaltyForm,
  NavId,
  NavItem,
} from "@/components/dashboard/types";

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "business", label: "İşletme Yönetimi", icon: Building2 },
  { id: "loyalty", label: "Sadakat Kart Programı", icon: WalletCards },
  { id: "campaigns", label: "Kampanya Yönetimi", icon: Tag },
  { id: "events", label: "Etkinlik Yönetimi", icon: CalendarDays },
  { id: "customers", label: "Kullanıcı Puan Takibi", icon: Users },
  { id: "reports", label: "Raporlar", icon: LineChart },
  { id: "settings", label: "Ayarlar", icon: Settings },
];

export default function DashboardPage() {
  const router = useRouter();

  const [activePage, setActivePage] = useState<NavId>("dashboard");
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const [uid, setUid] = useState("");
  const [cafeId, setCafeId] = useState("");

  const [lastUpdatedText, setLastUpdatedText] = useState("Henüz yok");

  const [businessForm, setBusinessForm] = useState<BusinessForm>({
    cafeId: "",
    cafeName: "",
    category: "",
    phone: "",
    address: "",
    location: "",
    openTime: "",
    closeTime: "",
    logoUrl: "",
    description: "",
    isOpen: false,
    isVisible: false,
    approvalStatus: "",
    rejectionNote: "",
  });

  const [loyaltyCardsCount, setLoyaltyCardsCount] = useState(0);
  const [hasWorkingHours, setHasWorkingHours] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Zincir durumu
  const [chain, setChain] = useState<{ id: string; name: string; branchCafeIds: string[] } | null>(null);
  const [branchCafes, setBranchCafes] = useState<{ id: string; name: string }[]>([]);
  const [showBranchSelector, setShowBranchSelector] = useState(false);
  const [pendingBranchRequestCount, setPendingBranchRequestCount] = useState(0);
  const [requestingBranch, setRequestingBranch] = useState(false);
  const [branchRequestMessage, setBranchRequestMessage] = useState("");

  const [loyaltyForm, setLoyaltyForm] = useState<LoyaltyForm>({
    rewardBuy: 0,
    rewardGift: 0,
    programDescription: "",
    productImageUrl: "",
  });



  async function loadCafeById(cId: string) {
    const cafeDoc = await getDoc(doc(db, "cafes", cId));
    if (!cafeDoc.exists()) {
      setErrorText("Şube bulunamadı.");
      setLoading(false);
      return;
    }
    const cafeData = cafeDoc.data();
    setCafeId(cId);
    setBusinessForm({
      cafeId: cId,
      cafeName: cafeData?.name ?? "",
      category: cafeData?.category ?? "",
      phone: cafeData?.phone ?? "",
      address: cafeData?.address ?? "",
      location: formatLocationValue(cafeData?.location ?? ""),
      openTime: cafeData?.openTime ?? "",
      closeTime: cafeData?.closeTime ?? "",
      logoUrl: cafeData?.logoUrl ?? "",
      description: cafeData?.description ?? "",
      isOpen: cafeData?.isActive ?? false,
      isVisible: cafeData?.isVisible ?? false,
      approvalStatus: cafeData?.approvalStatus ?? "draft",
      rejectionNote: cafeData?.rejectionNote ?? "",
    });
    const cards = Array.isArray(cafeData?.loyaltyCards) ? cafeData.loyaltyCards : [];
    setLoyaltyCardsCount(cards.length);
    const wh = cafeData?.workingHours;
    const hasWH = wh && typeof wh === "object"
      ? Object.values(wh).some((d: any) => d?.isOpen === true)
      : !!(cafeData?.openTime && cafeData?.closeTime);
    setHasWorkingHours(hasWH);
    const firstCard = cards[0] ?? null;
    setLoyaltyForm({
      rewardBuy: firstCard?.rewardBuy ?? cafeData?.rewardBuy ?? 0,
      rewardGift: firstCard?.rewardGift ?? cafeData?.rewardGift ?? 0,
      programDescription: firstCard?.programDescription ?? cafeData?.programDescription ?? "",
      productImageUrl: firstCard?.productImageUrl ?? cafeData?.productImageUrl ?? "",
    });
    setLastUpdatedText(formatTimestamp((cafeData?.updatedAt as Timestamp) ?? null));
    setLoading(false);
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        setUid(user.uid);

        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (!userSnap.exists()) {
          setErrorText("Kullanıcı kaydı bulunamadı.");
          setLoading(false);
          return;
        }

        const userData = userSnap.data();
        if (userData.role !== "owner") {
          router.replace("/login");
          return;
        }

        // Bekleyen şube talepleri kaç tane? (rules yoksa sessizce geç)
        try {
          const branchReqSnap = await getDocs(
            query(collection(db, "pendingBranchRequests"), where("ownerUid", "==", user.uid))
          );
          const pendingCount = branchReqSnap.docs.filter((d) => d.data().status === "pending").length;
          setPendingBranchRequestCount(pendingCount);
        } catch {
          // Firestore rules henüz eklenmemişse yoksay
        }

        // Zincir kontrolü — ownerUid'e ait chain var mı? (rules yoksa sessizce geç)
        let foundChain = false;
        try {
          const chainSnap = await getDocs(
            query(collection(db, "chains"), where("ownerUid", "==", user.uid))
          );

          if (!chainSnap.empty) {
            foundChain = true;
            const chainDoc = chainSnap.docs[0];
            const chainData = chainDoc.data();
            const branchIds: string[] = Array.isArray(chainData.branchCafeIds) ? chainData.branchCafeIds : [];
            setChain({ id: chainDoc.id, name: chainData.name ?? "", branchCafeIds: branchIds });

            const list = await Promise.all(
              branchIds.map(async (id) => {
                const s = await getDoc(doc(db, "cafes", id));
                return { id, name: s.exists() ? (s.data().name ?? "İsimsiz şube") : "İsimsiz şube" };
              })
            );
            setBranchCafes(list);

            if (list.length === 1) {
              await loadCafeById(list[0].id);
              if (chainData.loyaltyCard) setLoyaltyCardsCount(1);
            } else {
              setShowBranchSelector(true);
              setLoading(false);
            }
          }
        } catch {
          // Firestore rules henüz eklenmemişse yoksay
        }

        if (!foundChain) {
          // Tek kafeli owner — mevcut akış
          const cafeSnap = await getDocs(
            query(collection(db, "cafes"), where("ownerUid", "==", user.uid))
          );
          if (cafeSnap.empty) {
            setErrorText("Bu kullanıcıya ait kafe bulunamadı.");
            setLoading(false);
            return;
          }
          await loadCafeById(cafeSnap.docs[0].id);
        }
      } catch (error) {
        console.error("DASHBOARD LOAD ERROR:", error);
        setErrorText("Veriler yüklenirken hata oluştu.");
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  // Zorunlu alanlar dolumu kontrol
  function getRequiredFieldsStatus() {
    const hasCoords = (() => {
      const parts = businessForm.location.split(",");
      return parts.length === 2 && parts.every((p) => !isNaN(parseFloat(p.trim())) && p.trim() !== "");
    })();
    return {
      cafeName: !!businessForm.cafeName.trim(),
      logo: !!businessForm.logoUrl,
      category: !!businessForm.category,
      address: !!businessForm.address.trim(),
      coords: hasCoords,
      openTime: hasWorkingHours || !!businessForm.openTime,
      closeTime: hasWorkingHours || !!businessForm.closeTime,
      loyaltyCard: loyaltyCardsCount >= 1,
    };
  }

  async function handleSubmitForReview() {
    const fields = getRequiredFieldsStatus();
    const allFilled = Object.values(fields).every(Boolean);
    if (!allFilled) return;

    setIsSubmittingReview(true);
    try {
      await updateDoc(doc(db, "cafes", cafeId), {
        approvalStatus: "pending",
        updatedAt: serverTimestamp(),
      });
      setBusinessForm((prev) => ({ ...prev, approvalStatus: "pending" }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingReview(false);
    }
  }

  async function handleStartEditing() {
    try {
      await updateDoc(doc(db, "cafes", cafeId), {
        approvalStatus: "draft",
        updatedAt: serverTimestamp(),
      });
      setBusinessForm((prev) => ({ ...prev, approvalStatus: "draft" }));
    } catch (err) {
      console.error(err);
    }
  }

  async function handleRequestBranch(count: number) {
    setRequestingBranch(true);
    setBranchRequestMessage("");
    try {
      for (let i = 0; i < count; i++) {
        await addDoc(collection(db, "pendingBranchRequests"), {
          ownerUid: uid,
          cafeName: businessForm.cafeName,
          chainId: chain?.id ?? null,
          status: "pending",
          requestedAt: serverTimestamp(),
        });
      }
      setPendingBranchRequestCount((prev) => prev + count);
      setBranchRequestMessage(
        count > 1
          ? `${count} adet şube talebiniz alındı. Admin onayladıkça şubeler panelinize eklenir.`
          : "Talebiniz alındı. Admin onayladıktan sonra yeni şube panelinize eklenecek."
      );
    } catch (err) {
      console.error(err);
      setBranchRequestMessage("Talep gönderilirken hata oluştu.");
    } finally {
      setRequestingBranch(false);
    }
  }

  function renderPage() {
    switch (activePage) {
      case "dashboard":
        if (!cafeId) return null;

        return (
          <DashboardTab
            businessForm={businessForm}
            loyaltyForm={loyaltyForm}
          />
        );

      case "business":
        // ✅ BusinessTab zaten circular crop tool'ü içeriyor!
        // business-tab-WITH-CROP.tsx kullan
        return <BusinessTab cafeId={cafeId} chainId={chain?.id} />;

      case "loyalty":
        return (
          <LoyaltyTab
            cafeId={cafeId}
            businessForm={businessForm}
            chainId={chain?.id}
          />
        );

      case "campaigns":
        return <CampaignsTab cafeId={cafeId} />;

      case "events":
        return <EventsTab cafeId={cafeId} />;

      case "customers":
        return <CustomersTab cafeId={cafeId} />;

      case "reports":
        return <ReportsTab cafeId={cafeId} />;

      case "settings":
        return (
          <SettingsTab
            uid={uid}
            cafeId={cafeId}
            chain={chain}
            pendingBranchRequestCount={pendingBranchRequestCount}
            requestingBranch={requestingBranch}
            branchRequestMessage={branchRequestMessage}
            onRequestBranch={handleRequestBranch}
          />
        );

      default:
        return null;
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        Panel yükleniyor...
      </main>
    );
  }

  // Zincir sahibi — şube seçim ekranı
  if (showBranchSelector) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8fa] p-6">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">LoopyGo</p>
          <h1 className="mt-2 text-xl font-bold text-slate-900">Hangi şubeyi yönetmek istiyorsunuz?</h1>
          {chain && (
            <p className="mt-1 text-sm text-slate-500">{chain.name}</p>
          )}
          <div className="mt-6 space-y-3">
            {branchCafes.map((branch) => (
              <button
                key={branch.id}
                onClick={async () => {
                  setShowBranchSelector(false);
                  setLoading(true);
                  await loadCafeById(branch.id);
                  if (chain) {
                    try {
                      const cs = await getDoc(doc(db, "chains", chain.id));
                      if (cs.data()?.loyaltyCard) setLoyaltyCardsCount(1);
                    } catch {}
                  }
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-left text-sm font-semibold text-slate-900 transition hover:border-emerald-500 hover:bg-emerald-50"
              >
                <span>{branch.name || "İsimsiz şube"}</span>
                <span className="text-slate-400">→</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => signOut(auth)}
            className="mt-6 w-full rounded-2xl border border-slate-200 py-3 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
          >
            Çıkış yap
          </button>
        </div>
      </main>
    );
  }

  if (errorText) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        {errorText}
      </main>
    );
  }

  const status = businessForm.approvalStatus;

  // pending → sadece bekleme ekranı göster
  if (status === "pending") {
    return (
      <DashboardLayout
        sidebar={
          <DashboardSidebar
            navItems={navItems}
            activePage={activePage}
            onChangePage={setActivePage}
            cafeName={businessForm.cafeName}
            category={businessForm.category}
            logoUrl={businessForm.logoUrl}
            onLogout={() => signOut(auth)}
            showSwitchBranch={branchCafes.length > 1}
            onSwitchBranch={() => setShowBranchSelector(true)}
          />
        }
        header={
          <DashboardHeader
            activePage={activePage}
            navItems={navItems}
            lastUpdatedText={lastUpdatedText}
          />
        }
      >
        <PendingScreen />
      </DashboardLayout>
    );
  }

  // draft veya rejected → normal dashboard + setup banner
  const isDraftOrRejected = status === "draft" || status === "rejected";
  const fields = isDraftOrRejected ? getRequiredFieldsStatus() : null;

  return (
    <DashboardLayout
      sidebar={
        <DashboardSidebar
          navItems={navItems}
          activePage={activePage}
          onChangePage={setActivePage}
          cafeName={businessForm.cafeName}
          category={businessForm.category}
          logoUrl={businessForm.logoUrl}
          onLogout={() => signOut(auth)}
          showSwitchBranch={branchCafes.length > 1}
          onSwitchBranch={() => setShowBranchSelector(true)}
        />
      }
      header={
        <DashboardHeader
          activePage={activePage}
          navItems={navItems}
          lastUpdatedText={lastUpdatedText}
        />
      }
    >
      {isDraftOrRejected && fields && (
        <SetupBanner
          fields={fields}
          isRejected={status === "rejected"}
          rejectionNote={businessForm.rejectionNote}
          onSubmit={handleSubmitForReview}
          isSubmitting={isSubmittingReview}
        />
      )}
      {renderPage()}
    </DashboardLayout>
  );
}