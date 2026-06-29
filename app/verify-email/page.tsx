"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, sendEmailVerification, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      if (user.emailVerified) {
        router.replace("/dashboard");
        return;
      }
      setEmail(user.email ?? "");
    });
    return () => unsub();
  }, [router]);

  async function handleResend() {
    const user = auth.currentUser;
    if (!user) return;
    setSending(true);
    try {
      await sendEmailVerification(user);
      setSent(true);
    } catch {
      // rate limit vs. — sessizce geç
    } finally {
      setSending(false);
    }
  }

  async function handleCheckVerified() {
    const user = auth.currentUser;
    if (!user) return;
    setChecking(true);
    await user.reload();
    if (user.emailVerified) {
      router.replace("/dashboard");
    } else {
      setChecking(false);
      alert("Email henüz doğrulanmamış. Lütfen gelen kutunuzu kontrol edin.");
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8fa] p-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-bold text-white shadow-sm">
          L
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <h2 className="text-lg font-bold text-slate-900">Email adresinizi doğrulayın</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            <span className="font-semibold text-slate-700">{email}</span> adresine bir doğrulama bağlantısı gönderildi. Panele erişmek için emailinizi doğrulayın.
          </p>

          {sent && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">
              ✅ Doğrulama emaili tekrar gönderildi.
            </div>
          )}

          <div className="mt-6 space-y-3">
            <button
              onClick={handleCheckVerified}
              disabled={checking}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {checking ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Kontrol ediliyor...
                </>
              ) : "Doğruladım, devam et"}
            </button>

            <button
              onClick={handleResend}
              disabled={sending || sent}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {sending ? "Gönderiliyor..." : "Emaili tekrar gönder"}
            </button>

            <button
              onClick={handleSignOut}
              className="text-xs text-slate-400 hover:text-slate-600 transition"
            >
              Çıkış yap
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
