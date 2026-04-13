"use client";

import SectionTitle from "../ui/section-title";
import Toggle from "../ui/toggle";
import { fieldClass, primaryButtonClass, shellCardClass } from "../helpers";

type Props = {
  uid: string;
  cafeId: string;
};

export default function SettingsTab({ uid, cafeId }: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className={`${shellCardClass()} overflow-hidden`}>
        <SectionTitle
          eyebrow="Hesap"
          title="Panel ayarları"
          description="Şimdilik owner kullanıcı verisinin yalnızca bir kısmı mevcut."
        />
        <div className="space-y-4 p-6">
          <input className={fieldClass()} value={uid} readOnly />
          <input className={fieldClass()} value={cafeId} readOnly />
          <button type="button" className={primaryButtonClass()}>
            Hesap Bilgilerini Güncelle
          </button>
        </div>
      </section>

      <section className={`${shellCardClass()} overflow-hidden`}>
        <SectionTitle
          eyebrow="Bildirimler"
          title="Uyarı tercihleri"
          description="Bildirim verileri henüz bağlı değil, alanları koruyoruz."
        />
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Kampanya bildirimi
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Kampanya performansı değiştiğinde haber ver.
              </p>
            </div>
            <Toggle checked={false} onChange={() => {}} />
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Günlük rapor özeti
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Gün sonu işletme özetini panel içinde göster.
              </p>
            </div>
            <Toggle checked={false} onChange={() => {}} />
          </div>
        </div>
      </section>
    </div>
  );
}