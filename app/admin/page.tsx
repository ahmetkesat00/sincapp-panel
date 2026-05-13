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
  setDoc,
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
  deleteObject,
} from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import ImageCropper from "@/components/dashboard/ui/image-cropper";
import CircularCropTool from "@/components/dashboard/ui/circular-crop-tool";
import getCroppedImg from "@/lib/cropImage";

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
  category: string;
  address: string;
  logoUrl: string;
  openTime: string;
  closeTime: string;
  loyaltyCardsCount: number;
  rejectionNote: string;
  ownerEmail: string;
  ownerName: string;
};

type CampaignItem = {
  id: string;
  title: string;
  description: string;
  bannerImage: string;
  isActive: boolean;
  order: number;
  participantCafeIds: string[];
};

type AnnouncementItem = {
  id: string;
  title: string;
  description: string;
  bannerImage: string;
  isActive: boolean;
  order: number;
};

type ItemType = {
  id: string;
  name: string;
  order: number;
};

type PendingUser = {
  uid: string;
  fullName: string;
  email: string;
  createdAtText: string;
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
  const [deletingCafeId, setDeletingCafeId] = useState("");

  // ── Duyuru state ──
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementDescription, setAnnouncementDescription] = useState("");
  const [announcementImage, setAnnouncementImage] = useState<File | null>(null);
  const [announcementImagePreview, setAnnouncementImagePreview] = useState("");
  const [announcementOrder, setAnnouncementOrder] = useState("1");
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [uploadingAnnouncementImage, setUploadingAnnouncementImage] = useState(false);
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementError, setAnnouncementError] = useState("");
  const [deletingAnnouncementId, setDeletingAnnouncementId] = useState("");
  const [togglingAnnouncementId, setTogglingAnnouncementId] = useState("");
  const [announcementCropSrc, setAnnouncementCropSrc] = useState("");
  const [announcementCroppedAreaPixels, setAnnouncementCroppedAreaPixels] = useState<any>(null);

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
  const [campaignParticipantCafeIds, setCampaignParticipantCafeIds] = useState<string[]>([]);

  // ── Bekleyen Başvurular state ──
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [approvingUid, setApprovingUid] = useState("");
  const [rejectingUid, setRejectingUid] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");
  const [pendingError, setPendingError] = useState("");

  // ── Profil İnceleme state ──
  const [approvingCafeId, setApprovingCafeId] = useState("");
  const [rejectingCafeId, setRejectingCafeId] = useState("");
  const [cafeRejectionNotes, setCafeRejectionNotes] = useState<Record<string, string>>({});
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewError, setReviewError] = useState("");

  // ── App Logo state ──
  const [appLogoUrl, setAppLogoUrl] = useState("");
  const [appLogoFile, setAppLogoFile] = useState<File | null>(null);
  const [appLogoPreview, setAppLogoPreview] = useState("");
  const [appLogoUploading, setAppLogoUploading] = useState(false);
  const [appLogoMessage, setAppLogoMessage] = useState("");
  const [appLogoError, setAppLogoError] = useState("");
  const [appLogoCropSrc, setAppLogoCropSrc] = useState("");

  // ── Splash Screen state ──
  const [splashImageUrl, setSplashImageUrl] = useState("");
  const [splashImageFile, setSplashImageFile] = useState<File | null>(null);
  const [splashImagePreview, setSplashImagePreview] = useState("");
  const [splashImageUploading, setSplashImageUploading] = useState(false);
  const [splashImageMessage, setSplashImageMessage] = useState("");
  const [splashImageError, setSplashImageError] = useState("");

  // ── Admin Story state ──
  const [adminStory, setAdminStory] = useState<{ id: string; storyUrl: string } | null>(null);
  const [adminStoryFile, setAdminStoryFile] = useState<File | null>(null);
  const [adminStoryPreview, setAdminStoryPreview] = useState("");
  const [adminStoryUploading, setAdminStoryUploading] = useState(false);
  const [adminStoryMessage, setAdminStoryMessage] = useState("");
  const [adminStoryError, setAdminStoryError] = useState("");
  const [adminStoryCropSrc, setAdminStoryCropSrc] = useState("");
  const [adminStoryCroppedAreaPixels, setAdminStoryCroppedAreaPixels] = useState<any>(null);

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
              const loyaltyCards = Array.isArray(d.loyaltyCards) ? d.loyaltyCards : [];
              return {
                id: item.id,
                name: safeString(d.name) || "(İsim girilmedi)",
                ownerUid: safeString(d.ownerUid),
                isActive: safeBool(d.isActive, true),
                isVisible: safeBool(d.isVisible, false),
                isProfileCompleted: safeBool(d.isProfileCompleted, false),
                approvalStatus: (safeString(d.approvalStatus) as "draft" | "pending" | "approved" | "rejected") || "draft",
                createdAtText,
                category: safeString(d.category),
                address: safeString(d.address),
                logoUrl: safeString(d.logoUrl),
                openTime: safeString(d.openTime),
                closeTime: safeString(d.closeTime),
                loyaltyCardsCount: loyaltyCards.length,
                rejectionNote: safeString(d.rejectionNote),
                ownerEmail: "",
                ownerName: "",
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
              description: safeString(d.description),
              bannerImage: safeString(d.bannerImage),
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
              bannerImage: safeString(d.bannerImage),
              isActive: safeBool(d.isActive, true),
              order: typeof d.order === "number" ? d.order : 999,
              participantCafeIds: Array.isArray(d.participantCafeIds) ? (d.participantCafeIds as string[]) : [],
            };
          });
          setCampaigns(next);
        });

        // ── App Logo ──
        const unsubAppLogo = onSnapshot(doc(db, "appSettings", "config"), (snap) => {
          if (snap.exists()) {
            const d = snap.data() as Record<string, unknown>;
            const logoUrl = safeString(d.appLogoUrl);
            setAppLogoUrl(logoUrl);
            if (logoUrl) setAppLogoPreview(logoUrl);
            const splashUrl = safeString(d.splashImageUrl);
            setSplashImageUrl(splashUrl);
            if (splashUrl) setSplashImagePreview(splashUrl);
          }
        });

        // ── Admin Story ──
        const adminStoryQuery = query(
          collection(db, "stories"),
          where("isAdminStory", "==", true)
        );

        const unsubAdminStory = onSnapshot(adminStoryQuery, (snap) => {
          if (!snap.empty) {
            const d = snap.docs[0].data() as Record<string, unknown>;
            setAdminStory({ id: snap.docs[0].id, storyUrl: safeString(d.storyUrl) });
            setAdminStoryPreview(safeString(d.storyUrl));
          } else {
            setAdminStory(null);
            setAdminStoryPreview("");
          }
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

        // ── Bekleyen Başvurular ──
        const pendingQuery = query(
          collection(db, "users"),
          where("pendingOwnerRequest", "==", true),
          where("role", "==", "user")
        );

        const unsubPending = onSnapshot(pendingQuery, (snap) => {
          const next: PendingUser[] = snap.docs.map((item) => {
            const d = item.data() as Record<string, unknown>;
            const createdAt = d.createdAt as { seconds?: number } | undefined;
            let createdAtText = "-";
            if (createdAt?.seconds) {
              createdAtText = new Date(createdAt.seconds * 1000).toLocaleString("tr-TR");
            }
            return {
              uid: item.id,
              fullName: safeString(d.fullName) || "İsimsiz",
              email: safeString(d.email),
              createdAtText,
            };
          });
          setPendingUsers(next);
        });

        return () => {
          unsubCafes();
          unsubAnnouncements();
          unsubCampaigns();
          unsubAdminStory();
          unsubItemTypes();
          unsubPending();
          unsubAppLogo();
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

  // ── Kafe Sil ──
  async function handleDeleteCafe(cafe: CafeItem) {
    if (!confirm(`"${cafe.name}" kafesini silmek istediğinden emin misin?\n\nTüm alt veriler (kampanyalar, etkinlikler, story vb.) kalıcı olarak silinir.`)) return;

    setDeletingCafeId(cafe.id);
    setErrorText("");
    setMessage("");

    try {
      async function deleteCollection(collPath: string) {
        const snap = await getDocs(collection(db, collPath));
        if (snap.empty) return;
        let batch = writeBatch(db);
        let count = 0;
        for (const d of snap.docs) {
          batch.delete(d.ref);
          if (++count === 499) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }
        if (count > 0) await batch.commit();
      }

      // Alt koleksiyonları sil
      await deleteCollection(`cafes/${cafe.id}/campaigns`);
      await deleteCollection(`cafes/${cafe.id}/customCampaigns`);
      await deleteCollection(`cafes/${cafe.id}/events`);

      // Stories koleksiyonundaki ilgili dokümanları sil
      const storiesSnap = await getDocs(
        query(collection(db, "stories"), where("cafeId", "==", cafe.id))
      );
      if (!storiesSnap.empty) {
        const storyBatch = writeBatch(db);
        storiesSnap.docs.forEach((d) => storyBatch.delete(d.ref));
        await storyBatch.commit();
      }

      // Ana kafe dokümanını sil + sahibinin rolünü sıfırla
      const finalBatch = writeBatch(db);
      finalBatch.delete(doc(db, "cafes", cafe.id));
      if (cafe.ownerUid) {
        finalBatch.update(doc(db, "users", cafe.ownerUid), {
          role: "user",
          cafeId: null,
          updatedAt: serverTimestamp(),
        });
      }
      await finalBatch.commit();

      setMessage(`"${cafe.name}" kafesi ve tüm verileri başarıyla silindi.`);
    } catch (error) {
      console.error(error);
      setErrorText("Kafe silinirken hata oluştu.");
    } finally {
      setDeletingCafeId("");
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

  // ── App Logo handlers ──
  function handleAppLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      setAppLogoError("Lütfen geçerli bir resim dosyası seç.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => setAppLogoCropSrc(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleAppLogoCircularCropComplete(croppedImageData: string) {
    fetch(croppedImageData)
      .then((res) => res.blob())
      .then((blob) => {
        const file = new File([blob], `app_logo_${Date.now()}.png`, { type: "image/png" });
        setAppLogoFile(file);
        setAppLogoPreview(croppedImageData);
        setAppLogoCropSrc("");
      })
      .catch(() => setAppLogoError("Görsel kırpılırken hata oluştu."));
  }

  async function handleAppLogoUpload() {
    if (!appLogoFile) {
      setAppLogoError("Önce bir görsel seç.");
      return;
    }

    setAppLogoMessage("");
    setAppLogoError("");
    setAppLogoUploading(true);

    try {
      if (appLogoUrl) {
        await deleteObject(ref(storage, appLogoUrl)).catch(() => {});
      }

      const storageRef = ref(storage, `app_logo/${Date.now()}.png`);
      await uploadBytes(storageRef, appLogoFile, { contentType: "image/png" });
      const url = await getDownloadURL(storageRef);

      await setDoc(doc(db, "appSettings", "config"), { appLogoUrl: url }, { merge: true });

      setAppLogoFile(null);
      setAppLogoMessage("Uygulama logosu başarıyla güncellendi.");
    } catch (err: any) {
      console.error("App logo upload error:", err);
      setAppLogoError(`Hata: ${err?.message ?? "Bilinmeyen hata"}`);
    } finally {
      setAppLogoUploading(false);
    }
  }

  async function handleAppLogoRemove() {
    if (!appLogoUrl) return;
    if (!confirm("Uygulama logosunu kaldırmak istediğinden emin misin?")) return;

    setAppLogoMessage("");
    setAppLogoError("");
    setAppLogoUploading(true);

    try {
      await deleteObject(ref(storage, appLogoUrl)).catch(() => {});
      await setDoc(doc(db, "appSettings", "config"), { appLogoUrl: "" }, { merge: true });
      setAppLogoFile(null);
      setAppLogoPreview("");
      setAppLogoMessage("Uygulama logosu kaldırıldı.");
    } catch (err) {
      console.error("App logo delete error:", err);
      setAppLogoError("Logo silinirken hata oluştu.");
    } finally {
      setAppLogoUploading(false);
    }
  }

  // ── Splash Screen handlers ──
  function handleSplashImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!file.type.startsWith("image/")) {
      setSplashImageError("Lütfen geçerli bir resim dosyası seç.");
      return;
    }
    setSplashImageFile(file);
    setSplashImagePreview(URL.createObjectURL(file));
    setSplashImageError("");
    setSplashImageMessage("");
  }

  async function handleSplashImageUpload() {
    if (!splashImageFile) {
      setSplashImageError("Önce bir görsel seç.");
      return;
    }
    setSplashImageMessage("");
    setSplashImageError("");
    setSplashImageUploading(true);
    try {
      if (splashImageUrl) {
        await deleteObject(ref(storage, splashImageUrl)).catch(() => {});
      }
      const storageRef = ref(storage, `splash_screen/${Date.now()}.png`);
      await uploadBytes(storageRef, splashImageFile, { contentType: splashImageFile.type });
      const url = await getDownloadURL(storageRef);
      await setDoc(doc(db, "appSettings", "config"), { splashImageUrl: url }, { merge: true });
      setSplashImageFile(null);
      setSplashImageMessage("Splash screen başarıyla güncellendi.");
    } catch (err: any) {
      console.error("Splash image upload error:", err);
      setSplashImageError(`Hata: ${err?.message ?? "Bilinmeyen hata"}`);
    } finally {
      setSplashImageUploading(false);
    }
  }

  async function handleSplashImageRemove() {
    if (!splashImageUrl) return;
    if (!confirm("Splash screen görselini kaldırmak istediğinden emin misin?")) return;
    setSplashImageMessage("");
    setSplashImageError("");
    setSplashImageUploading(true);
    try {
      await deleteObject(ref(storage, splashImageUrl)).catch(() => {});
      await setDoc(doc(db, "appSettings", "config"), { splashImageUrl: "" }, { merge: true });
      setSplashImageFile(null);
      setSplashImagePreview("");
      setSplashImageMessage("Splash screen kaldırıldı.");
    } catch (err) {
      console.error("Splash image delete error:", err);
      setSplashImageError("Görsel silinirken hata oluştu.");
    } finally {
      setSplashImageUploading(false);
    }
  }

  // ── Admin Story handlers ──
  function handleAdminStoryFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      setAdminStoryError("Lütfen geçerli bir resim dosyası seç.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => setAdminStoryCropSrc(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleAdminStoryCropApply() {
    if (!adminStoryCropSrc || !adminStoryCroppedAreaPixels) return;
    try {
      const blob = await getCroppedImg(adminStoryCropSrc, adminStoryCroppedAreaPixels);
      if (!blob) return;
      const file = new File([blob], `admin_story_${Date.now()}.jpg`, { type: "image/jpeg" });
      setAdminStoryFile(file);
      setAdminStoryPreview(URL.createObjectURL(blob));
      setAdminStoryCropSrc("");
      setAdminStoryCroppedAreaPixels(null);
    } catch {
      setAdminStoryError("Görsel kırpılırken hata oluştu.");
    }
  }

  async function handleAdminStoryUpload() {
    if (!adminStoryFile) {
      setAdminStoryError("Önce bir görsel seç.");
      return;
    }

    setAdminStoryMessage("");
    setAdminStoryError("");
    setAdminStoryUploading(true);

    try {
      // Eski admin story'yi Storage'dan sil
      if (adminStory?.storyUrl) {
        await deleteObject(ref(storage, adminStory.storyUrl)).catch(() => {});
      }

      const storageRef = ref(storage, `stories/admin/${Date.now()}.jpg`);
      await uploadBytes(storageRef, adminStoryFile, { contentType: "image/jpeg" });
      const url = await getDownloadURL(storageRef);

      if (adminStory) {
        await updateDoc(doc(db, "stories", adminStory.id), {
          storyUrl: url,
          uploadedAt: serverTimestamp(),
          updatedBy: adminUid,
        });
      } else {
        await addDoc(collection(db, "stories"), {
          cafeId: "admin",
          cafeName: "LoopyGo",
          logoUrl: "",
          isAdminStory: true,
          isPinned: true,
          storyUrl: url,
          uploadedAt: serverTimestamp(),
          createdBy: adminUid,
        });
      }

      setAdminStoryFile(null);
      setAdminStoryMessage("Admin story başarıyla yüklendi.");
    } catch (err: any) {
      console.error("Admin story upload error:", err);
      setAdminStoryError(`Hata: ${err?.message ?? "Bilinmeyen hata"} (code: ${err?.code ?? "-"})`);
    } finally {
      setAdminStoryUploading(false);
    }
  }

  async function handleAdminStoryRemove() {
    if (!adminStory) return;
    if (!confirm("Admin story'yi silmek istediğinden emin misin?")) return;

    setAdminStoryMessage("");
    setAdminStoryError("");
    setAdminStoryUploading(true);

    try {
      await deleteObject(ref(storage, adminStory.storyUrl)).catch(() => {});
      await deleteDoc(doc(db, "stories", adminStory.id));
      setAdminStoryFile(null);
      setAdminStoryPreview("");
      setAdminStoryMessage("Admin story silindi.");
    } catch (err) {
      console.error("Admin story delete error:", err);
      setAdminStoryError("Story silinirken hata oluştu.");
    } finally {
      setAdminStoryUploading(false);
    }
  }

  // ── Announcement Image Handler ──
  function handleAnnouncementImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      setAnnouncementError("Lütfen geçerli bir resim dosyası seç.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setAnnouncementError("Resim boyutu 10MB'dan küçük olmalı.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setAnnouncementCropSrc(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleAnnouncementCropApply() {
    if (!announcementCropSrc || !announcementCroppedAreaPixels) return;
    try {
      const blob = await getCroppedImg(announcementCropSrc, announcementCroppedAreaPixels, 1050, 600);
      if (!blob) return;
      const file = new File([blob], `announcement_${Date.now()}.jpg`, { type: "image/jpeg" });
      setAnnouncementImage(file);
      setAnnouncementImagePreview(URL.createObjectURL(blob));
      setAnnouncementCropSrc("");
      setAnnouncementCroppedAreaPixels(null);
    } catch {
      setAnnouncementError("Görsel kırpılırken hata oluştu.");
    }
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
        description: announcementDescription.trim(),
        bannerImage: bannerImageUrl,
        isActive: true,
        order: Number(announcementOrder) || 999,
        createdAt: serverTimestamp(),
        createdBy: adminUid,
      });

      setAnnouncementTitle("");
      setAnnouncementDescription("");
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
        participantCafeIds: campaignParticipantCafeIds,
        createdAt: serverTimestamp(),
        createdBy: adminUid,
      });

      setCampaignTitle("");
      setCampaignDescription("");
      setCampaignOrder("1");
      setCampaignImage(null);
      setCampaignImagePreview("");
      setCampaignParticipantCafeIds([]);

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

  // ── Başvuru Onayla ──
  async function handleApproveUser(pendingUser: PendingUser) {
    setApprovingUid(pendingUser.uid);
    setPendingMessage("");
    setPendingError("");

    try {
      const cafeRef = doc(collection(db, "cafes"));
      const userRef = doc(db, "users", pendingUser.uid);
      const batch = writeBatch(db);

      batch.set(cafeRef, {
        ownerUid: pendingUser.uid,
        name: "",
        category: "",
        openTime: "",
        closeTime: "",
        rewardBuy: 0,
        rewardGift: 0,
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
        pendingOwnerRequest: false,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      setPendingMessage(`${pendingUser.fullName} onaylandı ve owner olarak atandı.`);
    } catch (error) {
      console.error(error);
      setPendingError("Onaylama sırasında hata oluştu.");
    } finally {
      setApprovingUid("");
    }
  }

  // ── Başvuru Reddet ──
  async function handleRejectUser(pendingUser: PendingUser) {
    if (!confirm(`${pendingUser.fullName} adlı kullanıcının başvurusunu reddetmek istiyor musunuz?`)) return;

    setRejectingUid(pendingUser.uid);
    setPendingMessage("");
    setPendingError("");

    try {
      await updateDoc(doc(db, "users", pendingUser.uid), {
        pendingOwnerRequest: false,
        updatedAt: serverTimestamp(),
      });
      setPendingMessage(`${pendingUser.fullName} başvurusu reddedildi.`);
    } catch (error) {
      console.error(error);
      setPendingError("Red işlemi sırasında hata oluştu.");
    } finally {
      setRejectingUid("");
    }
  }

  // ── Profil Onayla ──
  async function handleApproveCafe(cafe: CafeItem) {
    setApprovingCafeId(cafe.id);
    setReviewMessage("");
    setReviewError("");
    try {
      await updateDoc(doc(db, "cafes", cafe.id), {
        approvalStatus: "approved",
        isVisible: true,
        rejectionNote: "",
        updatedAt: serverTimestamp(),
      });
      setReviewMessage(`"${cafe.name}" onaylandı ve yayına alındı.`);
    } catch (error) {
      console.error(error);
      setReviewError("Onaylama sırasında hata oluştu.");
    } finally {
      setApprovingCafeId("");
    }
  }

  // ── Profil Reddet ──
  async function handleRejectCafe(cafe: CafeItem) {
    const note = (cafeRejectionNotes[cafe.id] || "").trim();
    if (!note) {
      setReviewError(`"${cafe.name}" için red sebebi giriniz.`);
      return;
    }
    setRejectingCafeId(cafe.id);
    setReviewMessage("");
    setReviewError("");
    try {
      await updateDoc(doc(db, "cafes", cafe.id), {
        approvalStatus: "rejected",
        isVisible: false,
        rejectionNote: note,
        updatedAt: serverTimestamp(),
      });
      setCafeRejectionNotes((prev) => ({ ...prev, [cafe.id]: "" }));
      setReviewMessage(`"${cafe.name}" reddedildi.`);
    } catch (error) {
      console.error(error);
      setReviewError("Red işlemi sırasında hata oluştu.");
    } finally {
      setRejectingCafeId("");
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
              LoopyGo Admin
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

        {/* ── Bekleyen Başvurular ── */}
        {pendingUsers.length > 0 && (
          <section className={cardClassName()}>
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex items-center gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Bekleyen Başvurular</p>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-sm font-semibold text-amber-700">
                  {pendingUsers.length}
                </span>
              </div>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Kafe sahibi olmak isteyen kullanıcılar</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Kafe adı girerek onaylayın veya başvuruyu reddedin.
              </p>
            </div>

            <div className="p-6 space-y-3">
              {pendingError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {pendingError}
                </div>
              )}
              {pendingMessage && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  {pendingMessage}
                </div>
              )}

              {pendingUsers.map((u) => (
                <div key={u.uid} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{u.fullName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{u.email}</p>
                      <p className="mt-0.5 text-xs text-slate-400">Başvuru: {u.createdAtText}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={() => handleApproveUser(u)}
                        disabled={approvingUid === u.uid}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {approvingUid === u.uid ? "Onaylanıyor..." : "Onayla"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectUser(u)}
                        disabled={rejectingUid === u.uid}
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
                      >
                        {rejectingUid === u.uid ? "Reddediliyor..." : "Reddet"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Profil İnceleme (pending_review) ── */}
        {cafes.filter((c) => c.approvalStatus === "pending").length > 0 && (
          <section className={cardClassName()}>
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex items-center gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Profil İnceleme</p>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-sm font-semibold text-blue-700">
                  {cafes.filter((c) => c.approvalStatus === "pending").length}
                </span>
              </div>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Yayın onayı bekleyen mağazalar</h2>
              <p className="mt-1 text-sm text-slate-500">Profili tamamlanmış mağazaları incele ve onayla ya da reddet.</p>
            </div>

            <div className="space-y-4 p-6">
              {reviewError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{reviewError}</div>
              )}
              {reviewMessage && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{reviewMessage}</div>
              )}

              {cafes.filter((c) => c.approvalStatus === "pending").map((cafe) => (
                <div key={cafe.id} className="rounded-2xl border border-blue-200 bg-blue-50 p-5 space-y-4">
                  {/* Başlık */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {cafe.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cafe.logoUrl} alt="" className="h-12 w-12 rounded-xl object-cover border border-slate-200" />
                      ) : (
                        <div className="h-12 w-12 rounded-xl bg-slate-200 flex items-center justify-center text-xs text-slate-400">Logo yok</div>
                      )}
                      <div>
                        <p className="font-bold text-slate-900">{cafe.name}</p>
                        <p className="text-xs text-slate-500">{cafe.category || "Kategori girilmemiş"}</p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700">İnceleme bekliyor</span>
                  </div>

                  {/* Bilgiler */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                      <p className="text-slate-400 font-medium">Adres</p>
                      <p className="text-slate-700 mt-0.5">{cafe.address || "—"}</p>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                      <p className="text-slate-400 font-medium">Çalışma Saatleri</p>
                      <p className="text-slate-700 mt-0.5">
                        {cafe.openTime && cafe.closeTime ? `${cafe.openTime} – ${cafe.closeTime}` : "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                      <p className="text-slate-400 font-medium">Sadakat Kartı</p>
                      <p className={`mt-0.5 font-semibold ${cafe.loyaltyCardsCount > 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {cafe.loyaltyCardsCount > 0 ? `${cafe.loyaltyCardsCount} kart` : "Kart yok"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                      <p className="text-slate-400 font-medium">Logo</p>
                      <p className={`mt-0.5 font-semibold ${cafe.logoUrl ? "text-emerald-700" : "text-red-600"}`}>
                        {cafe.logoUrl ? "Yüklendi" : "Yüklenmedi"}
                      </p>
                    </div>
                  </div>

                  {/* Red sebebi input */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Red sebebi (reddetmek istiyorsan doldur)
                    </label>
                    <input
                      value={cafeRejectionNotes[cafe.id] || ""}
                      onChange={(e) => setCafeRejectionNotes((prev) => ({ ...prev, [cafe.id]: e.target.value }))}
                      placeholder="Örn. Logo kalitesiz, adres eksik..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    />
                  </div>

                  {/* Butonlar */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleApproveCafe(cafe)}
                      disabled={approvingCafeId === cafe.id || rejectingCafeId === cafe.id}
                      className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {approvingCafeId === cafe.id ? "Onaylanıyor..." : "✓ Onayla & Yayına Al"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectCafe(cafe)}
                      disabled={approvingCafeId === cafe.id || rejectingCafeId === cafe.id}
                      className="flex-1 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                    >
                      {rejectingCafeId === cafe.id ? "Reddediliyor..." : "✕ Reddet"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

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
                            {togglingVisibilityId === cafe.id ? "..." : cafe.isVisible ? "Yayından Kaldır" : "Yayına Al"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCafe(cafe)}
                            disabled={deletingCafeId === cafe.id}
                            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
                          >
                            {deletingCafeId === cafe.id ? "Siliniyor..." : "Kafeyi Sil"}
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

        {/* ── Uygulama Logosu ── */}
        <section className={cardClassName()}>
          <div className="border-b border-slate-200 px-6 py-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Uygulama Logosu</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">App logosu yönet</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Yüklenen logo uygulamada gösterilir. 1:1 oranında kırpılır.
            </p>
          </div>

          <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start">

            {/* Önizleme */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-emerald-500 bg-white shadow-sm">
                {appLogoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={appLogoPreview} alt="App Logo" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-center text-xs font-medium text-slate-400 px-2">Logo yok</span>
                )}
              </div>
              {appLogoUrl && (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  Aktif
                </span>
              )}
            </div>

            {/* Kontroller */}
            <div className="flex-1 space-y-4">
              {appLogoError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {appLogoError}
                </div>
              )}
              {appLogoMessage && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  {appLogoMessage}
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-800">
                  Logo Görseli{" "}
                  <span className="font-normal text-slate-400">(1:1 oranında kırpılır)</span>
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAppLogoFileChange}
                  disabled={appLogoUploading}
                  className="hidden"
                  id="app-logo-input"
                />
                <label
                  htmlFor="app-logo-input"
                  className="flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 transition hover:border-emerald-400 hover:bg-emerald-50"
                >
                  {appLogoFile ? (
                    <p className="text-sm font-semibold text-slate-900">
                      ✓ Seçildi — yüklemek için butona bas
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-slate-500">
                      Görsel seç (PNG, JPG)
                    </p>
                  )}
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleAppLogoUpload}
                  disabled={!appLogoFile || appLogoUploading}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {appLogoUploading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Yükleniyor...
                    </>
                  ) : appLogoUrl ? (
                    "Logoyu Güncelle"
                  ) : (
                    "Logoyu Yükle"
                  )}
                </button>

                {appLogoUrl && (
                  <button
                    type="button"
                    onClick={handleAppLogoRemove}
                    disabled={appLogoUploading}
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
                  >
                    Kaldır
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Crop modal */}
          {appLogoCropSrc && (
            <CircularCropTool
              src={appLogoCropSrc}
              onCropComplete={handleAppLogoCircularCropComplete}
              onCancel={() => setAppLogoCropSrc("")}
            />
          )}
        </section>

        {/* ── Splash Screen ── */}
        <section className={cardClassName()}>
          <div className="border-b border-slate-200 px-6 py-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">Splash Screen</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Açılış ekranı görseli</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Uygulama açılırken gösterilecek görsel. Önerilen boyut: 1080×1920 (9:16).
            </p>
          </div>

          <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start">

            {/* Önizleme */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-40 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-indigo-300 bg-slate-100 shadow-sm">
                {splashImagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={splashImagePreview} alt="Splash Screen" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-center text-xs font-medium text-slate-400 px-2">Görsel yok</span>
                )}
              </div>
              {splashImageUrl && (
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                  Aktif
                </span>
              )}
            </div>

            {/* Kontroller */}
            <div className="flex-1 space-y-4">
              {splashImageError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {splashImageError}
                </div>
              )}
              {splashImageMessage && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  {splashImageMessage}
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-800">
                  Splash Görseli{" "}
                  <span className="font-normal text-slate-400">(PNG, JPG — 9:16 önerilir)</span>
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleSplashImageFileChange}
                  disabled={splashImageUploading}
                  className="hidden"
                  id="splash-image-input"
                />
                <label
                  htmlFor="splash-image-input"
                  className="flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 transition hover:border-indigo-400 hover:bg-indigo-50"
                >
                  {splashImageFile ? (
                    <p className="text-sm font-semibold text-slate-900">✓ Seçildi — yüklemek için butona bas</p>
                  ) : (
                    <p className="text-sm font-semibold text-slate-500">Görsel seç (PNG, JPG)</p>
                  )}
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSplashImageUpload}
                  disabled={!splashImageFile || splashImageUploading}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {splashImageUploading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Yükleniyor...
                    </>
                  ) : splashImageUrl ? (
                    "Görseli Güncelle"
                  ) : (
                    "Görseli Yükle"
                  )}
                </button>
                {splashImageUrl && (
                  <button
                    type="button"
                    onClick={handleSplashImageRemove}
                    disabled={splashImageUploading}
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
                  >
                    Kaldır
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Admin Story ── */}
        <section className={cardClassName()}>
          <div className="border-b border-slate-200 px-6 py-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-rose-700">Admin Story</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Sabit & süresiz story</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Yüklenen story her zaman en başta sabit olarak görünür. Süre sınırı yoktur.
            </p>
          </div>

          <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start">

            {/* Önizleme */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-40 w-24 items-center justify-center overflow-hidden rounded-2xl border-2 border-rose-300 bg-slate-100 shadow-sm">
                {adminStoryPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={adminStoryPreview} alt="Admin Story" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-center text-xs font-medium text-slate-400 px-2">Story yok</span>
                )}
              </div>
              {adminStory && (
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                  Aktif
                </span>
              )}
            </div>

            {/* Kontroller */}
            <div className="flex-1 space-y-4">
              {adminStoryError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {adminStoryError}
                </div>
              )}
              {adminStoryMessage && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  {adminStoryMessage}
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-800">
                  Story Görseli{" "}
                  <span className="font-normal text-slate-400">(9:16 oranında kırpılır)</span>
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAdminStoryFileChange}
                  disabled={adminStoryUploading}
                  className="hidden"
                  id="admin-story-input"
                />
                <label
                  htmlFor="admin-story-input"
                  className="flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 transition hover:border-rose-400 hover:bg-rose-50"
                >
                  {adminStoryFile ? (
                    <p className="text-sm font-semibold text-slate-900">
                      ✓ Seçildi — yüklemek için butona bas
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-slate-500">
                      Görsel seç (PNG, JPG)
                    </p>
                  )}
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleAdminStoryUpload}
                  disabled={!adminStoryFile || adminStoryUploading}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {adminStoryUploading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Yükleniyor...
                    </>
                  ) : adminStory ? (
                    "Story'yi Güncelle"
                  ) : (
                    "Story'yi Yükle"
                  )}
                </button>

                {adminStory && (
                  <button
                    type="button"
                    onClick={handleAdminStoryRemove}
                    disabled={adminStoryUploading}
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
                  >
                    Sil
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Crop modal */}
          {adminStoryCropSrc && (
            <ImageCropper
              image={adminStoryCropSrc}
              aspect={9 / 16}
              onCropComplete={(_: any, croppedAreaPixels: any) =>
                setAdminStoryCroppedAreaPixels(croppedAreaPixels)
              }
              onApply={handleAdminStoryCropApply}
              onCancel={() => {
                setAdminStoryCropSrc("");
                setAdminStoryCroppedAreaPixels(null);
              }}
            />
          )}
        </section>

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
                <label className={labelClassName()}>
                  Duyuru Görseli *{" "}
                  <span className="font-normal text-slate-400">(1050 × 600 px)</span>
                </label>
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
                            className="mx-auto mb-2 h-16 rounded-lg object-cover"
                            style={{ aspectRatio: "1050/600" }}
                          />
                          <p className="text-sm font-semibold text-slate-900">Değiştirmek için tıkla</p>
                          <p className="text-xs text-slate-500">1050 × 600 px</p>
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
                          <p className="text-xs text-slate-500">PNG, JPG • kırpılır: 1050×600</p>
                        </>
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {announcementCropSrc && (
                <ImageCropper
                  image={announcementCropSrc}
                  aspect={1050 / 600}
                  onCropComplete={(_: any, croppedAreaPixels: any) =>
                    setAnnouncementCroppedAreaPixels(croppedAreaPixels)
                  }
                  onApply={handleAnnouncementCropApply}
                  onCancel={() => {
                    setAnnouncementCropSrc("");
                    setAnnouncementCroppedAreaPixels(null);
                  }}
                />
              )}

              <div>
                <label className={labelClassName()}>Duyuru başlığı *</label>
                <input
                  value={announcementTitle}
                  onChange={(e) => setAnnouncementTitle(e.target.value)}
                  placeholder="Örn. LoopyGo Kart Tanıtımı"
                  className={inputClassName()}
                />
              </div>

              <div>
                <label className={labelClassName()}>Açıklama</label>
                <textarea
                  value={announcementDescription}
                  onChange={(e) => setAnnouncementDescription(e.target.value)}
                  placeholder="Duyuru detayı..."
                  className="min-h-[100px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
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
                        <div className="flex min-w-0 flex-1 gap-3">
                          {announcement.bannerImage && (
                            <img
                              src={announcement.bannerImage}
                              alt={announcement.title}
                              className="h-14 w-14 shrink-0 rounded-xl object-cover"
                            />
                          )}
                          <div className="min-w-0">
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
                            {announcement.description && (
                              <p className="mt-1 text-xs leading-5 text-slate-500 line-clamp-2">{announcement.description}</p>
                            )}
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

              <div>
                <label className={labelClassName()}>
                  Katılımcı Kafeler
                  {campaignParticipantCafeIds.length > 0 && (
                    <span className="ml-2 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">
                      {campaignParticipantCafeIds.length} seçili
                    </span>
                  )}
                </label>
                {cafes.length === 0 ? (
                  <p className="mt-1.5 text-xs text-slate-400">Henüz onaylı kafe yok.</p>
                ) : (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                    {cafes.map((cafe) => (
                      <label key={cafe.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={campaignParticipantCafeIds.includes(cafe.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCampaignParticipantCafeIds((prev) => [...prev, cafe.id]);
                            } else {
                              setCampaignParticipantCafeIds((prev) => prev.filter((id) => id !== cafe.id));
                            }
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-sm text-slate-800">{cafe.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-xs text-slate-400">Seçilmezse kampanya tüm kafelerde görünür.</p>
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
                        <div className="flex min-w-0 flex-1 gap-3">
                          {campaign.bannerImage && (
                            <img
                              src={campaign.bannerImage}
                              alt={campaign.title}
                              className="h-14 w-14 shrink-0 rounded-xl object-cover"
                            />
                          )}
                          <div className="min-w-0">
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
                              <p className="mt-1 text-xs leading-5 text-slate-500 line-clamp-2">{campaign.description}</p>
                            )}
                            <p className="mt-1 text-xs text-slate-400">
                              {campaign.participantCafeIds.length > 0
                                ? `${campaign.participantCafeIds.length} kafe katılıyor`
                                : "Tüm kafeler"}
                            </p>
                          </div>
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