"use client";

import { useState } from "react";
import Link from "next/link";
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Step = "form" | "success";

export default function RegisterPage() {
  const [step, setStep] = useState<Step>("form");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  async function handleRegister() {
    setErrorText("");

    if (!fullName.trim()) { setErrorText("Ad soyad boş olamaz."); return; }
    if (!email.trim()) { setErrorText("Email boş olamaz."); return; }
    if (password.length < 6) { setErrorText("Şifre en az 6 karakter olmalı."); return; }
    if (password !== passwordConfirm) { setErrorText("Şifreler eşleşmiyor."); return; }

    setLoading(true);

    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = credential.user;

      await sendEmailVerification(user);

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        role: "user",
        isActive: true,
        pendingOwnerRequest: true,
        cafeId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await auth.signOut();
      setStep("success");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/email-already-in-use") {
        setErrorText("Bu email adresi zaten kayıtlı.");
      } else if (code === "auth/invalid-email") {
        setErrorText("Geçersiz email adresi.");
      } else if (code === "auth/weak-password") {
        setErrorText("Şifre çok zayıf, daha güçlü bir şifre seç.");
      } else {
        setErrorText("Kayıt sırasında hata oluştu. Lütfen tekrar dene.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (step === "success") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8fa] p-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-bold text-white shadow-sm">
            S
          </div>
          <div className="rounded-3xl border border-emerald-200 bg-white p-8 shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900">Başvurunuz alındı!</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Hesabınız oluşturuldu. Kafe panelinize erişim için admin onayı bekleniyor.
              Onay sonrası aynı email ve şifre ile giriş yapabilirsiniz.
            </p>
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-700">
              ⏳ Onay süreci genellikle 1 iş günü içinde tamamlanır.
            </div>
            <Link
              href="/login"
              className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Giriş Sayfasına Dön
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8fa] p-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-bold text-white shadow-sm">
            L
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">LoopyGo</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Kafe Sahibi Başvurusu</h1>
          <p className="mt-1 text-sm text-slate-500">
            Hesap oluşturun, admin onayından sonra panele erişin.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

          {errorText && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {errorText}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">Ad Soyad</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ahmet Yılmaz"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@mail.com"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">Şifre</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="En az 6 karakter"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">Şifre Tekrar</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                placeholder="Şifreyi tekrar girin"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </div>

            <button
              type="button"
              onClick={handleRegister}
              disabled={loading}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Başvuru gönderiliyor...
                </>
              ) : (
                "Başvuru Gönder"
              )}
            </button>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4 text-center text-sm text-slate-500">
            Zaten hesabınız var mı?{" "}
            <Link href="/login" className="font-semibold text-emerald-600 hover:text-emerald-700">
              Giriş yapın
            </Link>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Başvuru yaparak{" "}
          <Link href="/terms" target="_blank" className="underline underline-offset-2 hover:text-slate-600">
            Kullanım Koşulları
          </Link>
          {" "}ve{" "}
          <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-slate-600">
            Gizlilik Politikası
          </Link>
          &apos;nı kabul etmiş olursunuz.
        </p>
      </div>
    </main>
  );
}
