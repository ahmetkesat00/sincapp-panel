"use client";

import { useState } from "react";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth } from "@/lib/firebase";
import SectionTitle from "../ui/section-title";
import { shellCardClass, fieldClass } from "../helpers";

type Props = {
  uid: string;
  cafeId: string;
  chain: { id: string; name: string; branchCafeIds: string[] } | null;
  pendingBranchRequest: boolean;
  requestingBranch: boolean;
  branchRequestMessage: string;
  onRequestBranch: () => void;
};

export default function SettingsTab({ uid, cafeId, chain, pendingBranchRequest, requestingBranch, branchRequestMessage, onRequestBranch }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");

  async function handleChangePassword() {
    setMessage("");
    setErrorText("");

    if (!currentPassword) { setErrorText("Mevcut şifrenizi girin."); return; }
    if (newPassword.length < 6) { setErrorText("Yeni şifre en az 6 karakter olmalı."); return; }
    if (newPassword !== confirmPassword) { setErrorText("Yeni şifreler eşleşmiyor."); return; }
    if (currentPassword === newPassword) { setErrorText("Yeni şifre eskiyle aynı olamaz."); return; }

    const user = auth.currentUser;
    if (!user || !user.email) { setErrorText("Oturum bilgisi alınamadı."); return; }

    setSaving(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setMessage("Şifreniz başarıyla güncellendi.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setErrorText("Mevcut şifre hatalı.");
      } else if (code === "auth/too-many-requests") {
        setErrorText("Çok fazla deneme. Lütfen bir süre bekleyin.");
      } else {
        setErrorText("Şifre güncellenirken hata oluştu.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <section className={`${shellCardClass()} overflow-hidden`}>
        <SectionTitle
          eyebrow="Güvenlik"
          title="Şifre değiştir"
          description="Mevcut şifrenizi doğrulayarak yeni bir şifre belirleyin."
        />
        <div className="space-y-4 p-6">

          {errorText && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {errorText}
            </div>
          )}
          {message && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {message}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Mevcut Şifre</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              className={fieldClass()}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Yeni Şifre</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="En az 6 karakter"
              className={fieldClass()}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Yeni Şifre Tekrar</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
              placeholder="Yeni şifreyi tekrar girin"
              className={fieldClass()}
            />
          </div>

          <button
            type="button"
            onClick={handleChangePassword}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Güncelleniyor...
              </>
            ) : (
              "Şifreyi Güncelle"
            )}
          </button>
        </div>
      </section>
      {/* Zincir / Şube Talebi */}
      <section className={`${shellCardClass()} overflow-hidden`}>
        <SectionTitle
          eyebrow="Zincir Yönetimi"
          title={chain ? `${chain.name} · ${chain.branchCafeIds.length} şube` : "Zincir İşletme"}
          description={
            chain
              ? "Zincirinize yeni bir şube eklemek için talep gönderin. Admin onayladıktan sonra şube panelinize eklenir."
              : "Birden fazla şubeniz mi var? Talep gönderin, admin onayladıktan sonra tüm şubelerinizi tek panelden yönetebilirsiniz."
          }
        />
        <div className="p-6 space-y-3">
          {branchRequestMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {branchRequestMessage}
            </div>
          )}
          {pendingBranchRequest ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
              {chain ? "Şube talebiniz inceleniyor..." : "Zincir talebiniz inceleniyor..."}
            </div>
          ) : (
            <button
              type="button"
              onClick={onRequestBranch}
              disabled={requestingBranch}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {requestingBranch ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Gönderiliyor...
                </>
              ) : chain ? "Yeni Şube Talebi Gönder" : "Zincir Başvurusu Gönder"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
