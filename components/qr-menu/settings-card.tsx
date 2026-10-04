"use client";

import { ExternalLink, Save } from "lucide-react";
import { useState } from "react";
import { isValidSlug, slugify } from "@/lib/qr-menu/firestore";
import { MENU_BASE_URL, type QrMenuSettings } from "@/lib/qr-menu/types";
import { Field, LocalizedInput, Toggle, inputCls, primaryBtnCls, smallBtnCls } from "./ui";

type Props = {
  cafeName: string;
  initial: QrMenuSettings;
  savedSlug: string | null;
  onSave: (settings: QrMenuSettings) => Promise<void>;
};

export default function SettingsCard({ cafeName, initial, savedSlug, onSave }: Props) {
  const [s, setS] = useState<QrMenuSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof QrMenuSettings>(key: K, value: QrMenuSettings[K]) => {
    setS((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const hasEn = s.locales.includes("en");
  const slugOk = isValidSlug(s.slug);
  const slugChanged = savedSlug !== null && savedSlug !== s.slug;

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      await onSave(s);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ayarlar kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
        <Toggle checked={s.enabled} onChange={(v) => set("enabled", v)} label={s.enabled ? "Menü yayında" : "Menü yayında değil"} />
        <span className="text-xs text-slate-500">Kapalıyken menü linki ve QR kodlar menüyü açmaz.</span>
      </div>

      <Field label="Menü linki" hint="Sadece küçük harf, rakam ve tire. Değiştirirseniz eski link yeni linke yönlendirilmeye devam eder.">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-xl border border-slate-200 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-100">
            <span className="shrink-0 bg-slate-50 px-3 py-2 text-sm text-slate-500">{MENU_BASE_URL.replace(/^https?:\/\//, "")}/</span>
            <input
              value={s.slug}
              onChange={(e) => set("slug", e.target.value.toLowerCase())}
              className="min-w-0 flex-1 px-2 py-2 text-sm outline-none"
            />
          </div>
          <button type="button" className={smallBtnCls} onClick={() => set("slug", slugify(cafeName))}>
            İsimden oluştur
          </button>
          {savedSlug && (
            <a href={`${MENU_BASE_URL}/${savedSlug}`} target="_blank" rel="noopener noreferrer" className={smallBtnCls}>
              <ExternalLink className="h-3.5 w-3.5" />
              Aç
            </a>
          )}
        </div>
        {!slugOk && s.slug && <span className="mt-1 block text-xs font-medium text-red-600">Geçersiz link adı.</span>}
        {slugChanged && slugOk && (
          <span className="mt-1 block text-xs font-medium text-amber-700">
            Link değişecek: /{savedSlug} → /{s.slug}. Basılı QR kodlar etkilenmez.
          </span>
        )}
      </Field>

      <Field label="Kısa tanıtım (kapak altında)">
        <LocalizedInput value={s.tagline} onChange={(v) => set("tagline", v)} placeholder="Nitelikli kahve, ev yapımı tatlılar" showEn={hasEn} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Telefon">
          <input value={s.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="+90 216 000 00 00" className={inputCls} />
        </Field>
        <Field label="Wi-Fi ağ adı">
          <input
            value={s.wifi?.ssid ?? ""}
            onChange={(e) => set("wifi", e.target.value ? { ...s.wifi, ssid: e.target.value } : undefined)}
            className={inputCls}
          />
        </Field>
        <Field label="Wi-Fi şifresi">
          <input
            value={s.wifi?.password ?? ""}
            disabled={!s.wifi?.ssid}
            onChange={(e) => s.wifi && set("wifi", { ...s.wifi, password: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <div>
          <span className="mb-1 block text-xs font-semibold text-slate-700">Tema renkleri</span>
          <div className="flex gap-3">
            {(
              [
                ["primary", "Ana"],
                ["primaryDark", "Koyu"],
                ["accent", "Vurgu"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="color"
                  value={s.theme[key]}
                  onChange={(e) => set("theme", { ...s.theme, [key]: e.target.value })}
                  className="h-8 w-10 cursor-pointer rounded-lg border border-slate-200"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <Toggle checked={hasEn} onChange={(v) => set("locales", v ? ["tr", "en"] : ["tr"])} label="İngilizce menü" />
        <p className="text-xs text-slate-500">
          Fiyat güncelleme tarihi: <span className="font-semibold text-slate-700">{s.pricesUpdatedAt}</span>
        </p>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="button" onClick={submit} disabled={saving || !slugOk} className={primaryBtnCls}>
          <Save className="h-4 w-4" />
          {saving ? "Kaydediliyor…" : "Ayarları kaydet"}
        </button>
        {saved && <span className="text-sm font-medium text-emerald-700">Kaydedildi</span>}
      </div>
    </div>
  );
}
