'use client';

import { useState, useRef, useEffect } from 'react';
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import Image from 'next/image';
import SectionTitle from '../ui/section-title';
import { shellCardClass, fieldClass } from '../helpers';

// AuthContext hook - Projeni uygun şekilde güncelle
// import { useAuth } from '@/context/AuthContext';

interface Event {
  id: string;
  title: string;
  description: string;
  bannerImage: string;
  eventDate: string;
  eventTime: string;
  isActive: boolean;
  createdAt: Timestamp;
  deleteAt?: Timestamp;
}

export default function EventsTab({ cafeId }: { cafeId?: string }) {
  // Eğer useAuth hook'unuz varsa aşağıdaki satırı uncomment edin:
  // const { user, cafeId } = useAuth();

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    eventDate: '',
    eventTime: '',
    eventImage: null as File | null,
    imagePreview: '',
  });

  // Validation
  const today = new Date().toISOString().split('T')[0];
  const errors = {
    title: !formData.title.trim() ? 'Etkinlik başlığı zorunlu' : '',
    description: !formData.description.trim() ? 'Etkinlik açıklaması zorunlu' : '',
    eventDate: !formData.eventDate
      ? 'Etkinlik tarihi zorunlu'
      : formData.eventDate < today
      ? 'Geçmiş tarih seçilemez'
      : '',
    eventTime: !formData.eventTime ? 'Etkinlik saati zorunlu' : '',
    eventImage: !formData.eventImage ? 'Etkinlik görseli zorunlu' : '',
  };
  const isFormValid = Object.values(errors).every((e) => e === '');

  // Realtime events listener
  const [unsubscribe, setUnsubscribe] = useState<(() => void) | null>(null);

  // Events'ı getir (realtime)
  const loadEvents = () => {
    if (!cafeId) return;

    setLoading(true);

    const q = query(
      collection(db, 'cafes', cafeId, 'events'),
      where('isActive', '==', true)
    );

    const unsubFunc = onSnapshot(q, async (snapshot) => {
      const now = new Date();
      const upcoming: Event[] = [];
      const expiredDeletes: Promise<void>[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Omit<Event, 'id'>;

        // deleteAt varsa ona bak, yoksa eventDate+eventTime'dan hesapla
        let eventDateTime: Date;
        if (data.deleteAt?.toDate) {
          eventDateTime = data.deleteAt.toDate();
        } else {
          eventDateTime = new Date(`${data.eventDate}T${data.eventTime}`);
        }

        if (eventDateTime <= now) {
          expiredDeletes.push(
            (async () => {
              if (data.bannerImage) {
                try {
                  await deleteObject(ref(storage, data.bannerImage));
                } catch {
                  // Storage URL çözümlenemezse sessizce geç
                }
              }
              await deleteDoc(doc(db, 'cafes', cafeId, 'events', docSnap.id));
            })()
          );
        } else {
          upcoming.push({ id: docSnap.id, ...data });
        }
      });

      if (expiredDeletes.length > 0) {
        await Promise.all(expiredDeletes);
        // Silme snapshot'ı yeniden tetikler, liste oradan güncellenir
      } else {
        upcoming.sort(
          (a, b) =>
            new Date(`${a.eventDate}T${a.eventTime}`).getTime() -
            new Date(`${b.eventDate}T${b.eventTime}`).getTime()
        );
        setEvents(upcoming);
        setLoading(false);
      }
    });

    setUnsubscribe(() => unsubFunc);
  };

  // Component mount
  useEffect(() => {
    loadEvents();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafeId]);

  // Image select handler
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Görsel boyutu 5MB\'dan küçük olmalıdır');
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Lütfen geçerli bir görsel dosyası seçiniz');
        return;
      }

      // Preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({
          ...prev,
          eventImage: file,
          imagePreview: reader.result as string,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Form input handler
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Upload image to Firebase Storage
  const uploadImage = async (): Promise<string> => {
    if (!formData.eventImage || !cafeId) return '';

    try {
      const timestamp = Date.now();
      const storageRef = ref(
        storage,
        `events/${cafeId}/${timestamp}_${formData.eventImage.name}`
      );

      const snapshot = await uploadBytes(storageRef, formData.eventImage);
      const downloadURL = await getDownloadURL(snapshot.ref);

      return downloadURL;
    } catch (error) {
      console.error('Resim yüklenirken hata:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Resim yüklenirken hata oluştu');
    }
  };

  // Save event
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);

    if (!isFormValid) return;

    setSubmitting(true);

    try {
      // 1️⃣ Görseli yükle
      const imageUrl = await uploadImage();

      // 2️⃣ Firestore'a yazılacak event objesi
      const eventDateTime = new Date(`${formData.eventDate}T${formData.eventTime}`);
      const eventData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        bannerImage: imageUrl,
        eventDate: formData.eventDate,
        eventTime: formData.eventTime,
        isActive: true,
        createdAt: Timestamp.now(),
        deleteAt: Timestamp.fromDate(eventDateTime), // Firestore TTL bu alana bakarak siler
      };

      // 3️⃣ Firestore'a yazılacak path: cafes/{cafeId}/events
      const eventsRef = collection(db, 'cafes', cafeId!, 'events');
      await addDoc(eventsRef, eventData);

      // Form sıfırla
      setFormData({
        title: '',
        description: '',
        eventDate: '',
        eventTime: '',
        eventImage: null,
        imagePreview: '',
      });
      setSubmitAttempted(false);
      setSuccessMessage('Etkinlik başarıyla oluşturuldu!');
      setTimeout(() => setSuccessMessage(''), 4000);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Etkinlik kaydedilirken hata:', error);
      alert('Etkinlik kaydedilirken hata oluştu. Lütfen tekrar deneyiniz.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete event
  const handleDeleteEvent = async (eventId: string, imageUrl: string) => {
    if (!confirm('Bu etkinliği silmek istediğinize emin misiniz?')) {
      return;
    }

    try {
      setSubmitting(true);

      // 1️⃣ Storage'dan görseli sil
      if (imageUrl) {
        try {
          const imageRef = ref(storage, imageUrl);
          await deleteObject(imageRef);
        } catch (error) {
          console.warn('Görsel silinirken hata:', error);
        }
      }

      // 2️⃣ Firestore'dan event'i sil
      const eventRef = doc(db, 'cafes', cafeId!, 'events', eventId);
      await deleteDoc(eventRef);

      setSuccessMessage('Etkinlik silindi.');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Etkinlik silinirken hata:', error);
      alert('Etkinlik silinirken hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle event status
  const handleToggleEventStatus = async (
    eventId: string,
    currentStatus: boolean
  ) => {
    try {
      setSubmitting(true);
      const eventRef = doc(db, 'cafes', cafeId!, 'events', eventId);
      await updateDoc(eventRef, {
        isActive: !currentStatus,
      });
    } catch (error) {
      console.error('Etkinlik durumu güncellenirken hata:', error);
      alert('Etkinlik durumu güncellenirken hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  if (!cafeId) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-600">Mağaza yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* CREATE EVENT FORM */}
      <section className={`${shellCardClass()} overflow-hidden`}>
        <SectionTitle
          eyebrow="Etkinlikler"
          title="Yeni etkinlik oluştur"
          description="Mağazanız için etkinlik duyurusu oluşturun. Görsel, tarih ve saati belirterek müşterilerinize duyurun."
        />

        <form onSubmit={handleSaveEvent} className="space-y-5 p-6">

          {/* Başarı mesajı */}
          {successMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              ✅ {successMessage}
            </div>
          )}

          {/* Başlık */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              Etkinlik Başlığı *
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              placeholder="Örn: Canlı Müzik Gecesi"
              disabled={submitting}
              className={`w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 disabled:opacity-60 ${
                submitAttempted && errors.title
                  ? 'border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-100'
                  : 'border-slate-200 bg-white focus:border-emerald-500 focus:ring-emerald-100'
              }`}
            />
            {submitAttempted && errors.title && (
              <p className="mt-1.5 text-xs font-medium text-red-500">{errors.title}</p>
            )}
          </div>

          {/* Açıklama */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              Etkinlik Açıklaması *
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Etkinliğin detaylı açıklamasını giriniz..."
              rows={4}
              disabled={submitting}
              className={`w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 disabled:opacity-60 ${
                submitAttempted && errors.description
                  ? 'border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-100'
                  : 'border-slate-200 bg-white focus:border-emerald-500 focus:ring-emerald-100'
              }`}
            />
            {submitAttempted && errors.description && (
              <p className="mt-1.5 text-xs font-medium text-red-500">{errors.description}</p>
            )}
          </div>

          {/* Tarih & Saat */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                Etkinlik Tarihi *
              </label>
              <input
                type="date"
                name="eventDate"
                value={formData.eventDate}
                min={today}
                onChange={handleInputChange}
                disabled={submitting}
                className={`w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 outline-none transition focus:ring-4 disabled:opacity-60 ${
                  submitAttempted && errors.eventDate
                    ? 'border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-100'
                    : 'border-slate-200 bg-white focus:border-emerald-500 focus:ring-emerald-100'
                }`}
              />
              {submitAttempted && errors.eventDate && (
                <p className="mt-1.5 text-xs font-medium text-red-500">{errors.eventDate}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                Etkinlik Saati *
              </label>
              <input
                type="time"
                name="eventTime"
                value={formData.eventTime}
                onChange={handleInputChange}
                disabled={submitting}
                className={`w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 outline-none transition focus:ring-4 disabled:opacity-60 ${
                  submitAttempted && errors.eventTime
                    ? 'border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-100'
                    : 'border-slate-200 bg-white focus:border-emerald-500 focus:ring-emerald-100'
                }`}
              />
              {submitAttempted && errors.eventTime && (
                <p className="mt-1.5 text-xs font-medium text-red-500">{errors.eventTime}</p>
              )}
            </div>
          </div>

          {/* Görsel */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              Etkinlik Görseli (Banner) *
            </label>
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  submitAttempted && errors.eventImage
                    ? 'border-red-400 bg-red-50 text-red-600 hover:bg-red-100'
                    : formData.eventImage
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {formData.eventImage
                  ? '✓ Görsel Seçildi — Değiştirmek için tıkla'
                  : 'Görsel Seç (maks. 5MB)'}
              </button>
              {submitAttempted && errors.eventImage && (
                <p className="text-xs font-medium text-red-500">{errors.eventImage}</p>
              )}
              {formData.imagePreview && (
                <div className="relative h-48 w-full overflow-hidden rounded-2xl bg-slate-100">
                  <Image src={formData.imagePreview} alt="Önizleme" fill className="object-cover" />
                </div>
              )}
            </div>
          </div>

          {/* Kaydet Butonu */}
          <div className="border-t border-slate-200 pt-5">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Kaydediliyor...
                </>
              ) : (
                'Etkinliği Kaydet'
              )}
            </button>
            {submitAttempted && !isFormValid && (
              <p className="mt-2 text-center text-xs text-red-500">
                Lütfen tüm zorunlu alanları doldurun.
              </p>
            )}
          </div>
        </form>
      </section>

      {/* EVENTS LIST */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              Etkinlik Listesi
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              Oluşturulan etkinlikler
            </h2>
          </div>
          {events.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm">
              {events.length} etkinlik
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              <p className="text-sm font-medium text-slate-600">
                Etkinlikler yükleniyor...
              </p>
            </div>
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center">
            <p className="text-sm font-medium text-slate-500">
              Henüz hiç etkinlik oluşturulmamış.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Yukarıdaki formu kullanarak ilk etkinliğini oluşturabilirsin.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <div
                key={event.id}
                className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
              >
                {/* Event Image */}
                {event.bannerImage && (
                  <div className="relative h-40 w-full bg-slate-100">
                    <Image
                      src={event.bannerImage}
                      alt={event.title}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute right-3 top-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                          event.isActive
                            ? 'border border-emerald-200 bg-emerald-100 text-emerald-700'
                            : 'border border-slate-200 bg-white/90 text-slate-500'
                        }`}
                      >
                        {event.isActive ? 'Aktif' : 'Pasif'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Event Details */}
                <div className="space-y-3 p-5">
                  <h3 className="line-clamp-2 text-base font-semibold text-slate-900">
                    {event.title}
                  </h3>

                  <p className="line-clamp-2 text-sm leading-6 text-slate-500">
                    {event.description}
                  </p>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">Tarih:</span>
                      <span>{event.eventDate}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">Saat:</span>
                      <span>{event.eventTime}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 border-t border-slate-200 pt-4">
                    <button
                      onClick={() =>
                        handleToggleEventStatus(event.id, event.isActive)
                      }
                      disabled={submitting}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {event.isActive ? 'Pasife Al' : 'Aktif Et'}
                    </button>

                    <button
                      onClick={() =>
                        handleDeleteEvent(event.id, event.bannerImage)
                      }
                      disabled={submitting}
                      className="flex-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Sil
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
