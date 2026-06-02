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

  const [loyaltyForm, setLoyaltyForm] = useState<LoyaltyForm>({
    rewardBuy: 0,
    rewardGift: 0,
    programDescription: "",
    productImageUrl: "",
  });



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
          return;
        }

        const userData = userSnap.data();

        if (userData.role !== "owner") {
          router.replace("/login");
          return;
        }

        const cafeQuery = query(
          collection(db, "cafes"),
          where("ownerUid", "==", user.uid)
        );

        const cafeSnap = await getDocs(cafeQuery);

        if (cafeSnap.empty) {
          setErrorText("Bu kullanıcıya ait kafe bulunamadı.");
          return;
        }

        const cafeDoc = cafeSnap.docs[0];
        const cafeData = cafeDoc.data();

        setCafeId(cafeDoc.id);

        setBusinessForm({
          cafeId: cafeDoc.id,
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

        // Çalışma saatleri kontrolü: workingHours objesi veya eski openTime/closeTime
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

        setLastUpdatedText(
          formatTimestamp((cafeData?.updatedAt as Timestamp) ?? null)
        );
      } catch (error) {
        console.error("DASHBOARD LOAD ERROR:", error);
        setErrorText("Veriler yüklenirken hata oluştu.");
      } finally {
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
        return <BusinessTab />;

      case "loyalty":
        return (
          <LoyaltyTab
            cafeId={cafeId}
            businessForm={businessForm}
          />
        );

      case "campaigns":
        return <CampaignsTab />;

      case "events":
        // 🎉 YENİ: EventsTab entegrasyonu
        return <EventsTab cafeId={cafeId} />;

      case "customers":
        return <CustomersTab />;

      case "reports":
        return <ReportsTab />;

      case "settings":
        return <SettingsTab uid={uid} cafeId={cafeId} />;

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
            onLogout={() => signOut(auth)}
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
          onLogout={() => signOut(auth)}
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