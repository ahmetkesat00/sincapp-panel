"use client";

type FieldStatus = {
  cafeName: boolean;
  logo: boolean;
  category: boolean;
  address: boolean;
  coords: boolean;
  openTime: boolean;
  closeTime: boolean;
  loyaltyCard: boolean;
};

const FIELD_LABELS: Record<keyof FieldStatus, string> = {
  cafeName: "Mağaza Adı",
  logo: "Logo",
  category: "Kategori",
  address: "Adres (İlçe / İl)",
  coords: "Koordinat",
  openTime: "Açılış Saati",
  closeTime: "Kapanış Saati",
  loyaltyCard: "En az 1 Sadakat Kartı",
};

type Props = {
  fields: FieldStatus;
  isRejected?: boolean;
  rejectionNote?: string;
  onSubmit: () => void;
  isSubmitting: boolean;
};

export default function SetupBanner({
  fields,
  isRejected,
  rejectionNote,
  onSubmit,
  isSubmitting,
}: Props) {
  const allFilled = Object.values(fields).every(Boolean);
  const filledCount = Object.values(fields).filter(Boolean).length;
  const totalCount = Object.keys(fields).length;

  return (
    <div className={`rounded-2xl border p-5 mb-6 ${
      isRejected
        ? "border-red-200 bg-red-50"
        : "border-amber-200 bg-amber-50"
    }`}>
      {/* Başlık */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {isRejected ? (
            <>
              <p className="text-sm font-bold text-red-700">Profil Reddedildi</p>
              {rejectionNote && (
                <p className="mt-1 text-sm text-red-600">
                  <span className="font-semibold">Sebep:</span> {rejectionNote}
                </p>
              )}
              <p className="mt-2 text-xs text-red-500">
                Aşağıdaki alanları düzenleyip tekrar incelemeye gönderebilirsin.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-amber-800">Profil Kurulumu</p>
              <p className="mt-0.5 text-xs text-amber-700">
                Mağazanı yayına alabilmek için tüm zorunlu alanları doldur.
              </p>
            </>
          )}
        </div>

        {/* İlerleme */}
        <div className="text-right shrink-0">
          <p className={`text-2xl font-bold ${allFilled ? "text-emerald-700" : "text-amber-700"}`}>
            {filledCount}/{totalCount}
          </p>
          <p className="text-[10px] text-slate-500">alan dolu</p>
        </div>
      </div>

      {/* Checklist */}
      <div className="mt-4 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {(Object.keys(fields) as (keyof FieldStatus)[]).map((key) => (
          <div
            key={key}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium ${
              fields[key]
                ? "bg-emerald-100 text-emerald-700"
                : "bg-white border border-slate-200 text-slate-500"
            }`}
          >
            <span>{fields[key] ? "✓" : "○"}</span>
            <span>{FIELD_LABELS[key]}</span>
          </div>
        ))}
      </div>

      {/* Submit butonu */}
      <div className="mt-4">
        <button
          onClick={onSubmit}
          disabled={!allFilled || isSubmitting}
          className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
            isRejected
              ? "bg-red-600 hover:bg-red-700"
              : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {isSubmitting ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Gönderiliyor…
            </>
          ) : isRejected ? (
            "Tekrar İncelemeye Gönder"
          ) : (
            "İncelemeye Gönder"
          )}
        </button>
        {!allFilled && (
          <p className="mt-1.5 text-xs text-slate-500">
            Tüm alanlar doldurulduğunda buton aktif olur.
          </p>
        )}
      </div>
    </div>
  );
}
