"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  addDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import SectionTitle from "../ui/section-title";
import Toggle from "../ui/toggle";
import { shellCardClass } from "../helpers";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type GlobalCampaign = {
  id: string;
  title: string;
  description: string;
  order: number;
};

type CafeCampaign = {
  campaignId: string;
  isEnabled: boolean;
  joinedAt: unknown;
};

type CustomCampaign = {
  id: string;
  title: string;
  description: string;
  bannerImage: string; // 🔥 YENİ: Banner image URL
  isActive: boolean;
  order: number;
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function CampaignsTab() {
  const [cafeId, setCafeId] = useState("");
  const [loading, setLoading] = useState(true);

  // ── Global kampanya state ──
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");
  const [globalCampaigns, setGlobalCampaigns] = useState<GlobalCampaign[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [initialJoinedIds, setInitialJoinedIds] = useState<Set<string>>(new Set());

  const hasChanges =
    JSON.stringify([...pendingIds].sort()) !==
    JSON.stringify([...initialJoinedIds].sort());

  // ── Özel kampanya state ──
  const [customCampaigns, setCustomCampaigns] = useState<CustomCampaign[]>([]);
  const [customMessage, setCustomMessage] = useState("");
  const [customError, setCustomError] = useState("");
  const [savingCustom, setSavingCustom] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false); // 🔥 YENİ
  const [deletingId, setDeletingId] = useState("");
  const [togglingId, setTogglingId] = useState("");

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formOrder, setFormOrder] = useState("1");
  const [formImageFile, setFormImageFile] = useState<File | null>(null); // 🔥 YENİ
  const [formImagePreview, setFormImagePreview] = useState<string>(""); // 🔥 YENİ: Preview
  const [existingImageUrl, setExistingImageUrl] = useState<string>(""); // 🔥 YENİ: Edit mode'da eski resim
  const [editingId, setEditingId] = useState<string | null>(null); // null = yeni

  // ── Veri yükle ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const cafeSnap = await getDocs(
          query(collection(db, "cafes"), where("ownerUid", "==", user.uid))
        );

        if (cafeSnap.empty) {
          setErrorText("Kafe bulunamadı.");
          setLoading(false);
          return;
        }

        const foundCafeId = cafeSnap.docs[0].id;
        setCafeId(foundCafeId);

        // Global kampanyalar
        const globalSnap = await getDocs(
          query(collection(db, "campaigns"), where("isActive", "==", true))
        );

        const globals: GlobalCampaign[] = globalSnap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              title: String(data.title ?? "Kampanya"),
              description: String(data.description ?? ""),
              order: Number(data.order ?? 999),
            };
          })
          .sort((a, b) => a.order - b.order);

        setGlobalCampaigns(globals);

        // Katılımlar
        const cafeSubSnap = await getDocs(
          collection(db, "cafes", foundCafeId, "campaigns")
        );

        const enabled = new Set<string>();
        cafeSubSnap.docs.forEach((d) => {
          const data = d.data() as CafeCampaign;
          if (data.isEnabled) enabled.add(d.id);
        });

        setPendingIds(new Set(enabled));
        setInitialJoinedIds(new Set(enabled));

        // Özel kampanyalar
        await loadCustomCampaigns(foundCafeId);
      } catch (err) {
        console.error("CampaignsTab load error:", err);
        setErrorText("Veriler yüklenirken hata oluştu.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  async function loadCustomCampaigns(cid: string) {
    const snap = await getDocs(
      collection(db, "cafes", cid, "customCampaigns")
    );
    const list: CustomCampaign[] = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: String(data.title ?? ""),
          description: String(data.description ?? ""),
          bannerImage: String(data.bannerImage ?? ""), // 🔥 YENİ
          isActive: Boolean(data.isActive ?? true),
          order: Number(data.order ?? 999),
        };
      })
      .sort((a, b) => a.order - b.order);
    setCustomCampaigns(list);
  }

  // ── Global toggle ──
  function togglePending(campaignId: string) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (next.has(campaignId)) next.delete(campaignId);
      else next.add(campaignId);
      return next;
    });
    setMessage("");
    setErrorText("");
  }

  // ── Global kaydet ──
  async function handleSave() {
    if (!cafeId) return;
    setSaving(true);
    setMessage("");
    setErrorText("");

    try {
      const batch = writeBatch(db);

      for (const id of pendingIds) {
        const ref = doc(db, "cafes", cafeId, "campaigns", id);
        batch.set(
          ref,
          {
            campaignId: id,
            isEnabled: true,
            updatedAt: serverTimestamp(),
            ...(!initialJoinedIds.has(id) ? { joinedAt: serverTimestamp() } : {}),
          },
          { merge: true }
        );
      }

      for (const id of initialJoinedIds) {
        if (!pendingIds.has(id)) {
          batch.delete(doc(db, "cafes", cafeId, "campaigns", id));
        }
      }

      const activeCampaignTitles = globalCampaigns
        .filter((c) => pendingIds.has(c.id))
        .map((c) => c.title);

      const hasCustom = customCampaigns.length > 0;
      const hasCampaign = activeCampaignTitles.length > 0 || hasCustom;

      const cafeRef = doc(db, "cafes", cafeId);
      batch.update(cafeRef, {
        campaignTitles: activeCampaignTitles,
        hasCampaign,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      setInitialJoinedIds(new Set(pendingIds));
      setMessage("Kampanya tercihlerin kaydedildi.");
    } catch (err) {
      console.error("CampaignsTab save error:", err);
      setErrorText("Kaydetme sırasında hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  // 🔥 YENİ: Image file select handler
  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Dosya boyut kontrolü (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setCustomError("Dosya boyutu 5MB'dan büyük olamaz.");
      return;
    }

    // Preview oluştur
    const reader = new FileReader();
    reader.onload = (event) => {
      setFormImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    setFormImageFile(file);
    setCustomError("");
  }

  // ── Özel kampanya form sıfırla ──
  function resetForm() {
    setFormTitle("");
    setFormDescription("");
    setFormOrder("1");
    setFormImageFile(null); // 🔥 YENİ
    setFormImagePreview(""); // 🔥 YENİ
    setExistingImageUrl(""); // 🔥 YENİ
    setEditingId(null);
    setCustomError("");
    setCustomMessage("");
  }

  // ── Özel kampanya düzenlemeye al ──
  function startEdit(c: CustomCampaign) {
    setEditingId(c.id);
    setFormTitle(c.title);
    setFormDescription(c.description);
    setFormOrder(String(c.order));
    setExistingImageUrl(c.bannerImage); // 🔥 YENİ: Eski resmi koru
    setFormImageFile(null);
    setFormImagePreview(""); // 🔥 YENİ: Preview temizle, eski resmi göster
    setCustomError("");
    setCustomMessage("");
  }

  // ── Özel kampanya kaydet (yeni veya güncelle) ──
  async function handleSaveCustom() {
    if (!cafeId) return;
    if (!formTitle.trim()) {
      setCustomError("Başlık boş olamaz.");
      return;
    }

    setSavingCustom(true);
    setUploadingImage(false);
    setCustomError("");
    setCustomMessage("");

    try {
      // 🔥 YENİ: Image upload işlemi
      let imageUrl = existingImageUrl; // Edit mode'da eski resmi koru

      if (formImageFile) {
        setUploadingImage(true);

        const storageRef = ref(
          storage,
          `campaigns/cafes/${cafeId}/${Date.now()}_${formImageFile.name}`
        );

        // Upload
        await uploadBytes(storageRef, formImageFile);

        // Get download URL
        imageUrl = await getDownloadURL(storageRef);

        setUploadingImage(false);
      }

      if (editingId) {
        // Güncelle
        await updateDoc(
          doc(db, "cafes", cafeId, "customCampaigns", editingId),
          {
            title: formTitle.trim(),
            description: formDescription.trim(),
            bannerImage: imageUrl, // 🔥 YENİ: Resmi kaydet
            order: Number(formOrder) || 999,
            updatedAt: serverTimestamp(),
          }
        );
        setCustomMessage("Kampanya güncellendi.");
      } else {
        // Yeni kampanya oluştur
        await addDoc(
          collection(db, "cafes", cafeId, "customCampaigns"),
          {
            title: formTitle.trim(),
            description: formDescription.trim(),
            bannerImage: imageUrl, // 🔥 YENİ: Resmi kaydet
            isActive: true,
            order: Number(formOrder) || 999,
            createdAt: serverTimestamp(),
          }
        );

        // Real count çek
        const snap = await getDocs(
          collection(db, "cafes", cafeId, "customCampaigns")
        );
        const newCount = snap.size;

        const hasGlobal = pendingIds.size > 0;
        const hasCustom = newCount > 0;

        await updateDoc(doc(db, "cafes", cafeId), {
          customCampaignCount: newCount,
          hasCampaign: hasGlobal || hasCustom,
          updatedAt: serverTimestamp(),
        });

        setCustomMessage("Kampanya oluşturuldu.");
      }

      resetForm();
      await loadCustomCampaigns(cafeId);
    } catch (err) {
      console.error("Custom campaign save error:", err);
      setCustomError(
        uploadingImage
          ? "Görsel yüklenirken hata oluştu."
          : "Kaydetme sırasında hata oluştu."
      );
    } finally {
      setSavingCustom(false);
      setUploadingImage(false);
    }
  }

  // ── Özel kampanya aktif/pasif ──
  async function handleToggleCustom(c: CustomCampaign) {
    if (!cafeId) return;
    setTogglingId(c.id);
    try {
      await updateDoc(
        doc(db, "cafes", cafeId, "customCampaigns", c.id),
        {
          isActive: !c.isActive,
          updatedAt: serverTimestamp(),
        }
      );
      await loadCustomCampaigns(cafeId);
    } catch (err) {
      console.error(err);
      setCustomError("Güncelleme sırasında hata oluştu.");
    } finally {
      setTogglingId("");
    }
  }

  // ── Özel kampanya sil ──
  async function handleDeleteCustom(id: string) {
    if (!cafeId) return;
    if (!confirm("Bu kampanyayı silmek istediğinden emin misin?")) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, "cafes", cafeId, "customCampaigns", id));

      const snap = await getDocs(
        collection(db, "cafes", cafeId, "customCampaigns")
      );
      const newCount = snap.size;

      const hasGlobal = pendingIds.size > 0;
      const hasCustom = newCount > 0;

      await updateDoc(doc(db, "cafes", cafeId), {
        customCampaignCount: newCount,
        hasCampaign: hasGlobal || hasCustom,
        updatedAt: serverTimestamp(),
      });

      setCustomMessage("Kampanya silindi.");
      await loadCustomCampaigns(cafeId);
    } catch (err) {
      console.error(err);
      setCustomError("Silme sırasında hata oluştu.");
    } finally {
      setDeletingId("");
    }
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-600">
            Kampanyalar yükleniyor...
          </p>
        </div>
      </div>
    );
  }

  const joinedCount = pendingIds.size;
  const totalCount = globalCampaigns.length;

  return (
    <div className="space-y-8">
      {/* ══════════════════════════════════════
          BÖLÜM 1 — Global Kampanyalar
      ══════════════════════════════════════ */}
      <div>
        {errorText && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorText}
          </div>
        )}
        {message && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {message}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Sol: Global liste */}
          <section className={`${shellCardClass()} overflow-hidden`}>
            <SectionTitle
              eyebrow="Global Kampanyalar"
              title="Katılmak istediğin kampanyaları seç"
              description="Admin tarafından oluşturulan kampanyalar listelenir. Toggle ile katılabilir veya ayrılabilirsin."
            />

            <div className="border-b border-slate-200 bg-slate-50 px-6 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">
                  <span className="font-bold text-emerald-700">
                    {joinedCount}
                  </span>
                  <span className="text-slate-400">
                    {" "}
                    / {totalCount} kampanyaya katılıyorsun
                  </span>
                </p>
                {hasChanges && (
                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    Kaydedilmemiş değişiklik
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-3 p-6">
              {globalCampaigns.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
                  <p className="text-sm font-medium text-slate-500">
                    Henüz aktif global kampanya yok.
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Admin panelinden kampanya oluşturulduğunda burada
                    görünecek.
                  </p>
                </div>
              ) : (
                globalCampaigns.map((campaign) => {
                  const isJoined = pendingIds.has(campaign.id);
                  const wasJoined = initialJoinedIds.has(campaign.id);
                  const changed = isJoined !== wasJoined;
                  return (
                    <div
                      key={campaign.id}
                      className={`rounded-3xl border p-5 transition ${
                        isJoined
                          ? "border-emerald-200 bg-emerald-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-slate-900">
                              {campaign.title}
                            </p>
                            {isJoined && (
                              <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                                Katılıyorsun
                              </span>
                            )}
                            {changed && (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-600">
                                {isJoined ? "+ Katılacak" : "− Ayrılacak"}
                              </span>
                            )}
                          </div>
                          {campaign.description && (
                            <p className="mt-2 text-sm leading-6 text-slate-500">
                              {campaign.description}
                            </p>
                          )}
                        </div>
                        <Toggle
                          checked={isJoined}
                          onChange={() => togglePending(campaign.id)}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Sağ: Özet + Kaydet */}
          <aside className="space-y-4">
            <section className={`${shellCardClass()} overflow-hidden`}>
              <SectionTitle
                eyebrow="Özet"
                title="Katılım durumu"
                description="Aktif kampanya tercihlerine genel bakış."
              />
              <div className="space-y-3 p-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Katıldığın Kampanya
                  </p>
                  <p className="mt-2 text-2xl font-bold text-emerald-600">
                    {joinedCount}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Toplam {totalCount} kampanyadan
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Katılmadığın
                  </p>
                  <p className="mt-2 text-2xl font-bold text-slate-700">
                    {totalCount - joinedCount}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Toggle ile katılabilirsin
                  </p>
                </div>
                {joinedCount > 0 && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                      Aktif Kampanyaların
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {globalCampaigns
                        .filter((c) => pendingIds.has(c.id))
                        .map((c) => (
                          <li
                            key={c.id}
                            className="flex items-center gap-2 text-xs font-medium text-emerald-700"
                          >
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {c.title}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">
                Değişiklikleri kaydet
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Toggle'ları ayarladıktan sonra kaydet butonuna bas.
              </p>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Kaydediliyor...
                  </>
                ) : hasChanges ? (
                  "Tercihleri Kaydet"
                ) : (
                  "Kaydedildi ✓"
                )}
              </button>
            </div>
          </aside>
        </div>
      </div>

      {/* ══════════════════════════════════════
          BÖLÜM 2 — Özel Kampanyalarım
      ══════════════════════════════════════ */}
      <div>
        {customError && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {customError}
          </div>
        )}
        {customMessage && (
          <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
            {customMessage}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Sol: Özel kampanya listesi */}
          <section className={`${shellCardClass()} overflow-hidden`}>
            <SectionTitle
              eyebrow="Özel Kampanyalarım"
              title="Kendi kampanyalarını yönet"
              description="Kafen için özel kampanyalar oluştur. Bu kampanyalar sadece senin kafen için geçerlidir."
            />

            <div className="space-y-3 p-6">
              {customCampaigns.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
                  <p className="text-sm font-medium text-slate-500">
                    Henüz özel kampanya oluşturmadın.
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Sağdaki formu kullanarak ilk kampanyanı oluşturabilirsin.
                  </p>
                </div>
              ) : (
                customCampaigns.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-3xl border p-5 transition ${
                      c.isActive
                        ? "border-blue-200 bg-blue-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        {/* 🔥 YENİ: Banner görüntüsü */}
                        {c.bannerImage && (
                          <div className="mb-3 h-40 w-full overflow-hidden rounded-2xl bg-slate-100">
                            <img
                              src={c.bannerImage}
                              alt={c.title}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-slate-900">
                            {c.title}
                          </p>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              c.isActive
                                ? "border border-blue-200 bg-blue-100 text-blue-700"
                                : "border border-slate-200 bg-white text-slate-500"
                            }`}
                          >
                            {c.isActive ? "Aktif" : "Pasif"}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-400">
                            Sıra: {c.order}
                          </span>
                        </div>
                        {c.description && (
                          <p className="mt-2 text-sm leading-6 text-slate-500">
                            {c.description}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(c)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleCustom(c)}
                          disabled={togglingId === c.id}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          {c.isActive ? "Pasife Al" : "Aktif Et"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustom(c.id)}
                          disabled={deletingId === c.id}
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
                        >
                          {deletingId === c.id ? "Siliniyor..." : "Sil"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Sağ: Form */}
          <aside>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">
                {editingId ? "Kampanyayı Düzenle" : "Yeni Kampanya Oluştur"}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {editingId
                  ? "Bilgileri güncelleyip kaydet."
                  : "Kafen için özel bir kampanya tanımla."}
              </p>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Başlık *
                  </label>
                  <input
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Örn. Öğrenci İndirimi"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Açıklama
                  </label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Kampanya detayı..."
                    className="min-h-[80px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  />
                </div>

                {/* 🔥 YENİ: Image upload input */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Kampanya Görseli
                  </label>

                  {/* Preview */}
                  {(formImagePreview || existingImageUrl) && (
                    <div className="mb-3 h-32 w-full overflow-hidden rounded-2xl bg-slate-100">
                      <img
                        src={formImagePreview || existingImageUrl}
                        alt="Preview"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}

                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    disabled={uploadingImage}
                    className="w-full text-xs file:mr-3 file:rounded-xl file:border file:border-slate-200 file:bg-slate-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-100 disabled:opacity-60"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    JPG, PNG veya WebP (maks. 5MB)
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Sıra
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formOrder}
                    onChange={(e) => setFormOrder(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveCustom}
                  disabled={savingCustom || uploadingImage}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingCustom || uploadingImage ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      {uploadingImage ? "Görsel Yükleniyor..." : "Kaydediliyor..."}
                    </>
                  ) : editingId ? (
                    "Güncelle"
                  ) : (
                    "Kampanya Oluştur"
                  )}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    İptal
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}