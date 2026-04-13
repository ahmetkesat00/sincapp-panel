"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  async function handleLogin() {
    setErrorText("");

    if (!email.trim() || !password.trim()) {
      setErrorText("Email ve şifre boş olamaz.");
      return;
    }

    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = credential.user;

      const userSnap = await getDoc(doc(db, "users", user.uid));

      if (!userSnap.exists()) {
        setErrorText("Kullanıcı kaydı bulunamadı.");
        setLoading(false);
        return;
      }

      const role = userSnap.data().role;

      if (role === "admin") {
        router.replace("/admin");
      } else if (role === "owner") {
        router.replace("/dashboard");
      } else {
        setErrorText("Bu panele erişim yetkiniz yok.");
        await auth.signOut();
      }
    } catch (err: unknown) {
      console.error(err);
      setErrorText("Email veya şifre hatalı.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8fa] p-4">
      <div className="w-full max-w-sm">

        {/* Logo / Başlık */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-bold text-white shadow-sm">
            S
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
            SincApp
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">
            Panel Girişi
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Owner veya Admin hesabınızla giriş yapın
          </p>
        </div>

        {/* Kart */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

          {errorText && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {errorText}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="ornek@mail.com"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Şifre
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="••••••••"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </div>

            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Giriş yapılıyor...
                </>
              ) : (
                "Giriş Yap"
              )}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Admin → /admin &nbsp;·&nbsp; Owner → /dashboard
        </p>
      </div>
    </main>
  );
}