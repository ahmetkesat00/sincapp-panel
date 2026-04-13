"use client";

import { useEffect, useMemo, useState } from "react";
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

import {
  formatLocationValue,
  formatTimestamp,
} from "@/components/dashboard/helpers";

import type {
  BusinessForm,
  Campaign,
  Customer,
  DashboardStats,
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
  });

  const [loyaltyForm, setLoyaltyForm] = useState<LoyaltyForm>({
    rewardBuy: 0,
    rewardGift: 0,
    rewardTitle: "",
    maxDailyStamp: 0,
    programActive: false,
    expiryDays: 0,
  });

  const [selectedItemType, setSelectedItemType] = useState<string>("");

  const [loyaltySaving, setLoyaltySaving] = useState(false);
  const [loyaltyMessage, setLoyaltyMessage] = useState("");

  const [campaigns] = useState<Campaign[]>([]);
  const [customers] = useState<Customer[]>([]);

  const [stats] = useState<DashboardStats>({
    todayStamps: 0,
    activeCards: 0,
    totalRewards: 0,
    activeCampaigns: 0,
  });

  const [weeklyStampData] = useState([
    { label: "Pzt", value: 0 },
    { label: "Sal", value: 0 },
    { label: "Çar", value: 0 },
    { label: "Per", value: 0 },
    { label: "Cum", value: 0 },
    { label: "Cmt", value: 0 },
    { label: "Paz", value: 0 },
  ]);

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
          approvalStatus: cafeData?.approvalStatus ?? "",
        });

        setLoyaltyForm({
          rewardBuy: cafeData?.rewardBuy ?? 0,
          rewardGift: cafeData?.rewardGift ?? 0,
          rewardTitle: cafeData?.rewardTitle ?? "",
          maxDailyStamp: cafeData?.maxDailyStamp ?? 0,
          programActive: cafeData?.programActive ?? false,
          expiryDays: cafeData?.expiryDays ?? 0,
        });

        setSelectedItemType(cafeData?.itemTypeId ?? "");

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

  async function handleSaveLoyalty() {
    if (!cafeId || !selectedItemType || loyaltyForm.rewardBuy <= 0) {
      setLoyaltyMessage("❌ Item türü ve damga sayısı zorunlu!");
      return;
    }

    setLoyaltySaving(true);

    try {
      const rewardGift = loyaltyForm.rewardBuy + 1;

      const rewardTitle = `${loyaltyForm.rewardBuy} ${selectedItemType} siparişine, ${rewardGift}. hediye`;

      await updateDoc(doc(db, "cafes", cafeId), {
        itemTypeId: selectedItemType,
        rewardBuy: loyaltyForm.rewardBuy,
        rewardGift,
        rewardTitle,
        maxDailyStamp: loyaltyForm.maxDailyStamp,
        programActive: loyaltyForm.programActive,
        expiryDays: loyaltyForm.expiryDays,
        updatedAt: serverTimestamp(),
      });

      setLoyaltyMessage("✅ Sadakat programı kaydedildi!");
      setLastUpdatedText(new Date().toLocaleString("tr-TR"));
    } catch (error) {
      console.error("Loyalty save error:", error);
      setLoyaltyMessage("❌ Kaydedilirken hata oluştu.");
    } finally {
      setLoyaltySaving(false);
    }
  }

  const topCampaignData = useMemo(() => {
    if (campaigns.length === 0) {
      return [
        { label: "Kampanya 1", value: 0 },
        { label: "Kampanya 2", value: 0 },
        { label: "Kampanya 3", value: 0 },
      ];
    }

    return campaigns
      .slice()
      .sort((a, b) => b.usageCount - a.usageCount)
      .map((item) => ({
        label: item.title,
        value: item.usageCount,
      }));
  }, [campaigns]);

  function renderPage() {
    switch (activePage) {
      case "dashboard":
        if (!cafeId) return null;

        return (
          <DashboardTab
            businessForm={businessForm}
            loyaltyForm={loyaltyForm}
            stats={stats}
            customers={customers}
            campaigns={campaigns}
            weeklyStampData={weeklyStampData}
            topCampaignData={topCampaignData}
            previewText=""
          />
        );

      case "business":
        // ✅ BusinessTab zaten circular crop tool'ü içeriyor!
        // business-tab-WITH-CROP.tsx kullan
        return <BusinessTab />;

      case "loyalty":
        return (
          <LoyaltyTab
            businessForm={businessForm}
            loyaltyForm={loyaltyForm}
            previewText={`${loyaltyForm.rewardBuy} damga → ${loyaltyForm.rewardGift} hediye`}
            updateLoyaltyField={(key, value) =>
              setLoyaltyForm((prev) => ({ ...prev, [key]: value }))
            }
            selectedItemType={selectedItemType}
            setSelectedItemType={setSelectedItemType}
            onSave={handleSaveLoyalty}
            isSaving={loyaltySaving}
            message={loyaltyMessage}
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
      {renderPage()}
    </DashboardLayout>
  );
}