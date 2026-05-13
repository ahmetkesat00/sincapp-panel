import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kullanım Koşulları — LoopyGo",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f6f8fa] px-4 py-12">
      <div className="mx-auto max-w-2xl">

        {/* Başlık */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-bold text-white shadow-sm">
            L
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">LoopyGo</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Kullanım Koşulları</h1>
          <p className="mt-1 text-sm text-slate-500">Son güncelleme: Nisan 2025</p>
        </div>

        <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm text-sm leading-7 text-slate-700">

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">1. Kabul</h2>
            <p>
              LoopyGo uygulamasını ("Uygulama") indirerek veya kullanarak bu Kullanım Koşulları'nı kabul etmiş olursunuz. Koşulları kabul etmiyorsanız uygulamayı kullanmayınız.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">2. Hizmet Tanımı</h2>
            <p>
              LoopyGo; katılımcı kafeler ve işletmeler için sadakat kart programı, kampanya takibi ve etkinlik duyurusu hizmetleri sunan bir mobil uygulamadır. Uygulama üzerinden puan kazanabilir, ödüller edinebilir ve işletme kampanyalarını takip edebilirsiniz.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">3. Hesap Oluşturma</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Uygulamayı kullanmak için geçerli bir e-posta adresiyle kayıt olmanız gerekmektedir.</li>
              <li>Hesabınızın güvenliğinden siz sorumlusunuz; şifrenizi kimseyle paylaşmayınız.</li>
              <li>Yanlış veya yanıltıcı bilgi vermeniz hesabınızın askıya alınmasına yol açabilir.</li>
              <li>18 yaşından küçük kullanıcılar ebeveyn/vasi onayı ile uygulamayı kullanabilir.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">4. Sadakat Programı Kuralları</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Puan ve damgalar yalnızca katılımcı işletmelerde gerçekleştirilen satın alımlarla kazanılır.</li>
              <li>Kazanılan puanlar/damgalar nakit veya başka bir ödeme aracına çevrilemez.</li>
              <li>Her işletme kendi puan son kullanma tarihini belirleyebilir.</li>
              <li>Sahte işlem veya sistemi manipüle etme girişimleri hesap kapatma ile sonuçlanır.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">5. Yasaklı Kullanımlar</h2>
            <p>Aşağıdaki eylemler kesinlikle yasaktır:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Başka kullanıcıların hesaplarına yetkisiz erişim</li>
              <li>Uygulama sistemini veya altyapısını bozmaya yönelik girişimler</li>
              <li>Sahte puan/damga üretimi veya manipülasyonu</li>
              <li>Uygulamanın ticari amaçlarla izinsiz kullanımı</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">6. Fikri Mülkiyet</h2>
            <p>
              Uygulama içeriği, tasarımı, logosu ve yazılımı LoopyGo'ya aittir. İzinsiz kopyalanamaz, dağıtılamaz veya değiştirilemez.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">7. Hizmet Değişiklikleri ve Kesintiler</h2>
            <p>
              LoopyGo, önceden bildirimde bulunmaksızın hizmeti geçici veya kalıcı olarak değiştirme, askıya alma ya da sonlandırma hakkını saklı tutar. Bu durumlardan doğan zararlardan LoopyGo sorumlu tutulamaz.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">8. Sorumluluk Sınırlaması</h2>
            <p>
              LoopyGo, kullanıcıların uygulama kullanımından doğan dolaylı, arızi veya sonuçsal zararlardan sorumlu değildir. Katılımcı işletmelerin sunduğu ürün ve hizmetlerin kalitesinden LoopyGo sorumlu tutulamaz.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">9. Hesap Silme</h2>
            <p>
              Hesabınızı uygulama ayarları üzerinden veya <strong>destek@loopygo.com</strong> adresine e-posta göndererek silebilirsiniz. Hesap silinmesi halinde puan ve ödül geçmişiniz kalıcı olarak silinir.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">10. Uygulanacak Hukuk</h2>
            <p>
              Bu koşullar Türkiye Cumhuriyeti hukukuna tabidir. Uyuşmazlıklarda Türkiye mahkemeleri yetkilidir.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-slate-900">11. İletişim</h2>
            <p>
              Kullanım koşullarına ilişkin sorularınız için:<br />
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
