"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import { httpsCallable, getFunctions } from "firebase/functions"; // ✅ FİX
import { QRCodeSVG as QRCode } from "qrcode.react";
import SectionTitle from "../ui/section-title";
import Toggle from "../ui/toggle";
import { fieldClass, shellCardClass } from "../helpers";
import type { BusinessForm, LoyaltyForm } from "../types";

type ItemType = {
  id: string;
  name: string;
  order: number;
};

type PendingToken = {
  id: string;
  cafeId: string;
  userId: string | null;
  scannedUserId: string | null;
  status: string;
  type: string;
  createdAt: any;
  scannedAt: any;
  processedType?: string;
  [key: string]: any;
};

type Props = {
  businessForm: BusinessForm;
  loyaltyForm: LoyaltyForm;
  previewText: string;
  updateLoyaltyField: <K extends keyof LoyaltyForm>(
    key: K,
    value: LoyaltyForm[K]
  ) => void;
  selectedItemType: string;
  setSelectedItemType: (value: string) => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
  message: string;
};

export default function LoyaltyTab({
  businessForm,
  loyaltyForm,
  previewText,
  updateLoyaltyField,
  selectedItemType,
  setSelectedItemType,
  onSave,
  isSaving,
  message,
}: Props) {
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [isCreatingQR, setIsCreatingQR] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [pendingTokens, setPendingTokens] = useState<PendingToken[]>([]);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const cafeIdField = businessForm?.cafeId || null;
  const functions = getFunctions(undefined, "europe-west1");
  // ==========================================
  // businessForm kontrol
  // ==========================================
  useEffect(() => {
    console.log("========================================");
    console.log("🔍 BUSINESSFORM KONTROL");
    console.log("========================================");
    console.log("📊 businessForm:", businessForm);
    console.log("✅ cafeId (Kullanılacak):", businessForm?.cafeId);

    if (!cafeIdField) {
      console.error("❌ ERR: businessForm'da cafeId alanı yok!");
    } else {
      console.log("✅ HAZIR! Kullanılacak cafeId:", cafeIdField);
    }
    console.log("========================================");
  }, [businessForm, cafeIdField]);

  // ==========================================
  // Item Types yükleme
  // ==========================================
  useEffect(() => {
    const itemTypesQuery = query(
      collection(db, "itemTypes"),
      orderBy("order", "asc")
    );

    const unsubscribe = onSnapshot(itemTypesQuery, (snap) => {
      const items: ItemType[] = snap.docs.map((doc) => ({
        id: doc.id,
        name: (doc.data() as Record<string, unknown>).name as string,
        order: (doc.data() as Record<string, unknown>).order as number,
      }));
      setItemTypes(items);
    });

    return () => unsubscribe();
  }, []);

  // ==========================================
  // Pending QR Tokens dinleme (SCANNED durumunda)
  // ==========================================
  useEffect(() => {
    if (!cafeIdField) {
      console.log("❌ cafeIdField boş, query başlatılmadı");
      setPendingTokens([]);
      return;
    }

    console.log("🔄 Pending tokens listener başlatıldı. cafeId:", cafeIdField);

    const q = query(
      collection(db, "qrTokens"),
      where("cafeId", "==", cafeIdField),
      where("status", "==", "scanned"), // ✅ SADECE scanned durumu
      orderBy("scannedAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as PendingToken));

        setPendingTokens(list);
        console.log("📋 Bekleyen işlemler güncellendi:", list.length, "adet");
        list.forEach((item) => {
          console.log(`   - ${item.id.slice(0, 12)}... | User: ${item.scannedUserId}`);
        });
      },
      (error) => {
        console.error("❌ Snapshot listener hatası:", error);
      }
    );

    return () => {
      console.log("🛑 Pending tokens listener kapatıldı");
      unsubscribe();
    };
  }, [cafeIdField]);

  // ==========================================
  // QR Oluştur
  // ==========================================
  const handleCreateQR = async () => {
    setQrError(null);
    setQrValue(null);

    if (!cafeIdField) {
      const errorMsg =
        "❌ Kafe ID'si (cafeId) bulunamadı. Lütfen businessForm kontrol et.";
      setQrError(errorMsg);
      console.error(errorMsg);
      console.error("cafeIdField değeri:", cafeIdField);
      return;
    }

    if (!auth.currentUser) {
      const errorMsg = "❌ Oturum açmanız gerekiyor.";
      setQrError(errorMsg);
      console.error(errorMsg);
      return;
    }

    try {
      setIsCreatingQR(true);
      console.log("========================================");
      console.log("📱 QR Oluşturuluyor...");
      console.log("   Koleksiyon: qrTokens");
      console.log("   cafeId:", cafeIdField);
      console.log("   userId (kasiyer):", auth.currentUser.uid);

      const docRef = await addDoc(collection(db, "qrTokens"), {
        cafeId: cafeIdField,
        userId: null, // Henüz taranmamış
        type: "stamp",
        status: "pending", // İlk status
        createdBy: "cashier",
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 2 * 60 * 1000), // 2 dakika
        scannedAt: null,
        scannedUserId: null,
      });

      const qrData = `app://scan?txId=${docRef.id}`;
      setQrValue(qrData);

      console.log("✅ QR başarıyla oluşturuldu!");
      console.log("   Doc ID:", docRef.id);
      console.log("   QR Data:", qrData);
      console.log("   Status: pending");
      console.log("========================================");
    } catch (error) {
      console.error("❌ QR oluşturma hatası:", error);

      if (error instanceof Error) {
        setQrError(`❌ Hata: ${error.message}`);
      } else {
        setQrError("❌ Bilinmeyen hata oluştu. Lütfen konsolu kontrol et.");
      }
    } finally {
      setIsCreatingQR(false);
    }
  };

  // ==========================================
  // İşlem Yap (Damga Ver / Ödül Kullan)
  // ✅ DÜZELTILDI: Cloud Function çağrılıyor
  // ==========================================
  const handleProcess = async (
    txId: string,
    processType: "stamp" | "redeem",
    userId: string
  ) => {
    if (!cafeIdField) {
      console.error("❌ cafeId eksik");
      return;
    }

    try {
      setIsProcessing(txId);
      console.log("========================================");
      console.log("⏳ İşlem başladı...");
      console.log("   txId:", txId);
      console.log("   processType:", processType);
      console.log("   userId:", userId);

      // ✅ Cloud Function çağır (approveQrToken)
      // Bu function Firestore'da points güncelleyecek
      const approveQrToken = httpsCallable(functions, "approveQrToken");
      await approveQrToken({
        txId,
        type: processType,
      });

      console.log("✅ Cloud Function çağrıldı");
      console.log("   Token status: processed");
      console.log("   Points güncellenecek");
      console.log("========================================");
    } catch (error) {
      console.error("❌ İşlem hatası:", error);

      if (error instanceof Error) {
        alert(`Hata: ${error.message}`);
      } else {
        alert("Bilinmeyen hata oluştu");
      }
    } finally {
      setIsProcessing(null);
    }
  };

  // ==========================================
  // İşlemi Reddet
  // ✅ DÜZELTILDI: Cloud Function çağrılıyor
  // ==========================================
  const handleReject = async (txId: string) => {
    try {
      setIsProcessing(txId);
      console.log("========================================");
      console.log("❌ İşlem reddediliyor...");
      console.log("   txId:", txId);

      // ✅ Cloud Function çağır (rejectQrToken)
      const rejectQrToken = httpsCallable(functions, "rejectQrToken");
      await rejectQrToken({
        txId,
      });

      console.log("✅ Cloud Function çağrıldı");
      console.log("   Token status: rejected");
      console.log("========================================");
    } catch (error) {
      console.error("❌ Reddetme hatası:", error);
      alert("Reddetme işlemi başarısız oldu");
    } finally {
      setIsProcessing(null);
    }
  };

  // ==========================================
  // Otomatik Ödül Başlığı
  // ==========================================
  const automaticRewardGift = loyaltyForm.rewardBuy + 1;
  const automaticRewardTitle =
    loyaltyForm.rewardBuy > 0 && selectedItemType
      ? `${loyaltyForm.rewardBuy} ${selectedItemType} siparişine, ${automaticRewardGift}. hediye`
      : "";

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-6">
        {/* Başarı/Hata Mesajı */}
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

        {/* QR Oluşturma Hatası */}
        {qrError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {qrError}
          </div>
        )}

        {/* CafeId Eksikse Uyarı */}
        {!cafeIdField && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
            <p className="font-semibold text-red-700">
              ⚠️ businessForm.cafeId Kontrol Gerekli
            </p>
            <p className="mt-2 text-sm text-red-600">
              businessForm'da cafeId alanı bulunamadı. F12 → Console sekmesine bak.
            </p>
            <div className="mt-3 max-h-48 overflow-auto rounded bg-red-900 p-3 font-mono text-xs text-red-200">
              <pre>{JSON.stringify(businessForm, null, 2)}</pre>
            </div>
          </div>
        )}

        {/* ========== PROGRAM AYARLARI ========== */}
        <section className={`${shellCardClass()} overflow-hidden`}>
          <SectionTitle
            eyebrow="Program Ayarları"
            title="Sadakat kart kuralları"
            description="Kafe sahibi sadece item ve damga sayısını seçer, kalanı otomatik oluşur."
          />
          <div className="grid gap-5 p-6 md:grid-cols-2">
            {/* İtem Türü Seç */}
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                İtem Türü Seç *
              </label>
              <select
                value={selectedItemType}
                onChange={(e) => setSelectedItemType(e.target.value)}
                className={fieldClass()}
              >
                <option value="">-- İtem seçin (Kahve, Tatlı, vb.) --</option>
                {itemTypes.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
              {selectedItemType && (
                <p className="mt-2 text-xs text-emerald-600">
                  ✓ Seçili: {selectedItemType}
                </p>
              )}
            </div>

            {/* Kaç siparişte ödül */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Kaç siparişte ödül? *
              </label>
              <input
                type="number"
                min={1}
                value={loyaltyForm.rewardBuy}
                onChange={(e) =>
                  updateLoyaltyField("rewardBuy", Number(e.target.value))
                }
                className={fieldClass()}
              />
              {loyaltyForm.rewardBuy > 0 && selectedItemType && (
                <p className="mt-2 text-xs text-emerald-600">
                  ✓ Ödül: {automaticRewardGift}. hediye
                </p>
              )}
            </div>

            {/* Günlük max damga */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Günlük max damga
              </label>
              <input
                type="number"
                min={0}
                value={loyaltyForm.maxDailyStamp}
                onChange={(e) =>
                  updateLoyaltyField("maxDailyStamp", Number(e.target.value))
                }
                className={fieldClass()}
              />
            </div>

            {/* Kart geçerlilik */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Kart geçerlilik (gün)
              </label>
              <input
                type="number"
                min={0}
                value={loyaltyForm.expiryDays}
                onChange={(e) =>
                  updateLoyaltyField("expiryDays", Number(e.target.value))
                }
                className={fieldClass()}
              />
            </div>

            {/* Otomatik Başlık */}
            {automaticRewardTitle && (
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Otomatik Başlık
                </label>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-sm font-semibold text-emerald-700">
                    {automaticRewardTitle}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Kaydet Butonu */}
          <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
            <button
              onClick={onSave}
              disabled={isSaving || !selectedItemType || loyaltyForm.rewardBuy <= 0}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Kaydediliyor...
                </>
              ) : (
                "💾 Kaydet"
              )}
            </button>
            {!selectedItemType || loyaltyForm.rewardBuy <= 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                Item türü ve damga sayısı seçmek zorunlu
              </p>
            ) : null}
          </div>
        </section>

        {/* ========== DAMGA QR KODU ========== */}
        <section className={`${shellCardClass()} overflow-hidden`}>
          <SectionTitle
            eyebrow="Kasiyerin İşi"
            title="Damga QR Kodu"
            description="Müşteri bu QR'ı tarayarak damga alabilir."
          />
          <div className="p-6">
            {/* QR Oluştur Butonu */}
            <button
              onClick={handleCreateQR}
              disabled={isCreatingQR || !cafeIdField}
              className="w-full rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreatingQR ? (
                <>
                  <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                  QR Oluşturuluyor...
                </>
              ) : (
                "📱 QR Oluştur"
              )}
            </button>

            {/* CafeId Eksikse Uyarı */}
            {!cafeIdField && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-700">
                  ⚠️ QR Oluşturulamıyor
                </p>
                <p className="mt-2 text-xs text-red-600">
                  businessForm.cafeId eksik. Console'ı açıp kontrol et.
                </p>
              </div>
            )}

            {/* QR Göster */}
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

                <p className="text-xs text-slate-500">⏱️ QR kodu 2 dakika geçerlidir</p>

                <div className="mt-4 w-full rounded-2xl border border-blue-200 bg-white p-3">
                  <p className="text-xs font-mono text-slate-600">
                    <strong>QR Data:</strong> {qrValue}
                  </p>
                </div>

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
                      <strong>Token ID:</strong> {item.id.slice(0, 12)}...
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
                    {/* Damga Ver Butonu */}
                    <button
                      onClick={() =>
                        item.scannedUserId &&
                        handleProcess(item.id, "stamp", item.scannedUserId)
                      }
                      disabled={isProcessing === item.id || !item.scannedUserId}
                      className="inline-flex items-center gap-1 rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
                    >
                      {isProcessing === item.id ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          İşleniyor...
                        </>
                      ) : (
                        <>⭐ Damga Ver</>
                      )}
                    </button>

                    {/* Ödül Kullan Butonu */}
                    <button
                      onClick={() =>
                        item.scannedUserId &&
                        handleProcess(item.id, "redeem", item.scannedUserId)
                      }
                      disabled={isProcessing === item.id || !item.scannedUserId}
                      className="inline-flex items-center gap-1 rounded-xl bg-yellow-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-yellow-600 disabled:opacity-60"
                    >
                      {isProcessing === item.id ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          İşleniyor...
                        </>
                      ) : (
                        <>🎁 Ödül Kullan</>
                      )}
                    </button>

                    {/* Reddet Butonu */}
                    <button
                      onClick={() => handleReject(item.id)}
                      disabled={isProcessing === item.id}
                      className="inline-flex items-center gap-1 rounded-xl border-2 border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                    >
                      {isProcessing === item.id ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                          İşleniyor...
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

        {/* ========== PROGRAM DURUMU ========== */}
        <section className={`${shellCardClass()} overflow-hidden`}>
          <SectionTitle
            eyebrow="Program Durumu"
            title="Yayın kontrolü"
            description="Henüz ayrı bir loyalty status alanı yoksa kafe aktifliğini baz alıyoruz."
          />
          <div className="p-6">
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Sadakat programı aktif
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Şimdilik ayrı veri yoksa kafe aktifliğine bağlı gösterilir.
                </p>
              </div>
              <Toggle
                checked={loyaltyForm.programActive}
                onChange={() =>
                  updateLoyaltyField(
                    "programActive",
                    !loyaltyForm.programActive
                  )
                }
              />
            </div>
          </div>
        </section>
      </section>

      {/* ========== SIDEBAR: KART ÖNİZLEME ========== */}
      <aside>
        <section className={`${shellCardClass()} sticky top-24 overflow-hidden`}>
          <SectionTitle
            eyebrow="Kart Önizleme"
            title="Sadakat kart hissi"
            description="Gerçek reward alanlarıyla dolan önizleme."
          />
          <div className="space-y-4 bg-slate-50 p-5">
            <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-lg font-bold text-slate-900">
                {businessForm.cafeName || "Kafe adı"}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {automaticRewardTitle || previewText || "Henüz tanımlanmadı"}
              </p>

              <div className="mt-5 grid grid-cols-5 gap-2">
                {Array.from({
                  length: Math.max(loyaltyForm.rewardBuy, 5),
                }).map((_, index) => (
                  <div
                    key={index}
                    className={`flex aspect-square items-center justify-center rounded-2xl border text-sm font-bold ${
                      index < Math.min(loyaltyForm.rewardBuy, 3)
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-50 text-slate-400"
                    }`}
                  >
                    ☕
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                🎁 Tamamlanınca {automaticRewardGift} hediye ürün verilir
              </div>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}