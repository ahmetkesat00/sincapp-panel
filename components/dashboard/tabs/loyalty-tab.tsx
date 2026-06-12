"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage, auth } from "@/lib/firebase";
import { httpsCallable, getFunctions } from "firebase/functions";
import { QRCodeSVG as QRCode } from "qrcode.react";
import ImageCropper from "../ui/image-cropper";
import getCroppedImg from "@/lib/cropImage";
import SectionTitle from "../ui/section-title";
import { fieldClass, shellCardClass } from "../helpers";
import type { BusinessForm, LoyaltyCard } from "../types";

const ITEM_TYPES: { value: string; label: string }[] = [
  { value: "kahve",    label: "Kahve" },
  { value: "cay",      label: "Çay" },
  { value: "tatli",    label: "Tatlı" },
  { value: "dondurma", label: "Dondurma" },
  { value: "pizza",    label: "Pizza" },
  { value: "burger",   label: "Burger" },
  { value: "firin",    label: "Fırın" },
  { value: "yemek",    label: "Yemek" },
  { value: "icecek",   label: "İçecek" },
  { value: "diger",    label: "Diğer" },
];
const MAX_CARDS = 1;

type PendingToken = {
  id: string;
  cafeId: string;
  userId: string | null;
  scannedUserId: string | null;
  status: string;
  type: string;
  createdAt: any;
  scannedAt: any;
  [key: string]: any;
};

type FormState = {
  itemTypeId: string;
  rewardBuy: number;
  programDescription: string;
  productImageFile: File | null;
  productImagePreview: string;
};

const emptyForm = (): FormState => ({
  itemTypeId: "",
  rewardBuy: 5,
  programDescription: "",
  productImageFile: null,
  productImagePreview: "",
});

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

type Props = {
  cafeId: string;
  businessForm: BusinessForm;
  chainId?: string;
};

export default function LoyaltyTab({ cafeId, businessForm, chainId }: Props) {
  // Kartlar — cafes/{cafeId}.loyaltyCards array'inden gelir
  const [cards, setCards] = useState<LoyaltyCard[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [cropArea, setCropArea] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [qrValue, setQrValue] = useState<string | null>(null);
  const [isCreatingQR, setIsCreatingQR] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [pendingTokens, setPendingTokens] = useState<PendingToken[]>([]);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const functions = getFunctions(undefined, "europe-west1");

  // ==========================================
  // Kartları dinle — zincir modunda chain dökümanından, değilse cafe'den
  // ==========================================
  useEffect(() => {
    if (chainId) {
      return onSnapshot(doc(db, "chains", chainId), (snap) => {
        const lc = snap.data()?.loyaltyCard ?? null;
        if (lc) {
          setCards([{
            id: "chain-card",
            position: 1,
            itemTypeId: lc.itemTypeId ?? "",
            rewardBuy: lc.rewardBuy ?? 0,
            rewardGift: lc.rewardGift ?? 0,
            programDescription: lc.programDescription ?? "",
            productImageUrl: lc.productImageUrl ?? "",
          }]);
        } else {
          setCards([]);
        }
      });
    }
    if (!cafeId) return;
    return onSnapshot(doc(db, "cafes", cafeId), (snap) => {
      const raw: LoyaltyCard[] = snap.data()?.loyaltyCards ?? [];
      setCards([...raw].sort((a, b) => a.position - b.position));
    });
  }, [cafeId, chainId]);

  // ==========================================
  // Pending tokens
  // ==========================================
  useEffect(() => {
    if (!cafeId) {
      setPendingTokens([]);
      return;
    }
    const q = query(
      collection(db, "qrTokens"),
      where("cafeId", "==", cafeId),
      where("status", "==", "scanned"),
      orderBy("scannedAt", "desc")
    );
    return onSnapshot(
      q,
      (snap) =>
        setPendingTokens(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as PendingToken))
        ),
      console.error
    );
  }, [cafeId]);

  // ==========================================
  // Kartları Firestore'a yaz
  // Zincir modunda: chains/{chainId}.loyaltyCard (tek obje)
  // Tek kafe modunda: cafes/{cafeId}.loyaltyCards (array)
  // ==========================================
  async function persistCards(newCards: LoyaltyCard[]) {
    if (chainId) {
      const card = newCards[0] ?? null;
      await updateDoc(doc(db, "chains", chainId), {
        loyaltyCard: card
          ? {
              itemTypeId: card.itemTypeId,
              rewardBuy: card.rewardBuy,
              rewardGift: card.rewardGift,
              programDescription: card.programDescription,
              productImageUrl: card.productImageUrl ?? "",
            }
          : null,
      });
    } else {
      await updateDoc(doc(db, "cafes", cafeId), {
        loyaltyCards: newCards,
        updatedAt: serverTimestamp(),
      });
    }
  }

  // ==========================================
  // Image crop
  // ==========================================
  function handleProductImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) {
      setMessage("❌ Görsel 10MB'tan küçük olmalı.");
      return;
    }
    setCropImage(URL.createObjectURL(file));
    setCropArea(null);
    e.target.value = "";
  }

  async function applyCrop() {
    if (!cropImage || !cropArea) return;
    try {
      const blob = await getCroppedImg(cropImage, cropArea);
      if (!blob) return;
      const file = new File([blob], "loyalty_product.jpg", {
        type: "image/jpeg",
      });
      setForm((prev) => ({
        ...prev,
        productImageFile: file,
        productImagePreview: URL.createObjectURL(file),
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setCropImage(null);
      setCropArea(null);
    }
  }

  // ==========================================
  // Form aç / kapat
  // ==========================================
  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
    setMessage("");
  }

  function openEdit(card: LoyaltyCard) {
    setEditingId(card.id);
    setForm({
      itemTypeId: card.itemTypeId,
      rewardBuy: card.rewardBuy,
      programDescription: card.programDescription,
      productImageFile: null,
      productImagePreview: card.productImageUrl || "",
    });
    setShowForm(true);
    setMessage("");
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  // ==========================================
  // Kaydet (ekle veya güncelle)
  // ==========================================
  async function handleSave() {
    if (!form.itemTypeId || form.rewardBuy <= 0) {
      setMessage("❌ Item türü ve damga sayısı zorunlu!");
      return;
    }

    setIsSaving(true);
    try {
      let productImageUrl = editingId
        ? (cards.find((c) => c.id === editingId)?.productImageUrl ?? "")
        : "";

      if (form.productImageFile) {
        const storageRef = ref(
          storage,
          `cafes/${cafeId}/loyalty_product_${Date.now()}.jpg`
        );
        await uploadBytes(storageRef, form.productImageFile, {
          contentType: "image/jpeg",
        });
        productImageUrl = await getDownloadURL(storageRef);
      }

      let newCards: LoyaltyCard[];

      if (editingId) {
        newCards = cards.map((c) =>
          c.id === editingId
            ? {
                ...c,
                itemTypeId: form.itemTypeId,
                rewardBuy: form.rewardBuy,
                rewardGift: form.rewardBuy + 1,
                programDescription: form.programDescription.trim(),
                productImageUrl,
              }
            : c
        );
        setMessage("✅ Kart güncellendi!");
      } else {
        const newCard: LoyaltyCard = {
          id: generateId(),
          position: cards.length + 1,
          itemTypeId: form.itemTypeId,
          rewardBuy: form.rewardBuy,
          rewardGift: form.rewardBuy + 1,
          programDescription: form.programDescription.trim(),
          productImageUrl,
        };
        newCards = [...cards, newCard];
        setMessage("✅ Yeni kart oluşturuldu!");
      }

      await persistCards(newCards);
      cancelForm();
    } catch (err) {
      console.error(err);
      setMessage("❌ Kaydedilirken hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  }

  // ==========================================
  // Sil + kalan kartların pozisyonunu kaydır
  // ==========================================
  async function handleDelete(card: LoyaltyCard) {
    if (!window.confirm("Bu sadakat kartını silmek istiyor musunuz?")) return;

    const filtered = cards.filter((c) => c.id !== card.id);
    // Pozisyonları 1'den başlayarak yeniden ata
    const reindexed = filtered.map((c, i) => ({ ...c, position: i + 1 }));

    try {
      await persistCards(reindexed);
      setMessage("✅ Kart silindi.");
    } catch (err) {
      console.error(err);
      setMessage("❌ Silme başarısız.");
    }
  }

  // ==========================================
  // Sıra değiştir (swap)
  // ==========================================
  async function moveCard(card: LoyaltyCard, direction: "up" | "down") {
    const targetPos =
      direction === "up" ? card.position - 1 : card.position + 1;
    const other = cards.find((c) => c.position === targetPos);
    if (!other) return;

    const newCards = cards.map((c) => {
      if (c.id === card.id) return { ...c, position: targetPos };
      if (c.id === other.id) return { ...c, position: card.position };
      return c;
    });

    try {
      await persistCards(newCards);
    } catch (err) {
      console.error(err);
    }
  }

  // ==========================================
  // QR oluştur
  // ==========================================
  const handleCreateQR = async () => {
    setQrError(null);
    setQrValue(null);
    if (!cafeId) {
      setQrError("Mağaza bilgileri yüklenemedi.");
      return;
    }
    if (!auth.currentUser) {
      setQrError("Oturum açmanız gerekiyor.");
      return;
    }
    try {
      setIsCreatingQR(true);
      const docRef = await addDoc(collection(db, "qrTokens"), {
        cafeId,
        chainId: chainId ?? null,
        userId: null,
        type: "stamp",
        status: "pending",
        createdBy: "cashier",
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
        scannedAt: null,
        scannedUserId: null,
      });
      setQrValue(`app://scan?txId=${docRef.id}`);
    } catch (error) {
      console.error(error);
      setQrError("QR oluşturulurken hata oluştu. Tekrar deneyin.");
    } finally {
      setIsCreatingQR(false);
    }
  };

  // ==========================================
  // İşlem yap / reddet
  // ==========================================
  const handleProcess = async (
    txId: string,
    processType: "stamp" | "redeem",
    userId: string
  ) => {
    if (!cafeId) return;
    try {
      setIsProcessing(txId);
      const approveQrToken = httpsCallable(functions, "approveQrToken");
      await approveQrToken({ txId, type: processType });
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error ? `Hata: ${error.message}` : "Bilinmeyen hata"
      );
    } finally {
      setIsProcessing(null);
    }
  };

  const handleReject = async (txId: string) => {
    try {
      setIsProcessing(txId);
      const rejectQrToken = httpsCallable(functions, "rejectQrToken");
      await rejectQrToken({ txId });
    } catch (error) {
      console.error(error);
      alert("Reddetme işlemi başarısız oldu");
    } finally {
      setIsProcessing(null);
    }
  };

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <>
      {cropImage && (
        <ImageCropper
          image={cropImage}
          aspect={4 / 5}
          onCropComplete={(_, croppedAreaPixels) =>
            setCropArea(croppedAreaPixels)
          }
          onApply={applyCrop}
          onCancel={() => {
            setCropImage(null);
            setCropArea(null);
          }}
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-6">
          {/* Mesaj */}
          {message && (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
                message.includes("✅")
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {message}
            </div>
          )}

          {!cafeId && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              Mağaza bilgileri yüklenemedi. Sayfayı yenileyiniz.
            </div>
          )}

          {/* ========== KART LİSTESİ ========== */}
          <section className={`${shellCardClass()} overflow-hidden`}>
            <div className="flex items-start justify-between px-6 pt-6 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                  Sadakat Kartları
                </p>
                <h2 className="text-lg font-bold text-slate-900">
                  Kart Programları
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Uygulamada sırasıyla gösterilir. Maksimum {MAX_CARDS} kart.
                </p>
              </div>
              {!showForm && cards.length < MAX_CARDS && cafeId && (
                <button
                  onClick={openCreate}
                  className="shrink-0 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  + Yeni Kart
                </button>
              )}
            </div>

            <div className="space-y-3 px-6 pb-6">
              {cards.length === 0 && !showForm && (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 py-10 text-center">
                  <p className="text-sm font-medium text-slate-400">
                    Henüz sadakat kartı yok
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Yeni Kart butonuna basarak ekleyin
                  </p>
                </div>
              )}

              {cards.map((card, idx) => (
                <div
                  key={card.id}
                  className={`rounded-2xl border p-4 ${
                    editingId === card.id
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Pozisyon rozeti */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-lg font-bold text-emerald-700">
                      {card.position}
                    </div>

                    {/* Ürün görseli */}
                    {card.productImageUrl ? (
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={card.productImageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
                        <span className="text-[10px] text-slate-400">
                          Görsel
                        </span>
                      </div>
                    )}

                    {/* Bilgiler */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900">
                        {card.itemTypeId}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Her {card.rewardBuy}{" "}
                        {card.itemTypeId.toLowerCase()}de 1 hediye
                      </p>
                      {card.programDescription && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                          {card.programDescription}
                        </p>
                      )}
                    </div>

                    {/* Aksiyonlar */}
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <div className="flex gap-1">
                        <button
                          onClick={() => moveCard(card, "up")}
                          disabled={idx === 0}
                          title="Yukarı taşı"
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => moveCard(card, "down")}
                          disabled={idx === cards.length - 1}
                          title="Aşağı taşı"
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
                        >
                          ▼
                        </button>
                      </div>
                      <button
                        onClick={() => openEdit(card)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                      >
                        Düzenle
                      </button>
                      <button
                        onClick={() => handleDelete(card)}
                        className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-500 transition hover:bg-red-50"
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {cards.length >= MAX_CARDS && !showForm && (
                <p className="pt-2 text-center text-xs text-slate-400">
                  Maksimum {MAX_CARDS} kart limitine ulaşıldı.
                </p>
              )}
            </div>
          </section>

          {/* ========== FORM (OLUŞTUR / DÜZENLE) ========== */}
          {showForm && (
            <section className={`${shellCardClass()} overflow-hidden`}>
              <SectionTitle
                eyebrow={editingId ? "Kart Düzenle" : "Yeni Kart Ekle"}
                title={
                  editingId
                    ? "Kartı güncelle"
                    : `${cards.length + 1}. kart ayarları`
                }
                description="Item türü ve damga sayısını belirleyin."
              />
              <div className="grid gap-5 p-6 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Item Türü *
                  </label>
                  <select
                    value={form.itemTypeId}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        itemTypeId: e.target.value,
                      }))
                    }
                    className={fieldClass()}
                  >
                    <option value="">-- Item seçin --</option>
                    {ITEM_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Kaç siparişte ödül? *
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.rewardBuy}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        rewardBuy: Number(e.target.value),
                      }))
                    }
                    className={fieldClass()}
                  />
                  {form.rewardBuy > 0 && form.itemTypeId && (
                    <p className="mt-2 text-xs text-emerald-600">
                      Ödül: {form.rewardBuy + 1}. hediye
                    </p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Ürün Görseli
                  </label>
                  <p className="mb-3 text-xs text-slate-400">
                    Önerilen: Instagram fotoğrafı (4:5)
                  </p>
                  {form.productImagePreview && (
                    <div className="mb-3 relative h-32 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={form.productImagePreview}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleProductImageChange}
                    className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-emerald-600 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-emerald-700"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Program Açıklaması
                  </label>
                  <textarea
                    value={form.programDescription}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        programDescription: e.target.value,
                      }))
                    }
                    rows={3}
                    placeholder="Örn. Her 10 kahvede 1 bedava kahve kazanırsın!"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  />
                </div>
              </div>

              <div className="flex gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                <button
                  onClick={handleSave}
                  disabled={isSaving || !form.itemTypeId || form.rewardBuy <= 0}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Kaydediliyor…
                    </>
                  ) : editingId ? (
                    "Güncelle"
                  ) : (
                    "Kart Ekle"
                  )}
                </button>
                <button
                  onClick={cancelForm}
                  className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  İptal
                </button>
              </div>
            </section>
          )}

          {/* ========== DAMGA QR KODU ========== */}
          <section className={`${shellCardClass()} overflow-hidden`}>
            <SectionTitle
              eyebrow="Kasiyerin İşi"
              title="Damga QR Kodu"
              description="Müşteri bu QR'ı tarayarak damga alabilir."
            />
            <div className="p-6">
              <button
                onClick={handleCreateQR}
                disabled={isCreatingQR || !cafeId}
                className="w-full rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreatingQR ? (
                  <>
                    <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                    QR Oluşturuluyor…
                  </>
                ) : (
                  "📱 QR Oluştur"
                )}
              </button>

              {qrError && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {qrError}
                </div>
              )}

              {qrValue && (
                <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-6">
                  <p className="text-sm font-semibold text-slate-900">
                    Müşteri bu QR'ı okutsun
                  </p>
                  <div className="rounded-2xl bg-white p-3 shadow-sm">
                    <QRCode
                      value={qrValue}
                      size={200}
                      level="H"
                      includeMargin={true}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    ⏱️ QR kodu 2 dakika geçerlidir
                  </p>
                  <button
                    onClick={() => setQrValue(null)}
                    className="mt-4 rounded-2xl border border-blue-300 bg-white px-4 py-2 text-xs font-medium text-blue-600 transition hover:bg-blue-50"
                  >
                    ↻ Yeni QR Oluştur
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* ========== BEKLEYEN İŞLEMLER ========== */}
          {pendingTokens.length > 0 && (
            <section className={`${shellCardClass()} overflow-hidden`}>
              <SectionTitle
                eyebrow="Canlı İşlemler"
                title="Bekleyen QR İşlemleri"
                description={`${pendingTokens.length} müşteri tarafından QR tarandı, onay bekleniyor.`}
              />
              <div className="space-y-3 p-6">
                {pendingTokens.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
                  >
                    <div className="mb-3 space-y-1">
                      <p className="text-xs font-mono text-slate-600">
                        <strong>Token ID:</strong> {item.id.slice(0, 12)}…
                      </p>
                      <p className="text-sm font-medium text-slate-900">
                        👤 Kullanıcı:{" "}
                        <span className="text-amber-700">
                          {item.scannedUserId || "?"}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">
                        ⏰ Tarama:{" "}
                        {new Date(
                          item.scannedAt?.toDate?.() || Date.now()
                        ).toLocaleTimeString("tr-TR")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() =>
                          item.scannedUserId &&
                          handleProcess(item.id, "stamp", item.scannedUserId)
                        }
                        disabled={
                          isProcessing === item.id || !item.scannedUserId
                        }
                        className="inline-flex items-center gap-1 rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
                      >
                        {isProcessing === item.id ? (
                          <>
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            İşleniyor…
                          </>
                        ) : (
                          <>⭐ Damga Ver</>
                        )}
                      </button>
                      <button
                        onClick={() =>
                          item.scannedUserId &&
                          handleProcess(item.id, "redeem", item.scannedUserId)
                        }
                        disabled={
                          isProcessing === item.id || !item.scannedUserId
                        }
                        className="inline-flex items-center gap-1 rounded-xl bg-yellow-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-yellow-600 disabled:opacity-60"
                      >
                        {isProcessing === item.id ? (
                          <>
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            İşleniyor…
                          </>
                        ) : (
                          <>🎁 Ödül Kullan</>
                        )}
                      </button>
                      <button
                        onClick={() => handleReject(item.id)}
                        disabled={isProcessing === item.id}
                        className="inline-flex items-center gap-1 rounded-xl border-2 border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                      >
                        {isProcessing === item.id ? (
                          <>
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                            İşleniyor…
                          </>
                        ) : (
                          <>❌ Reddet</>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </section>

        {/* ========== SIDEBAR: ÖNİZLEME ========== */}
        <aside>
          <section
            className={`${shellCardClass()} sticky top-24 overflow-hidden`}
          >
            <SectionTitle
              eyebrow="Kart Önizleme"
              title="Uygulamada sıralama"
              description="Kartlar uygulamada bu sıraya göre listelenir."
            />
            <div className="space-y-3 bg-slate-50 p-5">
              {Array.from({ length: MAX_CARDS }, (_, i) => i + 1).map((pos) => {
                const card = cards.find((c) => c.position === pos);
                return (
                  <div
                    key={pos}
                    className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="flex items-stretch">
                      <div className="flex h-20 w-12 shrink-0 items-center justify-center bg-emerald-50 text-lg font-bold text-emerald-600">
                        {pos}
                      </div>
                      {card ? (
                        <>
                          <div className="h-20 w-20 shrink-0 overflow-hidden bg-slate-100">
                            {card.productImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={card.productImageUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
                                Görsel yok
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 p-3">
                            <p className="truncate text-sm font-bold text-slate-900">
                              {businessForm.cafeName || "Mağaza adı"}
                            </p>
                            <p className="text-xs text-slate-400">
                              {card.itemTypeId}
                            </p>
                            <div className="mt-2">
                              <div className="h-1.5 w-full rounded-full bg-slate-100">
                                <div className="h-1.5 w-0 rounded-full bg-emerald-500" />
                              </div>
                              <p className="mt-1 text-[10px] text-slate-400">
                                0 / {card.rewardBuy} damga
                              </p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-1 items-center justify-center">
                          <p className="text-xs text-slate-300">Boş slot</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
