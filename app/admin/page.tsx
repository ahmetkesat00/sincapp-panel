"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  addDoc,
  deleteDoc,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type UserRole = "user" | "owner" | "cashier" | "admin";

type FoundUser = {
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  cafeId: string | null;
  isActive: boolean;
};

type CafeItem = {
  id: string;
  name: string;
  ownerUid: string;
  isActive: boolean;
  isVisible: boolean;
  isProfileCompleted: boolean;
  approvalStatus: "draft" | "pending" | "approved" | "rejected";
  createdAtText: string;
};

type CampaignItem = {
  id: string;
  title: string;
  description: string;
  isActive: boolean;
  order: number;
};

type AnnouncementItem = {
  id: string;
  title: string;
  isActive: boolean;
  order: number;
};

type ItemType = {
  id: string;
  name: string;
  order: number;
};

// ─────────────────────────────────────────────
// Style helpers
// ─────────────────────────────────────────────

function inputClassName() {
  return "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";
}

function labelClassName() {
  return "mb-2 block text-sm font-semibold text-slate-800";
}

function cardClassName() {
  return "rounded-3xl border border-slate-200 bg-white shadow-sm";
}

function statCardClassName() {
  return "rounded-2xl border border-slate-200 bg-slate-50 p-4";
}

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function safeBool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function safeNum(value: unknown, fallback = 0) {
  return typeof value === "number" ? value : fallback;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [adminUid, setAdminUid] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [errorText, setErrorText] = useState("");
  const [message, setMessage] = useState("");

  const [searchEmail, setSearchEmail] = useState("");
  const [searchingUser, setSearchingUser] = useState(false);
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);

  const [creatingCafe, setCreatingCafe] = useState(false);
  const [newCafeName, setNewCafeName] = useState("");

  const [cafes, setCafes] = useState<CafeItem[]>([]);
  const [togglingCafeId, setTogglingCafeId] = useState("");
  const [togglingVisibilityId, setTogglingVisibilityId] = useState("");

  // ── Duyuru state ──
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementImage, setAnnouncementImage] = useState<File | null>(null);
  const [announcementImagePreview, setAnnouncementImagePreview] = useState("");
  const [announcementOrder, setAnnouncementOrder] = useState("1");
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [uploadingAnnouncementImage, setUploadingAnnouncementImage] = useState(false);
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementError, setAnnouncementError] = useState("");
  const [deletingAnnouncementId, setDeletingAnnouncementId] = useState("");
  const [togglingAnnouncementId, setTogglingAnnouncementId] = useState("");

  // ── Kampanya state ──
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [campaignOrder, setCampaignOrder] = useState("1");
  const [campaignImage, setCampaignImage] = useState<File | null>(null);
  const [campaignImagePreview, setCampaignImagePreview] = useState("");
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [uploadingCampaignImage, setUploadingCampaignImage] = useState(false);
  const [campaignMessage, setCampaignMessage] = useState("");
  const [campaignError, setCampaignError] = useState("");
  const [deletingCampaignId, setDeletingCampaignId] = useState("");
  const [togglingCampaignId, setTogglingCampaignId] = useState("");

  // ── Item Types state ──
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [itemTypeName, setItemTypeName] = useState("");
  const [itemTypeOrder, setItemTypeOrder] = useState("1");
  const [savingItemType, setSavingItemType] = useState(false);
  const [itemTypeMessage, setItemTypeMessage] = useState("");
  const [itemTypeError, setItemTypeError] = useState("");
  const [deletingItemTypeId, setDeletingItemTypeId] = useState("");

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        setAdminUid(user.uid);

        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (!userSnap.exists()) {
          setErrorText("Kullanıcı kaydı bulunamadı.");
          setLoading(false);
          return;
        }

        const userData = userSnap.data() as Record<string, unknown>;
        const role = safeString(userData.role);

        if (role !== "admin") {
          setErrorText("Bu sayfaya erişim yetkin yok.");
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        setIsAdmin(true);

        // ── Kafeler ──
        const cafesQuery = query(
          collection(db, "cafes"),
          orderBy("createdAt", "desc")
        );

        const unsubCafes = onSnapshot(
          cafesQuery,
          (snap) => {
            const next: CafeItem[] = snap.docs.map((item) => {
              const d = item.data() as Record<string, unknown>;
              const createdAt = d.createdAt as { seconds?: number } | undefined;
              let createdAtText = "-";
              if (createdAt?.seconds) {
                createdAtText = new Date(createdAt.seconds * 1000).toLocaleString("tr-TR");
              }
              return {
                id: item.id,
                name: safeString(d.name) || "(İsim girilmedi)",
                ownerUid: safeString(d.ownerUid),
                isActive: safeBool(d.isActive, true),
                isVisible: safeBool(d.isVisible, false),
                isProfileCompleted: safeBool(d.isProfileCompleted, false),
                approvalStatus: (safeString(d.approvalStatus) as "draft" | "pending" | "approved" | "rejected") || "draft",
                createdAtText,
              };
            });
            setCafes(next);
            setLoading(false);
          },
          (error) => {
            console.error(error);
            setErrorText("Kafeler okunurken hata oluştu.");
            setLoading(false);
          }
        );

        // ── Duyurular ──
        const announcementsQuery = query(
          collection(db, "announcements"),
          orderBy("order", "asc")
        );

        const unsubAnnouncements = onSnapshot(announcementsQuery, (snap) => {
          const next: AnnouncementItem[] = snap.docs.map((item) => {
            const d = item.data() as Record<string, unknown>;
            return {
              id: item.id,
              title: safeString(d.title),
              isActive: safeBool(d.isActive, true),
              order: typeof d.order === "number" ? d.order : 999,
            };
          });
          setAnnouncements(next);
        });

        // ── Kampanyalar ──
        const campaignsQuery = query(
          collection(db, "campaigns"),
          orderBy("order", "asc")
        );

        const unsubCampaigns = onSnapshot(campaignsQuery, (snap) => {
          const next: CampaignItem[] = snap.docs.map((item) => {
            const d = item.data() as Record<string, unknown>;
            return {
              id: item.id,
              title: safeString(d.title),
              description: safeString(d.description),
              isActive: safeBool(d.isActive, true),
              order: typeof d.order === "number" ? d.order : 999,
            };
          });
          setCampaigns(next);
        });

        // ── Item Types ──
        const itemTypesQuery = query(
          collection(db, "itemTypes"),
          orderBy("order", "asc")
        );

        const unsubItemTypes = onSnapshot(itemTypesQuery, (snap) => {
          const next: ItemType[] = snap.docs.map((item) => {
            const d = item.data() as Record<string, unknown>;
            return {
              id: item.id,
              name: safeString(d.name),
              order: safeNum(d.order, 999),
            };
          });
          setItemTypes(next);
        });

        return () => {
          unsubCafes();
          unsubAnnouncements();
          unsubCampaigns();
          unsubItemTypes();
        };
      } catch (error) {
        console.error(error);
        setErrorText("Admin doğrulaması sırasında hata oluştu.");
        setLoading(false);
      }
    });

    return () => unsubAuth();
  }, [router]);

  const stats = useMemo(() => {
    const total = cafes.length;
    const visible = cafes.filter((x) => x.isVisible).length;
    const completed = cafes.filter((x) => x.isProfileCompleted).length;
    const drafts = cafes.filter((x) => x.approvalStatus === "draft").length;
    return { total, visible, completed, drafts };
  }, [cafes]);

  // ── Kullanıcı ara ──
  async function handleSearchUser() {
    setSearchingUser(true);
    setErrorText("");
    setMessage("");
    setFoundUser(null);

    try {
      const email = searchEmail.trim().toLowerCase();
      if (!email) {
        setErrorText("Lütfen kullanıcı email adresi gir.");
        return;
      }

      const q = query(collection(db, "users"), where("email", "==", email), limit(1));
      const snap = await getDocs(q);

      if (snap.empty) {
        setErrorText("Bu email ile kayıtlı kullanıcı bulunamadı.");
        return;
      }

      const docSnap = snap.docs[0];
      const d = docSnap.data() as Record<string, unknown>;

      setFoundUser({
        uid: docSnap.id,
        email: safeString(d.email),
        fullName: safeString(d.fullName) || "İsimsiz kullanıcı",
        role: (safeString(d.role) as UserRole) || "user",
        cafeId: safeString(d.cafeId) || null,
        isActive: safeBool(d.isActive, true),
      });
    } catch (error) {
      console.error(error);
      setErrorText("Kullanıcı aranırken hata oluştu.");
    } finally {
      setSearchingUser(false);
    }
  }

  // ── Kafe oluştur ──
  async function handleCreateCafeAndAssignOwner() {
    if (!foundUser) { setErrorText("Önce bir kullanıcı bulman gerekiyor."); return; }

    setCreatingCafe(true);
    setErrorText("");
    setMessage("");

    try {
      const trimmedCafeName = newCafeName.trim();
      if (!trimmedCafeName) { setErrorText("Lütfen başlangıç için bir kafe adı gir."); return; }
      if (!foundUser.isActive) { setErrorText("Bu kullanıcı pasif durumda."); return; }
      if (foundUser.cafeId) { setErrorText("Bu kullanıcı zaten bir kafeye bağlı."); return; }

      const cafeRef = doc(collection(db, "cafes"));
      const userRef = doc(db, "users", foundUser.uid);
      const batch = writeBatch(db);

      batch.set(cafeRef, {
        ownerUid: foundUser.uid,
        name: trimmedCafeName,
        category: "",
        openTime: "",
        closeTime: "",
        rewardBuy: 0,
        rewardGift: 0,
        rewardTitle: "",
        locationText: "",
        logoUrl: "",
        isActive: true,
        isVisible: false,
        isProfileCompleted: false,
        approvalStatus: "draft",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: adminUid,
      });

      batch.update(userRef, {
        role: "owner",
        cafeId: cafeRef.id,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      setMessage("Kafe oluşturuldu ve kullanıcı owner olarak atandı.");
      setNewCafeName("");
      setSearchEmail("");
      setFoundUser(null);
    } catch (error) {
      console.error(error);
      setErrorText("Kafe oluşturulurken hata oluştu.");
    } finally {
      setCreatingCafe(false);
    }
  }

  // ── Görünürlük toggle ──
  async function handleToggleVisibility(cafe: CafeItem) {
    setTogglingVisibilityId(cafe.id);
    setErrorText("");
    setMessage("");
    try {
      await updateDoc(doc(db, "cafes", cafe.id), {
        isVisible: !cafe.isVisible,
        approvalStatus: !cafe.isVisible ? "approved" : "draft",
        updatedAt: serverTimestamp(),
      });
      setMessage(!cafe.isVisible ? "Kafe yayına alındı." : "Kafe gizlendi.");
    } catch (error) {
      console.error(error);
      setErrorText("Görünürlük güncellenirken hata oluştu.");
    } finally {
      setTogglingVisibilityId("");
    }
  }

  // ── Aktiflik toggle ──
  async function handleToggleCafeActive(cafe: CafeItem) {
    setTogglingCafeId(cafe.id);
    setErrorText("");
    setMessage("");
    try {
      await updateDoc(doc(db, "cafes", cafe.id), {
        isActive: !cafe.isActive,
        updatedAt: serverTimestamp(),
      });
      setMessage(!cafe.isActive ? "Kafe aktif hale getirildi." : "Kafe pasife alındı.");
    } catch (error) {
      console.error(error);
      setErrorText("Aktiflik durumu güncellenirken hata oluştu.");
    } finally {
      setTogglingCafeId("");
    }
  }

  // ── Announcement Image Handler ──
  function handleAnnouncementImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAnnouncementError("Lütfen geçerli bir resim dosyası seç.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAnnouncementError("Resim boyutu 5MB'dan küçük olmalı.");
      return;
    }

    setAnnouncementImage(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      setAnnouncementImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  // ── Duyuru oluştur ──
  async function handleCreateAnnouncement() {
    setAnnouncementMessage("");
    setAnnouncementError("");

    if (!announcementTitle.trim()) {
      setAnnouncementError("Duyuru başlığı boş olamaz.");
      return;
    }

    if (!announcementImage) {
      setAnnouncementError("Lütfen duyuru görseli yükle.");
      return;
    }

    setSavingAnnouncement(true);
    setUploadingAnnouncementImage(true);

    try {
      const imageRef = ref(
        storage,
        `announcement_banners/${Date.now()}_${announcementImage.name}`
      );

      const uploadResult = await uploadBytes(imageRef, announcementImage);
      const bannerImageUrl = await getDownloadURL(uploadResult.ref);

      await addDoc(collection(db, "announcements"), {
        title: announcementTitle.trim(),
        bannerImage: bannerImageUrl,
        isActive: true,
        order: Number(announcementOrder) || 999,
        createdAt: serverTimestamp(),
        createdBy: adminUid,
      });

      setAnnouncementTitle("");
      setAnnouncementOrder("1");
      setAnnouncementImage(null);
      setAnnouncementImagePreview("");

      setAnnouncementMessage("Duyuru başarıyla oluşturuldu.");
    } catch (err) {
      console.error(err);
      setAnnouncementError("Duyuru oluşturulurken hata oluştu.");
    } finally {
      setSavingAnnouncement(false);
      setUploadingAnnouncementImage(false);
    }
  }

  // ── Duyuru aktif/pasif ──
  async function handleToggleAnnouncement(announcement: AnnouncementItem) {
    setTogglingAnnouncementId(announcement.id);
    try {
      await updateDoc(doc(db, "announcements", announcement.id), {
        isActive: !announcement.isActive,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
      setAnnouncementError("Duyuru güncellenirken hata oluştu.");
    } finally {
      setTogglingAnnouncementId("");
    }
  }

  // ── Duyuru sil ──
  async function handleDeleteAnnouncement(announcementId: string) {
    if (!confirm("Bu duyuruyu silmek istediğinden emin misin?")) return;
    setDeletingAnnouncementId(announcementId);
    try {
      await deleteDoc(doc(db, "announcements", announcementId));
      setAnnouncementMessage("Duyuru silindi.");
    } catch (err) {
      console.error(err);
      setAnnouncementError("Duyuru silinirken hata oluştu.");
    } finally {
      setDeletingAnnouncementId("");
    }
  }

  // ── Campaign Image Handler ──
  function handleCampaignImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setCampaignError("Lütfen geçerli bir resim dosyası seç.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setCampaignError("Resim boyutu 5MB'dan küçük olmalı.");
      return;
    }

    setCampaignImage(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      setCampaignImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  // ── Kampanya oluştur ──
  async function handleCreateCampaign() {
    setCampaignMessage("");
    setCampaignError("");

    if (!campaignTitle.trim()) {
      setCampaignError("Kampanya başlığı boş olamaz.");
      return;
    }

    if (!campaignImage) {
      setCampaignError("Lütfen kampanya görseli yükle.");
      return;
    }

    setSavingCampaign(true);
    setUploadingCampaignImage(true);

    try {
      const imageRef = ref(
        storage,
        `campaign_banners/${Date.now()}_${campaignImage.name}`
      );

      const uploadResult = await uploadBytes(imageRef, campaignImage);
      const bannerImageUrl = await getDownloadURL(uploadResult.ref);

      await addDoc(collection(db, "campaigns"), {
        title: campaignTitle.trim(),
        description: campaignDescription.trim(),
        bannerImage: bannerImageUrl,
        isActive: true,
        order: Number(campaignOrder) || 999,
        createdAt: serverTimestamp(),
        createdBy: adminUid,
      });

      setCampaignTitle("");
      setCampaignDescription("");
      setCampaignOrder("1");
      setCampaignImage(null);
      setCampaignImagePreview("");

      setCampaignMessage("Kampanya başarıyla oluşturuldu.");
    } catch (err) {
      console.error(err);
      setCampaignError("Kampanya oluşturulurken hata oluştu.");
    } finally {
      setSavingCampaign(false);
      setUploadingCampaignImage(false);
    }
  }

  // ── Kampanya aktif/pasif ──
  async function handleToggleCampaign(campaign: CampaignItem) {
    setTogglingCampaignId(campaign.id);
    try {
      await updateDoc(doc(db, "campaigns", campaign.id), {
        isActive: !campaign.isActive,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
      setCampaignError("Kampanya güncellenirken hata oluştu.");
    } finally {
      setTogglingCampaignId("");
    }
  }

  // ── Kampanya sil ──
  async function handleDeleteCampaign(campaignId: string) {
    if (!confirm("Bu kampanyayı silmek istediğinden emin misin?")) return;
    setDeletingCampaignId(campaignId);
    try {
      await deleteDoc(doc(db, "campaigns", campaignId));
      setCampaignMessage("Kampanya silindi.");
    } catch (err) {
      console.error(err);
      setCampaignError("Kampanya silinirken hata oluştu.");
    } finally {
      setDeletingCampaignId("");
    }
  }

  // ── Item Type oluştur ──
  async function handleCreateItemType() {
    setItemTypeMessage("");
    setItemTypeError("");

    if (!itemTypeName.trim()) { setItemTypeError("İtem adı boş olamaz."); return; }

    setSavingItemType(true);
    try {
      await addDoc(collection(db, "itemTypes"), {
        name: itemTypeName.trim(),
        order: Number(itemTypeOrder) || 999,
        createdAt: serverTimestamp(),
        createdBy: adminUid,
      });

      setItemTypeName("");
      setItemTypeOrder("1");
      setItemTypeMessage("İtem başarıyla oluşturuldu.");
    } catch (err) {
      console.error(err);
      setItemTypeError("İtem oluşturulurken hata oluştu.");
    } finally {
      setSavingItemType(false);
    }
  }

  // ── Item Type sil ──
  async function handleDeleteItemType(itemTypeId: string) {
    if (!confirm("Bu item türünü silmek istediğinden emin misin?")) return;
    setDeletingItemTypeId(itemTypeId);
    try {
      await deleteDoc(doc(db, "itemTypes", itemTypeId));
      setItemTypeMessage("Item türü silindi.");
    } catch (err) {
      console.error(err);
      setItemTypeError("Item türü silinirken hata oluştu.");
    } finally {
      setDeletingItemTypeId("");
    }
  }

  async function handleLogout() {
    await signOut(auth);
    router.push("/login");
  }

  // ── Loading ──
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8fa]">
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <p className="text-sm font-medium text-slate-600">Admin panel yükleniyor...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8fa] p-6">
        <div className="max-w-md rounded-3xl border border-red-200 bg-white p-6 shadow-sm">
          <p className="text-lg font-bold text-slate-900">Erişim yok</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Bu sayfayı yalnızca admin hesabı kullanabilir.
          </p>
          {errorText && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {errorText}
            </div>
          )}
          <button
            onClick={() => router.push("/login")}
            className="mt-5 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Giriş sayfasına dön
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f8fa]">

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
              SincApp Admin
            </p>
            <h1 className="text-sm font-semibold text-slate-900">Kafe Yönetim Paneli</h1>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Çıkış
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">

        {/* Global mesajlar */}
        {errorText && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorText}
          </div>
        )}
        {message && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {message}
          </div>
        )}

        {/* İstatistikler */}
        <section className="grid gap-4 md:grid-cols-4">
          <div className={statCardClassName()}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Toplam Kafe</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{stats.total}</p>
          </div>
          <div className={statCardClassName()}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Yayında</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{stats.visible}</p>
          </div>
          <div className={statCardClassName()}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Profil Tamamlanan</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{stats.completed}</p>
          </div>
          <div className={statCardClassName()}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Taslak</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{stats.drafts}</p>
          </div>
        </section>

        {/* Kafe oluştur + Kafeler listesi */}
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">

          {/* Kafe oluştur */}
          <section className={cardClassName()}>
            <div className="border-b border-slate-200 px-6 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Yeni Kafe Aç</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Kullanıcıyı owner olarak ata</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Kafe sahibi önce mobil uygulamadan normal kullanıcı hesabı açar.
                Burada email ile bulup owner rolü verirsin.
              </p>
            </div>
            <div className="space-y-5 p-6">
              <div>
                <label className={labelClassName()}>Kullanıcı email adresi</label>
                <div className="flex gap-3">
                  <input
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearchUser()}
                    placeholder="ornek@mail.com"
                    className={inputClassName()}
                  />
                  <button
                    type="button"
                    onClick={handleSearchUser}
                    disabled={searchingUser}
                    className="shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {searchingUser ? "Aranıyor..." : "Bul"}
                  </button>
                </div>
              </div>

              {foundUser && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Kullanıcı bulundu</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    <p><span className="font-semibold text-slate-800">Ad:</span> {foundUser.fullName}</p>
                    <p><span className="font-semibold text-slate-800">Email:</span> {foundUser.email}</p>
                    <p><span className="font-semibold text-slate-800">Rol:</span> {foundUser.role}</p>
                    <p><span className="font-semibold text-slate-800">Bağlı cafeId:</span> {foundUser.cafeId ?? "-"}</p>
                    <p><span className="font-semibold text-slate-800">Durum:</span> {foundUser.isActive ? "Aktif" : "Pasif"}</p>
                  </div>
                </div>
              )}

              <div>
                <label className={labelClassName()}>Başlangıç kafe adı</label>
                <input
                  value={newCafeName}
                  onChange={(e) => setNewCafeName(e.target.value)}
                  placeholder="Örn. Rome Coffee"
                  className={inputClassName()}
                />
              </div>

              <button
                type="button"
                onClick={handleCreateCafeAndAssignOwner}
                disabled={creatingCafe || !foundUser}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creatingCafe ? "Oluşturuluyor..." : "Kafeyi Oluştur ve Owner Ata"}
              </button>
            </div>
          </section>

          {/* Kafeler listesi */}
          <section className={cardClassName()}>
            <div className="border-b border-slate-200 px-6 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Kafeler</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Sistem kayıtları</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Profili tamamlanan kafeleri admin olarak yayına alabilirsin.
              </p>
            </div>
            <div className="p-6">
              {cafes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  Henüz kayıtlı kafe yok.
                </div>
              ) : (
                <div className="space-y-4">
                  {cafes.map((cafe) => (
                    <div key={cafe.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <h3 className="text-base font-bold text-slate-900">{cafe.name}</h3>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                              {cafe.isActive ? "Aktif" : "Pasif"}
                            </span>
                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${cafe.isVisible ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700"}`}>
                              {cafe.isVisible ? "Yayında" : "Yayında değil"}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                              {cafe.isProfileCompleted ? "Profil tamamlandı" : "Profil eksik"}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                              {cafe.approvalStatus}
                            </span>
                          </div>
                          <div className="mt-3 space-y-1 text-sm text-slate-600">
                            <p><span className="font-semibold text-slate-800">Cafe ID:</span> {cafe.id}</p>
                            <p><span className="font-semibold text-slate-800">Owner UID:</span> {cafe.ownerUid || "-"}</p>
                            <p><span className="font-semibold text-slate-800">Oluşturulma:</span> {cafe.createdAtText}</p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
                          <button
                            type="button"
                            onClick={() => handleToggleVisibility(cafe)}
                            disabled={togglingVisibilityId === cafe.id}
                            className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {cafe.isVisible ? "Yayından Kaldır" : "Yayına Al"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleCafeActive(cafe)}
                            disabled={togglingCafeId === cafe.id}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                          >
                            {cafe.isActive ? "Pasife Al" : "Aktif Yap"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ── Duyuru Yönetimi ── */}
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">

          {/* Duyuru oluştur */}
          <section className={cardClassName()}>
            <div className="border-b border-slate-200 px-6 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-700">Duyuru Yönetimi</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Yeni duyuru oluştur</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Oluşturduğun duyurular aktif ise ana sayfada gösterilir.
              </p>
            </div>
            <div className="space-y-5 p-6">

              {announcementError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {announcementError}
                </div>
              )}
              {announcementMessage && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  {announcementMessage}
                </div>
              )}

              <div>
                <label className={labelClassName()}>Duyuru Görseli *</label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAnnouncementImageChange}
                    disabled={uploadingAnnouncementImage}
                    className="hidden"
                    id="announcement-image-input"
                  />
                  <label
                    htmlFor="announcement-image-input"
                    className="flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 transition hover:border-orange-400 hover:bg-orange-50"
                  >
                    <div className="text-center">
                      {announcementImagePreview ? (
                        <>
                          <img
                            src={announcementImagePreview}
                            alt="Duyuru görseli"
                            className="mx-auto mb-2 h-20 w-20 rounded-lg object-cover"
                          />
                          <p className="text-sm font-semibold text-slate-900">Değiştirmek için tıkla</p>
                          <p className="text-xs text-slate-500">{announcementImage?.name}</p>
                        </>
                      ) : (
                        <>
                          <svg
                            className="mx-auto mb-2 h-8 w-8 text-slate-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          <p className="text-sm font-semibold text-slate-900">Duyuru görseli yükle</p>
                          <p className="text-xs text-slate-500">PNG, JPG (max 5MB)</p>
                        </>
                      )}
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className={labelClassName()}>Duyuru başlığı *</label>
                <input
                  value={announcementTitle}
                  onChange={(e) => setAnnouncementTitle(e.target.value)}
                  placeholder="Örn. SincApp Kart Tanıtımı"
                  className={inputClassName()}
                />
              </div>

              <div>
                <label className={labelClassName()}>Sıra (order)</label>
                <input
                  type="number"
                  min="1"
                  value={announcementOrder}
                  onChange={(e) => setAnnouncementOrder(e.target.value)}
                  className={inputClassName()}
                />
                <p className="mt-1.5 text-xs text-slate-400">Küçük sayı = önce gösterilir</p>
              </div>

              <button
                type="button"
                onClick={handleCreateAnnouncement}
                disabled={savingAnnouncement || uploadingAnnouncementImage}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingAnnouncement || uploadingAnnouncementImage ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {uploadingAnnouncementImage ? "Resim yükleniyor..." : "Duyuru oluşturuluyor..."}
                  </>
                ) : (
                  "Duyuruyu Oluştur"
                )}
              </button>
            </div>
          </section>

          {/* Duyuru listesi */}
          <section className={cardClassName()}>
            <div className="border-b border-slate-200 px-6 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-700">Mevcut Duyurular</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                Tüm duyurular
                <span className="ml-2 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-sm font-semibold text-orange-700">
                  {announcements.length}
                </span>
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Aktif duyurular ana sayfada görünür. Pasife alınan duyurular gizlenir.
              </p>
            </div>
            <div className="p-6">
              {announcements.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  Henüz duyuru oluşturulmadı.
                </div>
              ) : (
                <div className="space-y-3">
                  {announcements.map((announcement) => (
                    <div
                      key={announcement.id}
                      className={`rounded-2xl border p-4 transition ${
                        announcement.isActive
                          ? "border-orange-200 bg-orange-50"
                          : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-slate-900">{announcement.title}</p>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              announcement.isActive
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border border-slate-200 bg-white text-slate-500"
                            }`}>
                              {announcement.isActive ? "Aktif" : "Pasif"}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                              Sıra: {announcement.order}
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleAnnouncement(announcement)}
                            disabled={togglingAnnouncementId === announcement.id}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                          >
                            {announcement.isActive ? "Pasife Al" : "Aktif Et"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAnnouncement(announcement.id)}
                            disabled={deletingAnnouncementId === announcement.id}
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
                          >
                            {deletingAnnouncementId === announcement.id ? "Siliniyor..." : "Sil"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ── Kampanya Yönetimi ── */}
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">

          {/* Kampanya oluştur */}
          <section className={cardClassName()}>
            <div className="border-b border-slate-200 px-6 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-purple-700">Kampanya Yönetimi</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Yeni kampanya oluştur</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Oluşturduğun kampanyalar aktif ise ana sayfada gösterilir.
              </p>
            </div>
            <div className="space-y-5 p-6">

              {campaignError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {campaignError}
                </div>
              )}
              {campaignMessage && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  {campaignMessage}
                </div>
              )}

              <div>
                <label className={labelClassName()}>Kampanya Görseli *</label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCampaignImageChange}
                    disabled={uploadingCampaignImage}
                    className="hidden"
                    id="campaign-image-input"
                  />
                  <label
                    htmlFor="campaign-image-input"
                    className="flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 transition hover:border-purple-400 hover:bg-purple-50"
                  >
                    <div className="text-center">
                      {campaignImagePreview ? (
                        <>
                          <img
                            src={campaignImagePreview}
                            alt="Kampanya görseli"
                            className="mx-auto mb-2 h-20 w-20 rounded-lg object-cover"
                          />
                          <p className="text-sm font-semibold text-slate-900">Değiştirmek için tıkla</p>
                          <p className="text-xs text-slate-500">{campaignImage?.name}</p>
                        </>
                      ) : (
                        <>
                          <svg
                            className="mx-auto mb-2 h-8 w-8 text-slate-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          <p className="text-sm font-semibold text-slate-900">Kampanya görseli yükle</p>
                          <p className="text-xs text-slate-500">PNG, JPG (max 5MB)</p>
                        </>
                      )}
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className={labelClassName()}>Kampanya başlığı *</label>
                <input
                  value={campaignTitle}
                  onChange={(e) => setCampaignTitle(e.target.value)}
                  placeholder="Örn. Happy Hours"
                  className={inputClassName()}
                />
              </div>

              <div>
                <label className={labelClassName()}>Açıklama</label>
                <textarea
                  value={campaignDescription}
                  onChange={(e) => setCampaignDescription(e.target.value)}
                  placeholder="Kampanya detayı..."
                  className="min-h-[100px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label className={labelClassName()}>Sıra (order)</label>
                <input
                  type="number"
                  min="1"
                  value={campaignOrder}
                  onChange={(e) => setCampaignOrder(e.target.value)}
                  className={inputClassName()}
                />
                <p className="mt-1.5 text-xs text-slate-400">Küçük sayı = önce gösterilir</p>
              </div>

              <button
                type="button"
                onClick={handleCreateCampaign}
                disabled={savingCampaign || uploadingCampaignImage}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingCampaign || uploadingCampaignImage ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {uploadingCampaignImage ? "Resim yükleniyor..." : "Kampanya oluşturuluyor..."}
                  </>
                ) : (
                  "Kampanyayı Oluştur"
                )}
              </button>
            </div>
          </section>

          {/* Kampanya listesi */}
          <section className={cardClassName()}>
            <div className="border-b border-slate-200 px-6 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-purple-700">Mevcut Kampanyalar</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                Tüm kampanyalar
                <span className="ml-2 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-sm font-semibold text-purple-700">
                  {campaigns.length}
                </span>
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Aktif kampanyalar ana sayfada görünür. Pasife alınan kampanyalar gizlenir.
              </p>
            </div>
            <div className="p-6">
              {campaigns.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  Henüz kampanya oluşturulmadı.
                </div>
              ) : (
                <div className="space-y-3">
                  {campaigns.map((campaign) => (
                    <div
                      key={campaign.id}
                      className={`rounded-2xl border p-4 transition ${
                        campaign.isActive
                          ? "border-purple-200 bg-purple-50"
                          : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-slate-900">{campaign.title}</p>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              campaign.isActive
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border border-slate-200 bg-white text-slate-500"
                            }`}>
                              {campaign.isActive ? "Aktif" : "Pasif"}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                              Sıra: {campaign.order}
                            </span>
                          </div>
                          {campaign.description && (
                            <p className="mt-1.5 text-xs leading-5 text-slate-500">{campaign.description}</p>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleCampaign(campaign)}
                            disabled={togglingCampaignId === campaign.id}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                          >
                            {campaign.isActive ? "Pasife Al" : "Aktif Et"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCampaign(campaign.id)}
                            disabled={deletingCampaignId === campaign.id}
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
                          >
                            {deletingCampaignId === campaign.id ? "Siliniyor..." : "Sil"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ── Item Types Yönetimi ── */}
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">

          {/* Item Type oluştur */}
          <section className={cardClassName()}>
            <div className="border-b border-slate-200 px-6 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">İtem Türleri</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Yeni item ekle</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Kafe, Tatlı, Hamburger gibi itemleri ekle.
              </p>
            </div>
            <div className="space-y-5 p-6">

              {itemTypeError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {itemTypeError}
                </div>
              )}
              {itemTypeMessage && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  {itemTypeMessage}
                </div>
              )}

              <div>
                <label className={labelClassName()}>İtem Adı *</label>
                <input
                  value={itemTypeName}
                  onChange={(e) => setItemTypeName(e.target.value)}
                  placeholder="Örn. Kafe, Tatlı, Hamburger"
                  className={inputClassName()}
                />
              </div>

              <div>
                <label className={labelClassName()}>Sıra (order)</label>
                <input
                  type="number"
                  min="1"
                  value={itemTypeOrder}
                  onChange={(e) => setItemTypeOrder(e.target.value)}
                  className={inputClassName()}
                />
                <p className="mt-1.5 text-xs text-slate-400">Küçük sayı = önce gösterilir</p>
              </div>

              <button
                type="button"
                onClick={handleCreateItemType}
                disabled={savingItemType}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingItemType ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Oluşturuluyor...
                  </>
                ) : (
                  "İtem Ekle"
                )}
              </button>
            </div>
          </section>

          {/* Item Types listesi */}
          <section className={cardClassName()}>
            <div className="border-b border-slate-200 px-6 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">Mevcut İtemler</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                Tüm itemler
                <span className="ml-2 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-sm font-semibold text-cyan-700">
                  {itemTypes.length}
                </span>
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Oluşturduğun itemler owner panelinde dropdown olarak gösterilir.
              </p>
            </div>
            <div className="p-6">
              {itemTypes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  Henüz item oluşturulmadı.
                </div>
              ) : (
                <div className="space-y-3">
                  {itemTypes.map((itemType) => (
                    <div
                      key={itemType.id}
                      className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{itemType.name}</p>
                          <p className="mt-1 text-xs text-slate-600">Sıra: {itemType.order}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteItemType(itemType.id)}
                          disabled={deletingItemTypeId === itemType.id}
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
                        >
                          {deletingItemTypeId === itemType.id ? "Siliniyor..." : "Sil"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

      </div>
    </main>
  );
}