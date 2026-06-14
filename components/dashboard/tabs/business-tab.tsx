"use client";

import React, { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
  GeoPoint,
  addDoc,
  deleteDoc,
  orderBy,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import ImageCropper from "../ui/image-cropper";
import getCroppedImg from "@/lib/cropImage";
import CircularCropTool from "../ui/circular-crop-tool";

import SectionTitle from "../ui/section-title";
import Toggle from "../ui/toggle";
import { shellCardClass } from "../helpers";

// ─────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────

type BusinessForm = {
  cafeId: string;
  cafeName: string;
  category: string;
  address: string;
  location: string;
  logoUrl: string;
  isOpen: boolean;
  isVisible: boolean;
  approvalStatus: string;
  instagramUrl: string;
  menuUrl: string;
};

const emptyForm: BusinessForm = {
  cafeId: "",
  cafeName: "",
  category: "",
  address: "",
  location: "",
  logoUrl: "",
  isOpen: false,
  isVisible: false,
  approvalStatus: "",
  instagramUrl: "",
  menuUrl: "",
};

const CATEGORIES_FALLBACK = ["Kafe", "Restoran", "Pastane & Fırın", "Diğer"];

const FEATURE_LIST = [
  { key: "wifi", label: "WiFi", icon: "📶" },
  { key: "garden", label: "Bahçe", icon: "🌳" },
  { key: "vegan", label: "Vegan", icon: "🌱" },
  { key: "work", label: "Çalışma", icon: "💻" },
  { key: "meeting", label: "Toplantı", icon: "👥" },
  { key: "parking", label: "Otopark", icon: "🅿️" },
];

const CARD_LIST = [
  { key: "nakit", label: "Nakit" },
  { key: "banka_kredi", label: "Banka & Kredi Kartı" },
  { key: "multinet", label: "Multinet" },
  { key: "pluxee", label: "Pluxee" },
  { key: "edenred", label: "Edenred Ticket" },
  { key: "setcard", label: "Setcard" },
  { key: "metropol", label: "Metropol" },
  { key: "tokenflex", label: "TokenFlex" },
];

type WorkingDay = { isOpen: boolean; openTime: string; closeTime: string };
type WorkingHours = Record<string, WorkingDay>;

const DAYS = [
  { key: "mon", label: "Pazartesi" },
  { key: "tue", label: "Salı" },
  { key: "wed", label: "Çarşamba" },
  { key: "thu", label: "Perşembe" },
  { key: "fri", label: "Cuma" },
  { key: "sat", label: "Cumartesi" },
  { key: "sun", label: "Pazar" },
];

const defaultWorkingHours = (): WorkingHours =>
  Object.fromEntries(DAYS.map((d) => [d.key, { isOpen: true, openTime: "09:00", closeTime: "22:00" }]));

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatLocationValue(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const v = value as Record<string, unknown>;
    if ("latitude" in v && "longitude" in v)
      return `${v.latitude}, ${v.longitude}`;
    if ("_lat" in v && "_long" in v) return `${v._lat}, ${v._long}`;
  }
  return String(value);
}

function inputClass() {
  return "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";
}

function isUploadedToday(uploadedAt: unknown): boolean {
  if (!uploadedAt) return false;
  let uploadTime: number;
  if (uploadedAt instanceof Timestamp) {
    uploadTime = uploadedAt.toMillis();
  } else if (typeof uploadedAt === "number") {
    uploadTime = uploadedAt;
  } else {
    return false;
  }
  const now = new Date();
  const uploaded = new Date(uploadTime);
  return (
    now.getFullYear() === uploaded.getFullYear() &&
    now.getMonth() === uploaded.getMonth() &&
    now.getDate() === uploaded.getDate()
  );
}

function isStoryExpired(uploadedAt: unknown): boolean {
  if (!uploadedAt) return false;
  let uploadTime: number;
  if (uploadedAt instanceof Timestamp) {
    uploadTime = uploadedAt.toMillis();
  } else if (typeof uploadedAt === "number") {
    uploadTime = uploadedAt;
  } else {
    return false;
  }
  return Date.now() - uploadTime > 24 * 60 * 60 * 1000;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

type Props = { cafeId: string; chainId?: string };

export default function BusinessTab({ cafeId: cafeIdProp, chainId }: Props) {
  const [form, setForm] = useState<BusinessForm>(emptyForm);
  const [savedForm, setSavedForm] = useState<BusinessForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [categoryList, setCategoryList] = useState<string[]>([]);

  useEffect(() => {
    getDocs(query(collection(db, "categories"), orderBy("order", "asc")))
      .then((snap) => {
        const names = snap.docs.map((d) => d.data().name as string).filter(Boolean);
        setCategoryList(names.length > 0 ? names : CATEGORIES_FALLBACK);
      })
      .catch(() => setCategoryList(CATEGORIES_FALLBACK));
  }, []);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");

  // Story State
  const [storyFile, setStoryFile] = useState<File | null>(null);
  const [storyPreview, setStoryPreview] = useState("");
  const [storyUrl, setStoryUrl] = useState("");
  const [storyUploadedAt, setStoryUploadedAt] = useState<Timestamp | null>(null);
  const [storyUploading, setStoryUploading] = useState(false);
  const [storyExpired, setStoryExpired] = useState(false);
  const [storyId, setStoryId] = useState<string | null>(null);

  // Hero Image State
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [heroImagePreview, setHeroImagePreview] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [heroImageUploading, setHeroImageUploading] = useState(false);

  // Menu Images State
  const [menuFiles, setMenuFiles] = useState<File[]>([]);
  const [menuUploading, setMenuUploading] = useState(false);
  const [menuImages, setMenuImages] = useState<string[]>([]);
  const [removedMenuUrls, setRemovedMenuUrls] = useState<string[]>([]);

  // Features & Cards State
  const [features, setFeatures] = useState<string[]>([]);
  const [savedFeaturesState, setSavedFeaturesState] = useState<string[]>([]);
  const [cards, setCards] = useState<string[]>([]);
  const [savedCardsState, setSavedCardsState] = useState<string[]>([]);

  // Working Hours State
  const [workingHours, setWorkingHours] = useState<WorkingHours>(defaultWorkingHours());
  const [savedWorkingHours, setSavedWorkingHours] = useState<WorkingHours>(defaultWorkingHours());

  // Crop State
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [cropArea, setCropArea] = useState<any>(null);
  const [cropType, setCropType] = useState<"story" | "hero" | null>(null);

  // Circular Crop State
  const [showCircularCrop, setShowCircularCrop] = useState(false);
  const [circularCropImage, setCircularCropImage] = useState("");

  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");

  const featuresChanged = JSON.stringify(features) !== JSON.stringify(savedFeaturesState);
  const cardsChanged = JSON.stringify(cards) !== JSON.stringify(savedCardsState);
  const workingHoursChanged = JSON.stringify(workingHours) !== JSON.stringify(savedWorkingHours);

  const hasChanges =
    logoFile !== null ||
    storyFile !== null ||
    heroImageFile !== null ||
    menuFiles.length > 0 ||
    removedMenuUrls.length > 0 ||
    JSON.stringify(form) !== JSON.stringify(savedForm) ||
    featuresChanged ||
    cardsChanged ||
    workingHoursChanged;

  // Today's working hours for preview
  const DAY_KEYS_SUN_FIRST = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const todayKey = DAY_KEYS_SUN_FIRST[new Date().getDay()];
  const todayHours = workingHours[todayKey];

  // ── Firestore'dan veri çek ──
  useEffect(() => {
    if (!cafeIdProp) return;
    let active = true;

    (async () => {
      try {
        const cafeDocSnap = await getDoc(doc(db, "cafes", cafeIdProp));

        if (!active) return;

        if (!cafeDocSnap.exists()) {
          setErrorText("Kafe bulunamadı.");
          setLoading(false);
          return;
        }

        const cafeDoc = cafeDocSnap;
        const d = cafeDoc.data();

        const loaded: BusinessForm = {
          cafeId: cafeDoc.id,
          cafeName: String(d?.name ?? ""),
          category: String(d?.category ?? ""),
          address: String(d?.address ?? ""),
          location: formatLocationValue(d?.location ?? d?.locationText ?? ""),
          logoUrl: String(d?.logoUrl ?? ""),
          isOpen: Boolean(d?.isActive ?? d?.isOpen ?? false),
          isVisible: Boolean(d?.isVisible ?? false),
          approvalStatus: String(d?.approvalStatus ?? ""),
          instagramUrl: String(d?.instagramUrl ?? ""),
          menuUrl: String(d?.menuUrl ?? ""),
        };

        setForm(loaded);
        setSavedForm(loaded);
        setLogoPreview(loaded.logoUrl);

        // Story verilerini yükle
        try {
          const storySnap = await getDocs(
            query(collection(db, "stories"), where("cafeId", "==", cafeDoc.id))
          );

          // Kafe dokümanındaki lastStoryUploadedAt her zaman limit için kullanılır
          const cafeLastUpload = d?.lastStoryUploadedAt ?? null;

          if (!storySnap.empty) {
            const storyDoc = storySnap.docs[0];
            const storyData = storyDoc.data();
            const loadedStoryUrl = String(storyData?.storyUrl ?? "");
            const loadedStoryUploadedAt = storyData?.uploadedAt ?? cafeLastUpload;
            setStoryId(storyDoc.id);
            setStoryUrl(loadedStoryUrl);
            setStoryUploadedAt(loadedStoryUploadedAt);
            setStoryPreview(loadedStoryUrl);
            if (loadedStoryUrl && isStoryExpired(loadedStoryUploadedAt)) {
              setStoryExpired(true);
            }
          } else {
            // Story dokümanı yok ama bugün yüklediyse limiti koru
            setStoryUploadedAt(cafeLastUpload);
          }
        } catch (err) {
          console.error("Story fetch error:", err);
        }

        // Hero Image
        const loadedHeroImageUrl = String(d?.heroImage ?? "");
        setHeroImageUrl(loadedHeroImageUrl);
        setHeroImagePreview(loadedHeroImageUrl);

        // Menu Images
        const loadedMenuImages = Array.isArray(d?.menuImages) ? d.menuImages : [];
        setMenuImages(loadedMenuImages);

        // Features
        const loadedFeatures = Array.isArray(d?.features) ? d.features : [];
        setFeatures(loadedFeatures);
        setSavedFeaturesState(loadedFeatures);

        // Cards
        const loadedCards = Array.isArray(d?.cards) ? d.cards : [];
        setCards(loadedCards);
        setSavedCardsState(loadedCards);

        // Working Hours
        const raw = d?.workingHours;
        const loadedHours: WorkingHours = defaultWorkingHours();
        if (raw && typeof raw === "object") {
          DAYS.forEach(({ key }) => {
            const day = (raw as Record<string, unknown>)[key];
            if (day && typeof day === "object") {
              const dh = day as Record<string, unknown>;
              loadedHours[key] = {
                isOpen: typeof dh.isOpen === "boolean" ? dh.isOpen : true,
                openTime: typeof dh.openTime === "string" ? dh.openTime : "09:00",
                closeTime: typeof dh.closeTime === "string" ? dh.closeTime : "22:00",
              };
            }
          });
        }
        setWorkingHours(loadedHours);
        setSavedWorkingHours(JSON.parse(JSON.stringify(loadedHours)));
      } catch (err) {
        console.error("BusinessTab load error:", err);
        setErrorText("Veriler yüklenirken hata oluştu.");
      } finally {
        setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [cafeIdProp]);

  // Blob URL'leri temizle
  useEffect(() => {
    return () => {
      if (logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
      if (storyPreview.startsWith("blob:")) URL.revokeObjectURL(storyPreview);
      if (heroImagePreview.startsWith("blob:")) URL.revokeObjectURL(heroImagePreview);
    };
  }, [logoPreview, storyPreview, heroImagePreview]);

  function update<K extends keyof BusinessForm>(key: K, value: BusinessForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage("");
    setErrorText("");
  }

  const toggleFeature = (key: string) => {
    setFeatures((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
    );
  };

  const toggleCard = (key: string) => {
    setCards((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]
    );
  };

  function handleCircularCropComplete(croppedImageData: string) {
    fetch(croppedImageData)
      .then((res) => res.blob())
      .then((blob) => {
        const file = new File([blob], "logo.png", { type: "image/png" });
        setLogoFile(file);
        setLogoPreview(croppedImageData);
        setShowCircularCrop(false);
        setCircularCropImage("");
        setMessage("✅ Logo kırpıldı. Kaydet butonuna basınca yüklenir.");
      })
      .catch(() => setErrorText("❌ Logo kırpma hatası."));
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorText("Logo: Geçerli bir görsel dosyası seç.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setCircularCropImage(e.target?.result as string);
      setShowCircularCrop(true);
    };
    reader.readAsDataURL(file);
  }

  function handleStoryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorText("Story: Geçerli bir görsel dosyası seç.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorText("Story: Dosya 5MB'tan küçük olmalı.");
      return;
    }
    if (storyPreview.startsWith("blob:")) URL.revokeObjectURL(storyPreview);
    setCropImage(URL.createObjectURL(file));
    setCropType("story");
    setMessage("");
    setErrorText("");
  }

  async function handleStoryRemove() {
    if (!storyUrl || !form.cafeId || !storyId) return;
    setMessage("");
    setErrorText("");
    try {
      await deleteObject(ref(storage, storyUrl)).catch(() => {});
      await deleteDoc(doc(db, "stories", storyId));
      setStoryUrl("");
      setStoryPreview("");
      setStoryFile(null);
      setStoryId(null);
      setStoryExpired(false);
      // storyUploadedAt intentionally kept so daily limit remains enforced
      setMessage("✅ Story başarıyla silindi.");
    } catch (err) {
      console.error("Story delete error:", err);
      setErrorText("❌ Story silinirken hata oluştu.");
    }
  }

  function handleHeroImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorText("Hero Image: Geçerli bir görsel dosyası seç.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorText("Hero Image: Dosya 10MB'tan küçük olmalı.");
      return;
    }
    if (heroImagePreview.startsWith("blob:")) URL.revokeObjectURL(heroImagePreview);
    setCropImage(URL.createObjectURL(file));
    setCropType("hero");
    setMessage("");
    setErrorText("");
  }

  async function handleHeroImageRemove() {
    if (!heroImageUrl || !form.cafeId) return;
    setMessage("");
    setErrorText("");
    try {
      await deleteObject(ref(storage, heroImageUrl)).catch(() => {});
      await updateDoc(doc(db, "cafes", form.cafeId), {
        heroImage: null,
        updatedAt: serverTimestamp(),
      });
      setHeroImageUrl("");
      setHeroImagePreview("");
      setHeroImageFile(null);
      setMessage("✅ Hero Image başarıyla silindi.");
    } catch (err) {
      console.error("Hero Image delete error:", err);
      setErrorText("❌ Hero Image silinirken hata oluştu.");
    }
  }

  function handleMenuChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    if (menuImages.length + menuFiles.length + files.length > 5) {
      setErrorText("En fazla 5 menü fotoğrafı yükleyebilirsin.");
      return;
    }
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setErrorText("Sadece görsel dosyaları seçebilirsin.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setErrorText(`${file.name}: Dosya 5MB'tan küçük olmalı.`);
        return;
      }
    }
    setMenuFiles((prev) => [...prev, ...files]);
    setMessage(`✅ ${files.length} fotoğraf seçildi.`);
  }

  function handleMenuImageRemove(index: number) {
    const url = menuImages[index];
    if (url) setRemovedMenuUrls((prev) => [...prev, url]);
    setMenuImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function applyCrop() {
    if (!cropImage || !cropArea) return;
    try {
      const blob = await getCroppedImg(cropImage, cropArea);
      if (!blob) { setErrorText("❌ Görsel kırpma hatası."); return; }

      const file = new File([blob], "cropped.jpg", { type: "image/jpeg" });
      const preview = URL.createObjectURL(file);

      if (cropType === "story") {
        setStoryFile(file);
        setStoryPreview(preview);
      }
      if (cropType === "hero") {
        setHeroImageFile(file);
        setHeroImagePreview(preview);
      }

      setCropImage(null);
      setCropType(null);
      setMessage("✅ Görsel kırpıldı. Kaydet butonuna basınca yüklenir.");
    } catch (err) {
      console.error("Crop error:", err);
      setErrorText("❌ Görsel kırpma sırasında hata oluştu.");
    }
  }

  async function handleSave() {
    if (!form.cafeId) { setErrorText("Kafe ID bulunamadı."); return; }
    if (!form.cafeName.trim()) { setErrorText("Kafe adı boş bırakılamaz."); return; }

    setMessage("");
    setErrorText("");
    setSaving(true);

    try {
      let nextLogoUrl = form.logoUrl;
      let nextStoryUrl = storyUrl;
      let nextHeroImageUrl = heroImageUrl;
      let nextMenuImages = [...menuImages];

      // Logo yükleme
      if (logoFile) {
        setLogoUploading(true);
        try {
          const ext = logoFile.name.split(".").pop()?.toLowerCase() || "png";
          const storageRef = ref(storage, `cafes/${form.cafeId}/logo_${Date.now()}.${ext}`);
          await uploadBytes(storageRef, logoFile, { contentType: logoFile.type });
          nextLogoUrl = await getDownloadURL(storageRef);
        } finally {
          setLogoUploading(false);
        }
      }

      // Story yükleme
      if (storyFile) {
        if (storyUploadedAt && isUploadedToday(storyUploadedAt)) {
          setSaving(false);
          setErrorText("❌ Bugün zaten bir story yüklediniz. Yeni story yarın yükleyebilirsiniz.");
          return;
        }
        setStoryUploading(true);
        try {
          const ext = storyFile.name.split(".").pop()?.toLowerCase() || "jpg";
          const storageRef = ref(storage, `stories/${form.cafeId}/${Date.now()}.${ext}`);
          await uploadBytes(storageRef, storyFile, { contentType: storyFile.type });
          const url = await getDownloadURL(storageRef);

          if (storyId) {
            await deleteDoc(doc(db, "stories", storyId)).catch(() => {});
          }

          const now = Timestamp.now();
          const storyDocRef = await addDoc(collection(db, "stories"), {
            cafeId: form.cafeId,
            cafeName: form.cafeName,
            logoUrl: nextLogoUrl,
            storyUrl: url,
            uploadedAt: now,
          });

          await updateDoc(doc(db, "cafes", form.cafeId), {
            lastStoryUploadedAt: now,
          });

          nextStoryUrl = url;
          setStoryId(storyDocRef.id);
          setStoryUploadedAt(now);
        } finally {
          setStoryUploading(false);
        }
      }

      // Hero Image yükleme
      if (heroImageFile) {
        setHeroImageUploading(true);
        try {
          const ext = heroImageFile.name.split(".").pop()?.toLowerCase() || "jpg";
          const storageRef = ref(storage, `cafes/${form.cafeId}/hero_image_${Date.now()}.${ext}`);
          await uploadBytes(storageRef, heroImageFile, { contentType: heroImageFile.type });
          nextHeroImageUrl = await getDownloadURL(storageRef);
        } finally {
          setHeroImageUploading(false);
        }
      }

      // Silinen menü görsellerini Storage'dan temizle
      for (const url of removedMenuUrls) {
        await deleteObject(ref(storage, url)).catch(() => {});
      }

      // Menü görseli yükleme
      if (menuFiles.length > 0) {
        setMenuUploading(true);
        try {
          for (const file of menuFiles) {
            const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
            const storageRef = ref(
              storage,
              `cafes/${form.cafeId}/menu_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.${ext}`
            );
            await uploadBytes(storageRef, file, { contentType: file.type });
            nextMenuImages.push(await getDownloadURL(storageRef));
          }
        } finally {
          setMenuUploading(false);
        }
      }

      // Konum GeoPoint'e çevir
      let geoPoint = null;
      if (form.location.trim()) {
        try {
          const parts = form.location.trim().split(",");
          if (parts.length === 2) {
            const lat = parseFloat(parts[0].trim());
            const lng = parseFloat(parts[1].trim());
            if (!isNaN(lat) && !isNaN(lng)) geoPoint = new GeoPoint(lat, lng);
          }
        } catch (e) {
          console.warn("Location parse hatası:", e);
        }
      }

      await updateDoc(doc(db, "cafes", form.cafeId), {
        name: form.cafeName.trim(),
        category: form.category.trim(),
        address: form.address.trim(),
        location: geoPoint,
        locationText: form.location.trim(),
        isActive: form.isOpen,
        isVisible: form.isVisible,
        logoUrl: nextLogoUrl,
        heroImage: nextHeroImageUrl,
        menuImages: nextMenuImages,
        features: features,
        cards: cards,
        workingHours: workingHours,
        instagramUrl: form.instagramUrl.trim(),
        menuUrl: form.menuUrl.trim(),
        updatedAt: serverTimestamp(),
      });

      if (chainId) {
        await updateDoc(doc(db, "chains", chainId), {
          logoUrl: nextLogoUrl,
          category: form.category.trim(),
        });
      }

      const updated: BusinessForm = {
        ...form,
        cafeName: form.cafeName.trim(),
        category: form.category.trim(),
        address: form.address.trim(),
        location: form.location.trim(),
        logoUrl: nextLogoUrl,
      };

      setForm(updated);
      setSavedForm(updated);
      setLogoPreview(nextLogoUrl);
      setLogoFile(null);

      setStoryUrl(nextStoryUrl);
      setStoryPreview(nextStoryUrl);
      setStoryFile(null);
      setStoryExpired(false);

      setHeroImageUrl(nextHeroImageUrl);
      setHeroImagePreview(nextHeroImageUrl);
      setHeroImageFile(null);

      setMenuImages(nextMenuImages);
      setMenuFiles([]);
      setRemovedMenuUrls([]);

      setSavedFeaturesState(features);
      setSavedCardsState(cards);
      setSavedWorkingHours(JSON.parse(JSON.stringify(workingHours)));

      setMessage("✅ Tüm değişiklikler başarıyla kaydedildi.");
    } catch (err) {
      console.error("BusinessTab save error:", err);
      setErrorText("❌ Kaydetme sırasında hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-600">Mağaza bilgileri yükleniyor...</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (errorText && !form.cafeId) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="rounded-3xl border border-red-200 bg-white px-6 py-5 shadow-sm">
          <p className="text-sm font-semibold text-red-600">{errorText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Circular Crop Modal */}
      {showCircularCrop && (
        <CircularCropTool
          src={circularCropImage}
          onCropComplete={handleCircularCropComplete}
          onCancel={() => {
            setShowCircularCrop(false);
            setCircularCropImage("");
          }}
        />
      )}

      {/* Mesaj bantları */}
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">

        {/* ── Sol kolon ── */}
        <section className="space-y-6">

          {/* Profil bilgileri */}
          <section className={`${shellCardClass()} overflow-hidden`}>
            <SectionTitle
              eyebrow="İşletme Bilgileri"
              title="Profil ve görünür alanlar"
              description="Uygulamada kullanıcılara gösterilen mağaza bilgileri."
            />
            <div className="space-y-5 p-6">

              {/* Logo */}
              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
                <p className="mb-1 text-sm font-semibold text-slate-900">🎨 Mağaza Logosu (Yuvarlak)</p>
                <p className="mb-4 text-xs text-slate-500">PNG veya JPG formatında. Otomatik olarak yuvarlak şekilde kırpılır.</p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-emerald-500 bg-white shadow-sm">
                    {logoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoPreview} alt="Logo" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-medium text-slate-400">Logo yok</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-emerald-600 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-emerald-700"
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      {logoFile
                        ? `Seçilen: ${logoFile.name} — Kaydet butonuna bas.`
                        : "Resim seç → Modal açılır → Kırp → Kaydet!"}
                    </p>
                    {logoUploading && (
                      <div className="mt-2 flex items-center gap-2 text-xs font-medium text-emerald-700">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                        Logo yükleniyor...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Story */}
              <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-5">
                <p className="mb-1 text-sm font-semibold text-slate-900">📱 Mağaza Story&apos;si</p>
                <p className="mb-4 text-xs text-slate-500">PNG veya JPG. 24 saat sonra otomatik silinir. Günlük 1 story yükleyebilirsiniz.</p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm">
                    {storyPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={storyPreview} alt="Story" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-medium text-slate-400">Story yok</span>
                    )}
                  </div>
                  <div className="flex-1">
                    {storyUrl && storyExpired ? (
                      <div className="space-y-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-xs font-semibold text-slate-600">⏰ Story süresi dolmuş — sil ve yenisini yükle</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleStoryRemove}
                          disabled={storyUploading || saving}
                          className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          🗑️ Eski Story&apos;yi Sil
                        </button>
                      </div>
                    ) : storyUrl && !storyExpired ? (
                      <div className="space-y-2">
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                          <p className="text-xs font-semibold text-emerald-700">✓ Story aktif (24 saat içinde otomatik silinecek)</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleStoryRemove}
                          disabled={storyUploading || saving}
                          className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          🗑️ Story&apos;yi Sil
                        </button>
                      </div>
                    ) : isUploadedToday(storyUploadedAt) ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className="text-xs font-semibold text-amber-700">
                          ⏳ Bugün zaten bir story yüklediniz. Yarın yeni story ekleyebilirsiniz.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleStoryChange}
                          className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-amber-600 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-amber-700"
                        />
                        <p className="mt-2 text-xs text-slate-500">
                          {storyFile
                            ? `Seçilen: ${storyFile.name} — Kaydet butonuna bas.`
                            : "Story seçin, kaydet butonuna basınca yüklenir."}
                        </p>
                        {storyUploading && (
                          <div className="mt-2 flex items-center gap-2 text-xs font-medium text-amber-700">
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                            Story yükleniyor...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Hero Image */}
              <div className="rounded-3xl border border-cyan-200 bg-cyan-50/80 p-5">
                <p className="mb-1 text-sm font-semibold text-slate-900">🖼️ Detay Sayfası Görseli (Hero Image)</p>
                <p className="mb-4 text-xs text-slate-500">PNG veya JPG. Önerilen: 1080×720 px (3:2). Konu tam ortada olmalı — kenarlar kırpılır. Mağaza detay sayfasının üst kısmında gösterilir.</p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-cyan-200 bg-white shadow-sm">
                    {heroImagePreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={heroImagePreview} alt="Hero" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-medium text-slate-400">Görsel yok</span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    {heroImageUrl && (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                        <p className="text-xs font-semibold text-emerald-700">✓ Hero Image yüklendi</p>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleHeroImageChange}
                      className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-cyan-600 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-cyan-700"
                    />
                    <p className="text-xs text-slate-500">
                      {heroImageFile
                        ? `Seçilen: ${heroImageFile.name} — Kaydet butonuna bas.`
                        : heroImageUrl
                        ? "Yeni görsel seçerek değiştirebilirsiniz."
                        : "Görsel seçin, kaydet butonuna basınca yüklenir."}
                    </p>
                    {heroImageUrl && (
                      <button
                        type="button"
                        onClick={handleHeroImageRemove}
                        disabled={heroImageUploading || saving}
                        className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        🗑️ Görseli Sil
                      </button>
                    )}
                    {heroImageUploading && (
                      <div className="flex items-center gap-2 text-xs font-medium text-cyan-700">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
                        Hero Image yükleniyor...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Menü */}
              <div className="rounded-3xl border border-purple-200 bg-purple-50/80 p-5">
                <p className="mb-1 text-sm font-semibold text-slate-900">📋 Menü</p>
                <p className="mb-4 text-xs text-slate-500">
                  Menü linki girilirse uygulama direkt o linke yönlendirir. Link yoksa aşağıdaki fotoğraflar gösterilir (maks. 5).
                </p>

                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Menü Linki (opsiyonel)</label>
                  <input
                    value={form.menuUrl}
                    onChange={(e) => update("menuUrl", e.target.value)}
                    placeholder="https://example.com/menu"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                  />
                  {form.menuUrl && (
                    <div className="mt-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-medium text-purple-700">
                      ✓ Link ayarlı — uygulama menü butonunda bu linke yönlendirir
                    </div>
                  )}
                </div>

                {!form.menuUrl && (
                  <div className="space-y-4">
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleMenuChange}
                        disabled={menuImages.length + menuFiles.length >= 5}
                        className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-purple-600 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-purple-700 disabled:opacity-50"
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        {menuFiles.length > 0
                          ? `${menuFiles.length} fotoğraf seçildi (${menuImages.length} zaten yüklü)`
                          : `Fotoğraf seç → Kaydet'e bas (${menuImages.length}/5 yüklü)`}
                      </p>
                      {menuUploading && (
                        <div className="mt-2 flex items-center gap-2 text-xs font-medium text-purple-700">
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
                          Menü fotoğrafları yükleniyor...
                        </div>
                      )}
                    </div>

                    {menuImages.length > 0 && (
                      <div className="grid grid-cols-4 gap-3">
                        {menuImages.map((url, index) => (
                          <div key={index} className="relative">
                            <div className="aspect-square overflow-hidden rounded-xl border border-purple-200 bg-purple-100">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={`Menu ${index + 1}`} className="h-full w-full object-cover" />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleMenuImageRemove(index)}
                              disabled={saving}
                              className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold transition hover:bg-red-600 disabled:opacity-50"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Form alanları */}
              <div className="grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-xs font-semibold text-slate-600">Mağaza Adı</label>
                  <input
                    value={form.cafeName}
                    onChange={(e) => update("cafeName", e.target.value)}
                    className={inputClass()}
                    placeholder="Örn. Rome Coffee"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-600">Kategori</label>
                  <select
                    value={form.category}
                    onChange={(e) => update("category", e.target.value)}
                    className={inputClass()}
                  >
                    <option value="">— Kategori seç —</option>
                    {categoryList.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-600">Instagram</label>
                  <input
                    value={form.instagramUrl}
                    onChange={(e) => update("instagramUrl", e.target.value)}
                    className={inputClass()}
                    placeholder="https://instagram.com/kafeniz"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-xs font-semibold text-slate-600">Açık Adres</label>
                  <input
                    value={form.address}
                    onChange={(e) => update("address", e.target.value)}
                    className={inputClass()}
                    placeholder="Mahalle, Sokak, No..."
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-xs font-semibold text-slate-600">Konum (koordinat)</label>
                  <input
                    value={form.location}
                    onChange={(e) => update("location", e.target.value)}
                    className={inputClass()}
                    placeholder="Örn. 39.7837, 30.5119"
                  />
                  <p className="mt-1.5 text-xs text-slate-400">
                    Format: <span className="font-mono">enlem, boylam</span> — Google Maps&apos;te sağ tıklayarak koordinatları kopyalayabilirsiniz.
                  </p>
                </div>

              </div>
            </div>
          </section>

          {/* Özellikler */}
          <section className={`${shellCardClass()} overflow-hidden`}>
            <SectionTitle
              eyebrow="Özellikler"
              title="Mağaza özellikleri"
              description="Uygulamada ikon olarak gösterilir."
            />
            <div className="p-6 grid grid-cols-2 gap-3">
              {FEATURE_LIST.map((f) => {
                const active = features.includes(f.key);
                return (
                  <div
                    key={f.key}
                    onClick={() => toggleFeature(f.key)}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all border-2 ${
                      active ? "bg-emerald-100 border-emerald-300" : "bg-gray-50 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{f.icon}</span>
                      <span className="font-semibold text-sm">{f.label}</span>
                    </div>
                    <div className={`w-10 h-6 rounded-full p-1 transition-all ${active ? "bg-emerald-500" : "bg-gray-300"}`}>
                      <div className={`w-4 h-4 bg-white rounded-full transition-all ${active ? "translate-x-4" : ""}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Yemek Kartları */}
          <section className={`${shellCardClass()} overflow-hidden`}>
            <SectionTitle
              eyebrow="Ödeme Yöntemleri"
              title="Kabul edilen ödemeler"
              description="Uygulamada gösterilir."
            />
            <div className="p-6 grid grid-cols-2 gap-3">
              {CARD_LIST.map((c) => {
                const active = cards.includes(c.key);
                return (
                  <div
                    key={c.key}
                    onClick={() => toggleCard(c.key)}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all border-2 ${
                      active ? "bg-emerald-100 border-emerald-300" : "bg-gray-50 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <span className="font-semibold text-sm">{c.label}</span>
                    <div className={`w-10 h-6 rounded-full p-1 transition-all ${active ? "bg-emerald-500" : "bg-gray-300"}`}>
                      <div className={`w-4 h-4 bg-white rounded-full transition-all ${active ? "translate-x-4" : ""}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Çalışma Saatleri */}
          <section className={`${shellCardClass()} overflow-hidden`}>
            <SectionTitle
              eyebrow="Çalışma Saatleri"
              title="Günlük çalışma programı"
              description="Her gün için açık/kapalı durumu ve saat aralığını belirleyin."
            />
            <div className="p-6 space-y-3">
              {DAYS.map(({ key, label }) => {
                const day = workingHours[key];
                return (
                  <div
                    key={key}
                    className={`rounded-2xl border p-4 transition-all ${
                      day.isOpen ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <Toggle
                          checked={day.isOpen}
                          onChange={() =>
                            setWorkingHours((prev) => ({
                              ...prev,
                              [key]: { ...prev[key], isOpen: !prev[key].isOpen },
                            }))
                          }
                        />
                        <span className={`text-sm font-semibold ${day.isOpen ? "text-slate-900" : "text-slate-400"}`}>
                          {label}
                        </span>
                        {!day.isOpen && (
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-400">
                            Kapalı
                          </span>
                        )}
                      </div>
                      {day.isOpen && (
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={day.openTime}
                            onChange={(e) =>
                              setWorkingHours((prev) => ({
                                ...prev,
                                [key]: { ...prev[key], openTime: e.target.value },
                              }))
                            }
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          />
                          <span className="text-xs font-medium text-slate-400">—</span>
                          <input
                            type="time"
                            value={day.closeTime}
                            onChange={(e) =>
                              setWorkingHours((prev) => ({
                                ...prev,
                                [key]: { ...prev[key], closeTime: e.target.value },
                              }))
                            }
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Operasyon durumu */}
          <section className={`${shellCardClass()} overflow-hidden`}>
            <SectionTitle
              eyebrow="Operasyon"
              title="İşletme durumu"
              description="Aktiflik, görünürlük ve onay durumu."
            />
            <div className="space-y-4 p-6">

              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">İşletme Açık</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Kapalıyken müşteriler mağazayı aktif olarak göremez.
                  </p>
                </div>
                <Toggle
                  checked={form.isOpen}
                  onChange={() => update("isOpen", !form.isOpen)}
                />
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Uygulamada Görünür</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Gizlenirse keşfet ekranında listelenmezsiniz.
                  </p>
                </div>
                <Toggle
                  checked={form.isVisible}
                  onChange={() => update("isVisible", !form.isVisible)}
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">Onay Durumu</p>
                <div className="mt-2">
                  {form.approvalStatus === "approved" && (
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">✓ Onaylandı</span>
                  )}
                  {form.approvalStatus === "pending" && (
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">⏳ İnceleniyor</span>
                  )}
                  {form.approvalStatus === "rejected" && (
                    <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">✕ Reddedildi</span>
                  )}
                  {form.approvalStatus === "draft" && (
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Taslak</span>
                  )}
                  {!form.approvalStatus && (
                    <p className="text-xs text-slate-500">Henüz tanımlanmadı</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Kafe ID</p>
                <p className="mt-1.5 font-mono text-sm text-slate-700">{form.cafeId || "-"}</p>
              </div>
            </div>
          </section>

          {/* Kaydet butonu */}
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Değişiklikleri kaydet</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Tüm işletme bilgileri, logo, story, hero image, menü fotoğrafları, özellikler ve kartlar kaydedilir.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="inline-flex min-w-[220px] items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {logoUploading || storyUploading || heroImageUploading || menuUploading
                      ? "Dosya yükleniyor..."
                      : "Kaydediliyor..."}
                  </>
                ) : (
                  hasChanges ? "Değişiklikleri Kaydet" : "Kaydedildi ✓"
                )}
              </button>
            </div>
          </div>
        </section>

        {/* ── Sağ kolon — Önizleme ── */}
        <aside>
          <section className={`${shellCardClass()} sticky top-24 overflow-hidden`}>
            <SectionTitle
              eyebrow="Önizleme"
              title="Kullanıcı kartı"
              description="Gerçek mağaza verisine göre önizleme."
            />
            <div className="bg-slate-50 p-5">
              <div className="rounded-[32px] border border-slate-200 bg-[#EEF4F0] p-3 shadow-inner">
                <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">

                    <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-emerald-500 bg-emerald-900 text-xs font-bold uppercase tracking-[0.14em] text-white shadow-sm">
                      {logoPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoPreview} alt="Logo" className="h-full w-full object-cover" />
                      ) : (
                        "Logo"
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-lg font-bold text-slate-900">
                            {form.cafeName || "Mağaza adı"}
                          </p>
                          <p className="mt-1 truncate text-sm font-medium text-slate-400">
                            {form.category || "Kategori"}
                          </p>
                        </div>
                        <div className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500">
                          {todayHours?.isOpen
                            ? `${todayHours.openTime} - ${todayHours.closeTime}`
                            : "Bugün kapalı"}
                        </div>
                      </div>
                      <p className="mt-4 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">
                        ☕ {form.cafeName || form.category || "Mağaza bilgisi henüz girilmedi"}
                      </p>
                    </div>
                  </div>

                  <div className="my-4 h-px bg-slate-200" />

                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                      <span className={`h-2.5 w-2.5 rounded-full ${form.isOpen ? "bg-emerald-500" : "bg-slate-400"}`} />
                      {form.isOpen ? "Aktif" : "Pasif"}
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600">
                      <MapPin className="h-4 w-4" />
                      <span className="max-w-[140px] truncate">
                        {form.address || form.location || "Konum yok"}
                      </span>
                    </div>
                  </div>

                  {storyUrl && !storyExpired && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                      📱 Story aktif (24 saat içinde silinecek)
                    </div>
                  )}
                  {heroImageUrl && (
                    <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-medium text-cyan-700">
                      🖼️ Hero Image yüklendi
                    </div>
                  )}
                  {menuImages.length > 0 && (
                    <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-medium text-purple-700">
                      📋 Menü fotoğrafları ({menuImages.length})
                    </div>
                  )}
                  {features.length > 0 && (
                    <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                      ✨ Özellikler ({features.length} aktif)
                    </div>
                  )}
                  {cards.length > 0 && (
                    <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
                      💳 Kartlar ({cards.length} aktif)
                    </div>
                  )}
                  {!form.isVisible && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                      ⚠️ Mağaza şu an uygulamada gizli
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* Image Cropper Modal */}
      {cropImage && (
        <ImageCropper
          image={cropImage}
          aspect={cropType === "story" ? 9 / 16 : 1080 / 720}
          onCropComplete={(_, croppedAreaPixels) => setCropArea(croppedAreaPixels)}
          onApply={applyCrop}
          onCancel={() => {
            setCropImage(null);
            setCropType(null);
          }}
        />
      )}
    </div>
  );
}
