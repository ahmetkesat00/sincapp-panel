"use client";

export default function PendingScreen() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
          <span className="text-3xl">⏳</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900">İnceleme Bekleniyor</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Profilin admin tarafından inceleniyor. Onaylandığında mağazan uygulamada yayına girecek.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Bu işlem genellikle 1–2 iş günü içinde tamamlanır.
        </p>

        <div className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-left">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-3">İnceleme Adımları</p>
          <div className="space-y-2.5">
            {[
              { label: "Profil bilgileri kontrol ediliyor", done: true },
              { label: "Logo ve görsel kalitesi inceleniyor", done: true },
              { label: "Sadakat kart programı doğrulanıyor", done: true },
              { label: "Admin onayı bekleniyor", done: false },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className={`h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step.done
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-blue-100 text-blue-400"
                }`}>
                  {step.done ? "✓" : "…"}
                </div>
                <p className={`text-xs ${step.done ? "text-slate-600" : "text-slate-400"}`}>
                  {step.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-6 text-xs text-slate-400">
          Sorun için destek ekibiyle iletişime geçebilirsin.
        </p>
      </div>
    </div>
  );
}
