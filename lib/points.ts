import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export type AdjustPointsInput = {
  userUid: string;
  cafeId: string;
  stampDelta: number;
  rewardDelta?: number;
  reason?: string;
};

export type AdjustPointsResult = {
  stampsBefore: number;
  stampsAfter: number;
  rewardsBefore: number;
  rewardsAfter: number;
  earned: number;
};

/** İşletme sahibi: sadece +damga. Admin: ±damga/±ödül, açıklama zorunlu. (firebase/menu-functions/points.js) */
const adjustPointsFn = httpsCallable<AdjustPointsInput, AdjustPointsResult>(functions, "adjustPoints");

export type PhoneCustomer = {
  uid: string;
  displayName: string;
  email: string;
  phoneMasked: string;
  stamps: number;
  rewards: number;
  hasCard: boolean;
};

/** Telefon numarası Firestore'da yok, sadece Firebase Auth'ta; sunucu numarayla tek müşteriyi bulur. */
const findByPhoneFn = httpsCallable<{ phone: string; cafeId?: string }, PhoneCustomer>(functions, "findCustomerByPhone");

function friendly(err: unknown): Error {
  const msg = (err as { message?: string })?.message;
  return new Error(msg && !/^internal$/i.test(msg) ? msg : "İşlem yapılamadı. Biraz sonra tekrar deneyin.");
}

export async function adjustPoints(input: AdjustPointsInput): Promise<AdjustPointsResult> {
  try {
    return (await adjustPointsFn(input)).data;
  } catch (err) {
    throw friendly(err);
  }
}

export async function findCustomerByPhone(phone: string, cafeId?: string): Promise<PhoneCustomer> {
  try {
    return (await findByPhoneFn({ phone, ...(cafeId && { cafeId }) })).data;
  } catch (err) {
    throw friendly(err);
  }
}

/** Arama metni telefon numarasına benziyor mu (en az 10 rakam, harf yok)? */
export const looksLikePhone = (q: string) => /^[\d\s()+-]+$/.test(q.trim()) && q.replace(/\D/g, "").length >= 10;
