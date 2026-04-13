import { Timestamp } from "firebase/firestore";

export function shellCardClass() {
  return "rounded-3xl border border-slate-200 bg-white shadow-sm";
}

export function fieldClass() {
  return "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";
}

export function ghostButtonClass() {
  return "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50";
}

export function primaryButtonClass() {
  return "inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700";
}

export function formatTimestamp(ts?: Timestamp | null): string {
  if (!ts) return "Henüz yok";
  try {
    return ts.toDate().toLocaleString("tr-TR");
  } catch {
    return "Henüz yok";
  }
}

export function formatLocationValue(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;

  if (
    typeof value === "object" &&
    value !== null &&
    "latitude" in value &&
    "longitude" in value
  ) {
    const v = value as { latitude: number; longitude: number };
    return `${v.latitude}, ${v.longitude}`;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "_lat" in value &&
    "_long" in value
  ) {
    const v = value as { _lat: number; _long: number };
    return `${v._lat}, ${v._long}`;
  }

  return "";
}