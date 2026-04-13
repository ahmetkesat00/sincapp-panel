"use client";

import React, { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
  GeoPoint,
  addDoc,
  deleteDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes, deleteObject } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import ImageCropper from "../ui/image-cropper";
import getCroppedImg from "@/lib/cropImage";

import SectionTitle from "../ui/section-title";
import Toggle from "../ui/toggle";
import { fieldClass, shellCardClass } from "../helpers";

// ─────────────────────────────────────────────
// Circular Crop Component
// ─────────────────────────────────────────────

interface CircularCropToolProps {
  src: string;
  onCropComplete: (croppedImageData: string) => void;
  onCancel: () => void;
}

function CircularCropTool({ src, onCropComplete, onCancel }: CircularCropToolProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const imageRef = React.useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;

    img.onload = () => {
      setOffsetX(0);
      setOffsetY(0);
      setScale(1);
    };
  }, [src]);

  function handleCrop() {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const size = 300;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw circular mask
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    // Draw scaled image
    const scaledWidth = img.width * scale;
    const scaledHeight = img.height * scale;
    const x = (size - scaledWidth) / 2 + offsetX;
    const y = (size - scaledHeight) / 2 + offsetY;

    ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

    canvas.toBlob((blob) => {
      if (blob) {
        const reader = new FileReader();
        reader.onload = (e) => {
          onCropComplete(e.target?.result as string);
        };
        reader.readAsDataURL(blob);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-bold text-slate-900">Logoyu Kırp (Yuvarlak)</h3>

        <div className="relative mb-4 flex justify-center">
          <div className="relative h-80 w-80 overflow-hidden rounded-full border-4 border-emerald-500 bg-slate-100">
            <img
              ref={imageRef}
              src={src}
              alt="Logo"
              className="h-full w-full object-cover"
              style={{
                transform: `scale(${scale}) translate(${offsetX}px, ${offsetY}px)`,
                transformOrigin: "center",
              }}
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm font-semibold text-slate-700">Zoom</label>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="w-full"
          />
          <p className="mt-1 text-xs text-slate-500">{scale.toFixed(1)}x</p>
        </div>

        <div className="mb-4 flex gap-2">
          <div className="flex-1">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Sağ/Sol</label>
            <input
              type="range"
              min="-100"
              max="100"
              step="5"
              value={offsetX}
              onChange={(e) => setOffsetX(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Yukarı/Aşağı</label>
            <input
              type="range"
              min="-100"
              max="100"
              step="5"
              value={offsetY}
              onChange={(e) => setOffsetY(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 font-semibold text-slate-900 transition hover:bg-slate-200"
          >
            İptal
          </button>
          <button
            onClick={handleCrop}
            className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-600"
          >
            Onayla ✓
          </button>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type BusinessForm = {
  cafeId: string;
  cafeName: string;
  category: string;
  phone: string;
  address: string;
  location: string;
  openTime: string;
  closeTime: string;
  logoUrl: string;
  description: string;
  isOpen: boolean;
  isVisible: boolean;
  approvalStatus: string;
};

const emptyForm: BusinessForm = {
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
};

// ✅ Features list
const FEATURE_LIST = [
  { key: "wifi", label: "WiFi", icon: "📶" },
  { key: "garden", label: "Bahçe", icon: "🌳" },
  { key: "vegan", label: "Vegan", icon: "🌱" },
  { key: "work", label: "Çalışma", icon: "💻" },
  { key: "meeting", label: "Toplantı", icon: "👥" },
  { key: "parking", label: "Otopark", icon: "🅿️" },
];

// ✅ Cards list (payment cards)
const CARD_LIST = [
  { key: "edenred", label: "Edenred" },
  { key: "multinet", label: "Multinet" },
  { key: "pluxee", label: "Pluxee" },
  { key: "setcard", label: "Setcard" },
  { key: "metropol", label: "MetropolCard" },
];

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
  
  const now = Date.now();
  const expiredMs = 24 * 60 * 60 * 1000;
  
  return now - uploadTime > expiredMs;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function BusinessTab() {
  const [form, setForm] = useState<BusinessForm>(emptyForm);
  const [savedForm, setSavedForm] = useState<BusinessForm>(emptyForm);
  const [loading, setLoading] = useState(true);
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

  // ✅ Features State
  const [features, setFeatures] = useState<string[]>([]);
  const [savedFeaturesState, setSavedFeaturesState] = useState<string[]>([]);

  // ✅ Cards State
  const [cards, setCards] = useState<string[]>([]);
  const [savedCardsState, setSavedCardsState] = useState<string[]>([]);
  
  // Crop State
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [cropArea, setCropArea] = useState<any>(null);
  const [cropType, setCropType] = useState<"logo" | "story" | "hero" | null>(null);
  
  // Circular Crop State
  const [showCircularCrop, setShowCircularCrop] = useState(false);
  const [circularCropImage, setCircularCropImage] = useState("");
  
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");

  // ✅ Features değişip değişmediğini kontrol et
  const featuresChanged = JSON.stringify(features) !== JSON.stringify(savedFeaturesState);

  // ✅ Cards değişip değişmediğini kontrol et
  const cardsChanged = JSON.stringify(cards) !== JSON.stringify(savedCardsState);

  // Değişiklik var mı?
  const hasChanges =
    logoFile !== null ||
    storyFile !== null ||
    heroImageFile !== null ||
    menuFiles.length > 0 ||
    JSON.stringify(form) !== JSON.stringify(savedForm) ||
    featuresChanged ||
    cardsChanged;

  // ── Firestore'dan veri çek ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }

      try {
        const cafeQuery = query(
          collection(db, "cafes"),
          where("ownerUid", "==", user.uid)
        );
        const cafeSnap = await getDocs(cafeQuery);

        if (cafeSnap.empty) {
          setErrorText("Bu kullanıcıya ait kafe bulunamadı.");
          setLoading(false);
          return;
        }

        const cafeDoc = cafeSnap.docs[0];
        const d = cafeDoc.data();

        const loaded: BusinessForm = {
          cafeId: cafeDoc.id,
          cafeName: String(d?.name ?? ""),
          category: String(d?.category ?? ""),
          phone: String(d?.phone ?? ""),
          address: String(d?.address ?? ""),
          location: formatLocationValue(d?.location ?? d?.locationText ?? ""),
          openTime: String(d?.openTime ?? ""),
          closeTime: String(d?.closeTime ?? ""),
          logoUrl: String(d?.logoUrl ?? d?.logoValue ?? ""),
          description: String(d?.description ?? ""),
          isOpen: Boolean(d?.isActive ?? d?.isOpen ?? false),
          isVisible: Boolean(d?.isVisible ?? false),
          approvalStatus: String(d?.approvalStatus ?? ""),
        };

        setForm(loaded);
        setSavedForm(loaded);
        setLogoPreview(loaded.logoUrl);

        // Story verilerini "stories" koleksiyonundan çek
        try {
          const storyQuery = query(
            collection(db, "stories"),
            where("cafeId", "==", cafeDoc.id)
          );
          const storySnap = await getDocs(storyQuery);

          if (!storySnap.empty) {
            const storyDoc = storySnap.docs[0];
            const storyData = storyDoc.data();
            
            const loadedStoryUrl = String(storyData?.storyUrl ?? "");
            const loadedStoryUploadedAt = storyData?.uploadedAt ?? null;
            
            setStoryId(storyDoc.id);
            setStoryUrl(loadedStoryUrl);
            setStoryUploadedAt(loadedStoryUploadedAt);
            setStoryPreview(loadedStoryUrl);
            
            if (loadedStoryUrl && isStoryExpired(loadedStoryUploadedAt)) {
              setStoryExpired(true);
            }
          }
        } catch (err) {
          console.error("Story fetch error:", err);
        }

        // Hero Image verilerini yükle
        const loadedHeroImageUrl = String(d?.heroImage ?? "");
        setHeroImageUrl(loadedHeroImageUrl);
        setHeroImagePreview(loadedHeroImageUrl);

        // Menu Images verilerini yükle
        const loadedMenuImages = Array.isArray(d?.menuImages)
          ? d.menuImages
          : [];
        
        setMenuImages(loadedMenuImages);

        // ✅ Features verilerini yükle
        const loadedFeatures = Array.isArray(d?.features)
          ? d.features
          : [];
        
        setFeatures(loadedFeatures);
        setSavedFeaturesState(loadedFeatures);

        // ✅ Cards verilerini yükle
        const loadedCards = Array.isArray(d?.cards)
          ? d.cards
          : [];
        
        setCards(loadedCards);
        setSavedCardsState(loadedCards);
      } catch (err) {
        console.error("BusinessTab load error:", err);
        setErrorText("Veriler yüklenirken hata oluştu.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

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

  // ✅ Feature toggle
  const toggleFeature = (key: string) => {
    setFeatures((prev) =>
      prev.includes(key)
        ? prev.filter((f) => f !== key)
        : [...prev, key]
    );
  };

  // ✅ Card toggle
  const toggleCard = (key: string) => {
    setCards((prev) =>
      prev.includes(key)
        ? prev.filter((c) => c !== key)
        : [...prev, key]
    );
  };

  // Circular Crop Complete Handler
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
      .catch((err) => {
        console.error("Crop error:", err);
        setErrorText("❌ Logo kırpma hatası.");
      });
  }

  // Logo change handler
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
    
    const url = URL.createObjectURL(file);
    setCropImage(url);
    setCropType("story");
    setMessage("");
    setErrorText("");
  }

  async function handleStoryRemove() {
    if (!storyUrl || !form.cafeId || !storyId) return;

    setMessage("");
    setErrorText("");

    try {
      // Storage'dan sil
      const storageRef = ref(storage, storyUrl);
      await deleteObject(storageRef).catch(() => {});

      // Firestore'dan sil (stories koleksiyonundan)
      await deleteDoc(doc(db, "stories", storyId));

      setStoryUrl("");
      setStoryUploadedAt(null);
      setStoryPreview("");
      setStoryFile(null);
      setStoryId(null);
      setStoryExpired(false);
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
    
    const url = URL.createObjectURL(file);
    setCropImage(url);
    setCropType("hero");
    setMessage("");
    setErrorText("");
  }

  async function handleHeroImageRemove() {
    if (!heroImageUrl || !form.cafeId) return;

    setMessage("");
    setErrorText("");

    try {
      const storageRef = ref(storage, heroImageUrl);
      await deleteObject(storageRef).catch(() => {});

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

  // Menu images handler
  function handleMenuChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);

    if (files.length === 0) return;

    // Max 8 fotoğraf
    if (menuImages.length + menuFiles.length + files.length > 8) {
      setErrorText("En fazla 8 menü fotoğrafı yükleyebilirsin.");
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

  // Menu images remove handler
  function handleMenuImageRemove(index: number) {
    setMenuImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function applyCrop() {
    if (!cropImage || !cropArea) return;

    try {
      const blob = await getCroppedImg(cropImage, cropArea);

      if (!blob) {
        setErrorText("❌ Görsel kırpma hatası.");
        return;
      }

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
          const storageRef = ref(
            storage,
            `cafes/${form.cafeId}/logo_${Date.now()}.${ext}`
          );
          await uploadBytes(storageRef, logoFile, { contentType: logoFile.type });
          nextLogoUrl = await getDownloadURL(storageRef);
        } finally {
          setLogoUploading(false);
        }
      }

      // 🔥 Story yükleme - STORIES KOLEKSİYONUNA YAZ
      if (storyFile) {
        setStoryUploading(true);
        try {
          const ext = storyFile.name.split(".").pop()?.toLowerCase() || "jpg";
          const storageRef = ref(
            storage,
            `stories/${form.cafeId}/${Date.now()}.${ext}`
          );

          await uploadBytes(storageRef, storyFile, {
            contentType: storyFile.type,
          });

          const url = await getDownloadURL(storageRef);

          // Eski story varsa sil
          if (storyId) {
            try {
              await deleteDoc(doc(db, "stories", storyId));
            } catch (err) {
              console.error("Old story delete error:", err);
            }
          }

          // Yeni story'yi "stories" koleksiyonuna ekle
          const storyDocRef = await addDoc(collection(db, "stories"), {
            cafeId: form.cafeId,
            cafeName: form.cafeName,
            logoUrl: nextLogoUrl,
            storyUrl: url,
            uploadedAt: Timestamp.now(),
          });

          nextStoryUrl = url;
          setStoryId(storyDocRef.id);
        } finally {
          setStoryUploading(false);
        }
      }

      // Hero Image yükleme
      if (heroImageFile) {
        setHeroImageUploading(true);
        try {
          const ext = heroImageFile.name.split(".").pop()?.toLowerCase() || "jpg";
          const storageRef = ref(
            storage,
            `cafes/${form.cafeId}/hero_image_${Date.now()}.${ext}`
          );
          await uploadBytes(storageRef, heroImageFile, { contentType: heroImageFile.type });
          nextHeroImageUrl = await getDownloadURL(storageRef);
        } finally {
          setHeroImageUploading(false);
        }
      }

      // Menu images yükleme
      if (menuFiles.length > 0) {
        setMenuUploading(true);
        try {
          for (const file of menuFiles) {
            const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
            const storageRef = ref(
              storage,
              `cafes/${form.cafeId}/menu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`
            );

            await uploadBytes(storageRef, file, { contentType: file.type });
            const url = await getDownloadURL(storageRef);

            nextMenuImages.push(url);
          }
        } finally {
          setMenuUploading(false);
        }
      }

      // Location string'ini GeoPoint'e çevir
      let geoPoint = null;
      if (form.location.trim()) {
        try {
          const parts = form.location.trim().split(',');
          if (parts.length === 2) {
            const lat = parseFloat(parts[0].trim());
            const lng = parseFloat(parts[1].trim());
            if (!isNaN(lat) && !isNaN(lng)) {
              geoPoint = new GeoPoint(lat, lng);
            }
          }
        } catch (e) {
          console.warn('Location parse hatası:', e);
        }
      }

      // CAFES koleksiyonunu güncelle (story HARICINDE)
      await updateDoc(doc(db, "cafes", form.cafeId), {
        name: form.cafeName.trim(),
        category: form.category.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        location: geoPoint,
        locationText: form.location.trim(),
        openTime: form.openTime,
        closeTime: form.closeTime,
        description: form.description.trim(),
        isActive: form.isOpen,
        isVisible: form.isVisible,
        logoUrl: nextLogoUrl,
        logoValue: nextLogoUrl,
        logoType: nextLogoUrl ? "network" : "",
        heroImage: nextHeroImageUrl,
        menuImages: nextMenuImages,
        features: features,
        cards: cards,
        updatedAt: serverTimestamp(),
      });

      const updated: BusinessForm = {
        ...form,
        cafeName: form.cafeName.trim(),
        category: form.category.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        location: form.location.trim(),
        description: form.description.trim(),
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
      
      setSavedFeaturesState(features);
      setSavedCardsState(cards);
      
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
          <p className="text-sm font-medium text-slate-600">Kafe bilgileri yükleniyor...</p>
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

  const previewText =
    form.cafeName ||
    form.category ||
    "Kafe bilgisi henüz girilmedi";

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
              description="Uygulamada kullanıcılara gösterilen kafe bilgileri."
            />
            <div className="space-y-5 p-6">

              {/* Logo */}
              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
                <p className="mb-1 text-sm font-semibold text-slate-900">🎨 Kafe Logosu (Yuvarlak)</p>
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
                <p className="mb-1 text-sm font-semibold text-slate-900">📱 Kafe Story'si (Instagram Mantığı)</p>
                <p className="mb-4 text-xs text-slate-500">PNG veya JPG formatında. 24 saat sonra otomatik silinir.</p>
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
                    {storyUrl && !storyExpired ? (
                      <div className="space-y-2">
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                          <p className="text-xs font-semibold text-emerald-700">
                            ✓ Story aktif (24 saat içinde otomatik silinecek)
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleStoryRemove}
                          disabled={storyUploading || saving}
                          className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          🗑️ Story'yi Sil
                        </button>
                      </div>
                    ) : storyUrl && storyExpired ? (
                      <div className="space-y-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-xs font-semibold text-slate-600">
                            ⏰ Story süresi dolmuş (sil ve yenisini yükle)
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleStoryRemove}
                          disabled={storyUploading || saving}
                          className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          🗑️ Eski Story'yi Sil
                        </button>
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
                <p className="mb-1 text-sm font-semibold text-slate-900">🖼️ Kafe Detay Sayfası Görseli (Hero Image)</p>
                <p className="mb-4 text-xs text-slate-500">PNG veya JPG formatında. Detay sayfasının üst kısmında gösterilir. Kalıcıdır.</p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-cyan-200 bg-white shadow-sm">
                    {heroImagePreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={heroImagePreview} alt="Hero" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-medium text-slate-400">Görsel yok</span>
                    )}
                  </div>
                  <div className="flex-1">
                    {heroImageUrl ? (
                      <div className="space-y-2">
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                          <p className="text-xs font-semibold text-emerald-700">
                            ✓ Hero Image yüklendi
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleHeroImageRemove}
                          disabled={heroImageUploading || saving}
                          className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          🗑️ Görseli Sil
                        </button>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleHeroImageChange}
                          className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-cyan-600 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-cyan-700"
                        />
                        <p className="mt-2 text-xs text-slate-500">
                          {heroImageFile
                            ? `Seçilen: ${heroImageFile.name} — Kaydet butonuna bas.`
                            : "Görsel seçin, kaydet butonuna basınca yüklenir."}
                        </p>
                        {heroImageUploading && (
                          <div className="mt-2 flex items-center gap-2 text-xs font-medium text-cyan-700">
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
                            Hero Image yükleniyor...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Menu Images */}
              <div className="rounded-3xl border border-purple-200 bg-purple-50/80 p-5">
                <p className="mb-1 text-sm font-semibold text-slate-900">📋 Menü Fotoğrafları</p>
                <p className="mb-4 text-xs text-slate-500">Maksimum 8 fotoğraf. Kullanıcılar menüye tıklayınca görecek.</p>
                <div className="space-y-4">
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleMenuChange}
                      disabled={menuImages.length + menuFiles.length >= 8}
                      className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-purple-600 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-purple-700 disabled:opacity-50"
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      {menuFiles.length > 0
                        ? `${menuFiles.length} fotoğraf seçildi (${menuImages.length} zaten yüklü)`
                        : `Fotoğraf seç → Kaydet'e bas (${menuImages.length}/8 yüklü)`}
                    </p>
                    {menuUploading && (
                      <div className="mt-2 flex items-center gap-2 text-xs font-medium text-purple-700">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
                        Menü fotoğrafları yükleniyor...
                      </div>
                    )}
                  </div>

                  {/* Yüklü fotoğraflar */}
                  {menuImages.length > 0 && (
                    <div className="grid grid-cols-4 gap-3">
                      {menuImages.map((url, index) => (
                        <div key={index} className="relative group">
                          <div className="aspect-square overflow-hidden rounded-xl border border-purple-200 bg-purple-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`Menu ${index + 1}`}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleMenuImageRemove(index)}
                            disabled={saving}
                            className="absolute -top-2 -right-2 hidden group-hover:flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold transition hover:bg-red-600"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Kafe adı, kategori, etc... */}
              <div className="grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-xs font-semibold text-slate-600">Kafe Adı</label>
                  <input
                    value={form.cafeName}
                    onChange={(e) => update("cafeName", e.target.value)}
                    className={inputClass()}
                    placeholder="Örn. Rome Coffee"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-600">Kategori</label>
                  <input
                    value={form.category}
                    onChange={(e) => update("category", e.target.value)}
                    className={inputClass()}
                    placeholder="Örn. Kahve & İçecek"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-600">Telefon</label>
                  <input
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    className={inputClass()}
                    placeholder="Örn. 0555 123 45 67"
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
                    Format: <span className="font-mono">enlem, boylam</span>
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-600">Açılış Saati</label>
                  <input
                    type="time"
                    value={form.openTime}
                    onChange={(e) => update("openTime", e.target.value)}
                    className={inputClass()}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-600">Kapanış Saati</label>
                  <input
                    type="time"
                    value={form.closeTime}
                    onChange={(e) => update("closeTime", e.target.value)}
                    className={inputClass()}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-xs font-semibold text-slate-600">Açıklama</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                    className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    placeholder="Kısa işletme açıklaması"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ✅ Features Section */}
          <section className={`${shellCardClass()} overflow-hidden`}>
            <SectionTitle
              eyebrow="Özellikler"
              title="Kafe özellikleri"
              description="Uygulamada ikon olarak gösterilir"
            />
            <div className="p-6 grid grid-cols-2 gap-3">
              {FEATURE_LIST.map((f) => {
                const active = features.includes(f.key);

                return (
                  <div
                    key={f.key}
                    onClick={() => toggleFeature(f.key)}
                    className={`
                      flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer
                      transition-all border-2
                      ${active 
                        ? "bg-emerald-100 border-emerald-300" 
                        : "bg-gray-50 border-gray-200 hover:border-gray-300"}
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{f.icon}</span>
                      <span className="font-semibold text-sm">{f.label}</span>
                    </div>

                    <div
                      className={`
                        w-10 h-6 rounded-full p-1 transition-all
                        ${active ? "bg-emerald-500" : "bg-gray-300"}
                      `}
                    >
                      <div
                        className={`
                          w-4 h-4 bg-white rounded-full transition-all
                          ${active ? "translate-x-4" : ""}
                        `}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ✅ Cards Section */}
          <section className={`${shellCardClass()} overflow-hidden`}>
            <SectionTitle
              eyebrow="Yemek Kartları"
              title="Geçerli kartlar"
              description="Uygulamada text olarak gösterilir"
            />
            <div className="p-6 grid grid-cols-2 gap-3">
              {CARD_LIST.map((c) => {
                const active = cards.includes(c.key);

                return (
                  <div
                    key={c.key}
                    onClick={() => toggleCard(c.key)}
                    className={`
                      flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer
                      transition-all border-2
                      ${active 
                        ? "bg-emerald-100 border-emerald-300" 
                        : "bg-gray-50 border-gray-200 hover:border-gray-300"}
                    `}
                  >
                    <span className="font-semibold text-sm">{c.label}</span>

                    <div
                      className={`
                        w-10 h-6 rounded-full p-1 transition-all
                        ${active ? "bg-emerald-500" : "bg-gray-300"}
                      `}
                    >
                      <div
                        className={`
                          w-4 h-4 bg-white rounded-full transition-all
                          ${active ? "translate-x-4" : ""}
                        `}
                      />
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

              {/* İşletme aktif toggle */}
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">İşletme aktif</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Firestore içindeki <span className="font-mono">isActive</span> alanını günceller.
                  </p>
                </div>
                <Toggle
                  checked={form.isOpen}
                  onChange={() => update("isOpen", !form.isOpen)}
                />
              </div>

              {/* Görünürlük toggle */}
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Uygulamada görünür</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Kullanıcılar işletmeni keşfet ekranında görebilir.
                  </p>
                </div>
                <Toggle
                  checked={form.isVisible}
                  onChange={() => update("isVisible", !form.isVisible)}
                />
              </div>

              {/* Onay durumu */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">Onay Durumu</p>
                <div className="mt-2">
                  {form.approvalStatus === "approved" && (
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      ✓ Onaylandı
                    </span>
                  )}
                  {form.approvalStatus === "pending" && (
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                      ⏳ İnceleniyor
                    </span>
                  )}
                  {form.approvalStatus === "rejected" && (
                    <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                      ✕ Reddedildi
                    </span>
                  )}
                  {form.approvalStatus === "draft" && (
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      Taslak
                    </span>
                  )}
                  {!form.approvalStatus && (
                    <p className="text-xs text-slate-500">Henüz tanımlanmadı</p>
                  )}
                </div>
              </div>

              {/* Kafe ID */}
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
                  Tüm işletme bilgileri, logo, story, hero image, menü fotoğrafları, özellikler ve kartlar Firestore'a işlenir.
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
                    {logoUploading || storyUploading || heroImageUploading || menuUploading ? "Dosya yükleniyor..." : "Kaydediliyor..."}
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
              description="Gerçek kafe verisine göre önizleme."
            />
            <div className="bg-slate-50 p-5">
              <div className="rounded-[32px] border border-slate-200 bg-[#EEF4F0] p-3 shadow-inner">
                <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">

                    {/* Logo */}
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
                            {form.cafeName || "Kafe adı"}
                          </p>
                          <p className="mt-1 truncate text-sm font-medium text-slate-400">
                            {form.category || "Kategori"}
                          </p>
                        </div>
                        <div className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500">
                          {form.openTime && form.closeTime
                            ? `${form.openTime} - ${form.closeTime}`
                            : "Saat yok"}
                        </div>
                      </div>
                      <p className="mt-4 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">
                        ☕ {form.cafeName || form.category || "Kafe bilgisi henüz girilmedi"}
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

                  {/* Story badge */}
                  {storyUrl && !storyExpired && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                      📱 Story aktif (24 saat içinde silinecek)
                    </div>
                  )}

                  {/* Hero Image badge */}
                  {heroImageUrl && (
                    <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-medium text-cyan-700">
                      🖼️ Hero Image yüklendi
                    </div>
                  )}

                  {/* Menu Images badge */}
                  {menuImages.length > 0 && (
                    <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-medium text-purple-700">
                      📋 Menü fotoğrafları ({menuImages.length})
                    </div>
                  )}

                  {/* ✅ Features badge */}
                  {features.length > 0 && (
                    <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                      ✨ Özellikler ({features.length} aktif)
                    </div>
                  )}

                  {/* ✅ Cards badge */}
                  {cards.length > 0 && (
                    <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
                      💳 Kartlar ({cards.length} aktif)
                    </div>
                  )}

                  {/* Görünürlük badge */}
                  {!form.isVisible && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                      ⚠️ Kafe şu an uygulamada gizli
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
          aspect={
            cropType === "story"
              ? 9 / 16
              : 16 / 9
          }
          onCropComplete={(_, croppedAreaPixels) => {
            setCropArea(croppedAreaPixels);
          }}
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