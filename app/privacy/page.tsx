import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gizlilik Politikası & KVKK — LoopyGo",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f6f8fa] px-4 py-12">
      <div className="mx-auto max-w-2xl">

        {/* Başlık */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-bold text-white shadow-sm">
            L
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">LoopyGo</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Gizlilik Politikası & KVKK</h1>
          <p className="mt-1 text-sm text-slate-500">Son güncelleme: Nisan 2025</p>
        </div>

        <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm text-sm leading-7 text-slate-700">

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">1. Veri Sorumlusu</h2>
            <p>
              LoopyGo uygulaması ("Uygulama") kapsamında kişisel verileriniz, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca <strong>LoopyGo</strong> tarafından veri sorumlusu sıfatıyla işlenmektedir.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">2. Toplanan Veriler</h2>
            <p>Uygulama aracılığıyla aşağıdaki kişisel veriler işlenebilir:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Ad, soyad ve e-posta adresi</li>
              <li>Uygulama kullanım verileri (ziyaret sayısı, puan bilgisi, kampanya etkileşimleri)</li>
              <li>Konum verisi (yalnızca yakın kafe önerisi için, izin verilmesi halinde)</li>
              <li>Cihaz bilgileri (işletim sistemi, uygulama versiyonu)</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">3. Verilerin İşlenme Amaçları</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Sadakat programı ve puan takibinin yürütülmesi</li>
              <li>Kampanya ve etkinlik bildirimlerinin iletilmesi</li>
              <li>Uygulama performansının iyileştirilmesi</li>
              <li>Yasal yükümlülüklerin yerine getirilmesi</li>
              <li>Kullanıcı destek taleplerinin karşılanması</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">4. Verilerin Aktarımı</h2>
            <p>
              Kişisel verileriniz; hizmet alınan altyapı sağlayıcıları (Google Firebase dahil), yasal zorunluluk halinde yetkili kamu kurum ve kuruluşları ile paylaşılabilir. Verileriniz üçüncü taraf reklam amaçlı olarak satılmaz veya kiralanmaz.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">5. Verilerin Saklanması</h2>
            <p>
              Kişisel verileriniz, hizmet ilişkisinin devamı süresince ve akabinde yasal saklama yükümlülükleri kapsamında saklanır. Hesabınızı silmeniz halinde verileriniz yasal süreler saklı kalmak kaydıyla silinir.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">6. Çerezler (Cookies)</h2>
            <p>
              Uygulama, oturum yönetimi ve performans ölçümü amacıyla çerez ve benzeri teknolojiler kullanabilir. Bu teknolojiler cihaz ayarlarınızdan yönetilebilir.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">7. KVKK Kapsamındaki Haklarınız</h2>
            <p>KVKK'nın 11. maddesi uyarınca aşağıdaki haklara sahipsiniz:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
              <li>İşlenmişse buna ilişkin bilgi talep etme</li>
              <li>Verilerinizin düzeltilmesini veya silinmesini isteme</li>
              <li>İşlemenin kısıtlanmasını talep etme</li>
              <li>Verilerinizin aktarıldığı kişilerin bildirilmesini isteme</li>
              <li>Otomatik işleme sonucuna itiraz etme</li>
            </ul>
            <p className="mt-3">
              Bu haklarınızı kullanmak için <strong>destek@loopygo.com</strong> adresine yazabilirsiniz.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">8. Değişiklikler</h2>
            <p>
              Bu politika zaman zaman güncellenebilir. Önemli değişiklikler uygulama üzerinden bildirilir. Güncel politikayı düzenli olarak incelemenizi öneririz.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">9. İletişim</h2>
            <p>
              Gizlilik politikamıza ilişkin sorularınız için:<br />
              <strong>E-posta:</strong> destek@loopygo.com
            </p>
          </section>

        </div>

        <p className="mt-8 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} LoopyGo · Tüm hakları saklıdır.
        </p>
      </div>
    </main>
  );
}
