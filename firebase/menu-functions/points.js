// Panelden manuel yıldız düzeltme (adjustPoints).
// Puan mantığı cafe_loyalty_app/functions/index.js → applyStampOrRedeemTx ile aynı tutulur:
//   - zincir şubelerinde puan dokümanı chainId'dir, değilse cafeId
//   - yıldız rewardBuy'a ulaşınca ödüle dönüşür
//   - stamps ve rewards ikisi de 0 olursa doküman silinir
//   - günlük damga limiti sayacı: dailyStampCounters/{cafeId}_{uid}_{YYYY-MM-DD}
//
// Yetki:
//   admin → ±yıldız, ±ödül, açıklama zorunlu, günlük limite takılmaz
//   owner → sadece kendi işletmesinde +yıldız (1..OWNER_MAX), günlük limite uyar

const { HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const OWNER_MAX = 10;
const ADMIN_MAX_STAMPS = 100;
const ADMIN_MAX_REWARDS = 20;
const DAILY_STAMP_COUNTER_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const istanbulDateKey = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function intInRange(v, min, max, label) {
  const n = Number(v ?? 0);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpsError("invalid-argument", `${label} ${min} ile ${max} arasında bir tam sayı olmalı.`);
  }
  return n;
}

async function resolveCafe(db, cafeId) {
  const cafeSnap = await db.collection("cafes").doc(cafeId).get();
  if (!cafeSnap.exists) throw new HttpsError("not-found", "İşletme bulunamadı.");
  const cafe = cafeSnap.data() || {};
  const chainId = cafe.chainId ? String(cafe.chainId) : null;

  let rewardBuy;
  if (chainId) {
    const chainSnap = await db.collection("chains").doc(chainId).get();
    if (!chainSnap.exists) throw new HttpsError("not-found", "Zincir bulunamadı.");
    rewardBuy = Number(chainSnap.data()?.loyaltyCard?.rewardBuy ?? 5);
  } else {
    const first = Array.isArray(cafe.loyaltyCards) && cafe.loyaltyCards.length > 0 ? cafe.loyaltyCards[0] : null;
    rewardBuy = Number(first?.rewardBuy ?? cafe.rewardBuy ?? 5);
  }
  if (!Number.isFinite(rewardBuy) || rewardBuy <= 0) throw new HttpsError("failed-precondition", "Kart hedefi (rewardBuy) geçersiz.");

  const rawLimit = cafe.dailyStampLimit;
  const dailyStampLimit = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : null;

  return { cafe, chainId, rewardBuy, dailyStampLimit, pointsDocId: chainId || cafeId };
}

async function callerRole(db, uid, cafe, cafeId) {
  const user = (await db.collection("users").doc(uid).get()).data();
  if (user?.role === "admin") return "admin";
  if (user?.role === "owner" && (user.cafeId === cafeId || cafe.ownerUid === uid)) return "owner";
  throw new HttpsError("permission-denied", "Bu işletmede damga verme yetkiniz yok.");
}

/**
 * { userUid, cafeId, stampDelta, rewardDelta?, reason? }
 * → { stampsBefore, stampsAfter, rewardsBefore, rewardsAfter, earned }
 */
async function adjustPoints(db, request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Giriş yapmalısınız.");

  const data = request.data || {};
  const userUid = String(data.userUid || "").trim();
  const cafeId = String(data.cafeId || "").trim();
  const reason = String(data.reason || "").trim().slice(0, 200);
  if (!userUid || !cafeId) throw new HttpsError("invalid-argument", "Müşteri ve işletme zorunlu.");
  if (userUid === uid) throw new HttpsError("permission-denied", "Kendinize damga veremezsiniz.");

  const { cafe, chainId, rewardBuy, dailyStampLimit, pointsDocId } = await resolveCafe(db, cafeId);
  const role = await callerRole(db, uid, cafe, cafeId);

  let stampDelta;
  let rewardDelta;
  if (role === "admin") {
    stampDelta = intInRange(data.stampDelta, -ADMIN_MAX_STAMPS, ADMIN_MAX_STAMPS, "Yıldız değişimi");
    rewardDelta = intInRange(data.rewardDelta, -ADMIN_MAX_REWARDS, ADMIN_MAX_REWARDS, "Ödül değişimi");
    if (stampDelta === 0 && rewardDelta === 0) throw new HttpsError("invalid-argument", "Değişiklik girilmedi.");
    if (reason.length < 3) throw new HttpsError("invalid-argument", "Açıklama zorunlu (en az 3 karakter).");
  } else {
    stampDelta = intInRange(data.stampDelta, 1, OWNER_MAX, "Damga sayısı");
    rewardDelta = 0;
  }

  const userSnap = await db.collection("users").doc(userUid).get();
  if (!userSnap.exists) throw new HttpsError("not-found", "Müşteri bulunamadı.");

  const pointsRef = db.collection("users").doc(userUid).collection("points").doc(pointsDocId);
  const applyDailyLimit = role === "owner" && dailyStampLimit;
  const dateKey = istanbulDateKey();
  const counterRef = db.collection("dailyStampCounters").doc(`${cafeId}_${userUid}_${dateKey}`);

  return db.runTransaction(async (t) => {
    const pointsSnap = await t.get(pointsRef);
    let usedToday = 0;
    if (applyDailyLimit) {
      usedToday = Number((await t.get(counterRef)).data()?.count ?? 0);
      if (usedToday + stampDelta > dailyStampLimit) {
        const remaining = Math.max(dailyStampLimit - usedToday, 0);
        throw new HttpsError(
          "failed-precondition",
          remaining === 0
            ? "Bu müşteri bugünkü damga limitine ulaştı."
            : `Bu işletmede müşteri başına günde en fazla ${dailyStampLimit} damga verilebilir. Bugün ${remaining} damga daha verilebilir.`,
        );
      }
    }

    const stampsBefore = Number(pointsSnap.data()?.stamps ?? 0);
    const rewardsBefore = Number(pointsSnap.data()?.rewards ?? 0);

    const rawStamps = stampsBefore + stampDelta;
    if (rawStamps < 0) throw new HttpsError("failed-precondition", `Müşterinin ${stampsBefore} yıldızı var, daha fazla düşülemez.`);
    const earned = Math.floor(rawStamps / rewardBuy);
    const stampsAfter = rawStamps % rewardBuy;
    const rewardsAfter = rewardsBefore + earned + rewardDelta;
    if (rewardsAfter < 0) throw new HttpsError("failed-precondition", `Müşterinin ${rewardsBefore + earned} ödülü var, daha fazla düşülemez.`);

    const now = admin.firestore.FieldValue.serverTimestamp();
    if (stampsAfter === 0 && rewardsAfter === 0) {
      t.delete(pointsRef);
    } else {
      t.set(
        pointsRef,
        {
          cafeId,
          ...(chainId && { chainId }),
          userUid,
          stamps: stampsAfter,
          rewards: rewardsAfter,
          updatedAt: now,
          lastCashierUid: uid,
        },
        { merge: true },
      );
    }

    // Damga eklendiyse raporlarda/işlem listelerinde görünsün diye onaylanmış bir QR işlemi gibi
    // qrTokens'a da yazılır (manual: true → panelde ✋ rozeti). Düşme/ödül düzeltmeleri ziyaret
    // sayılmaz; onlar sadece tx geçmişinde durur.
    let txId = null;
    if (stampDelta > 0) {
      const tokenRef = db.collection("qrTokens").doc();
      txId = tokenRef.id;
      t.set(tokenRef, {
        status: "processed",
        manual: true,
        source: "panel",
        manualByRole: role,
        reason: reason || null,
        cafeId,
        ...(chainId && { chainId }),
        createdBy: uid,
        createdAt: now,
        scannedUserId: userUid,
        scannedAt: now,
        processedType: "stamp",
        stampCount: stampDelta,
        processedAt: now,
        processedBy: uid,
      });
    }

    t.set(pointsRef.collection("tx").doc(), {
      type: role === "admin" ? "admin_adjust" : "manual_stamp",
      source: "panel",
      txId,
      cafeId,
      ...(chainId && { chainId }),
      userUid,
      byUid: uid,
      byRole: role,
      reason: reason || null,
      stampDelta,
      rewardDelta,
      rewardBuy,
      stampsBefore,
      stampsAfter,
      rewardsBefore,
      rewardsAfter,
      earned,
      createdAt: now,
    });

    if (applyDailyLimit) {
      t.set(
        counterRef,
        {
          cafeId,
          userUid,
          date: dateKey,
          count: usedToday + stampDelta,
          limit: dailyStampLimit,
          updatedAt: now,
          deleteAt: admin.firestore.Timestamp.fromMillis(Date.now() + DAILY_STAMP_COUNTER_TTL_MS),
        },
        { merge: true },
      );
    }

    console.log(`[adjustPoints] ${role}=${uid} user=${userUid} cafe=${cafeId} stamps ${stampsBefore}->${stampsAfter} rewards ${rewardsBefore}->${rewardsAfter}`);
    return { stampsBefore, stampsAfter, rewardsBefore, rewardsAfter, earned };
  });
}

/** "0532 123 45 67", "5321234567", "+90 532..." → "+905321234567"; geçersizse null. */
function normalizeTrPhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("90") && d.length === 12) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  return /^5\d{9}$/.test(d) ? `+90${d}` : null;
}

const maskPhone = (p) => (p ? `${p.slice(0, 6)} *** ** ${p.slice(-2)}` : "");

/**
 * Telefonla kayıtlı müşteriyi bulur (numara Firestore'da değil, sadece Firebase Auth'ta duruyor).
 * { phone, cafeId? } → { uid, displayName, email, phoneMasked, stamps, rewards, hasCard }
 * Owner: cafeId zorunlu, sadece kendi işletmesi. Admin: cafeId isteğe bağlı.
 * Telefon listesi hiçbir zaman dönülmez; sadece numarası bilinen tek müşteri.
 */
async function findCustomerByPhone(db, request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Giriş yapmalısınız.");
  const cafeId = String(request.data?.cafeId || "").trim();
  const phone = normalizeTrPhone(request.data?.phone);
  if (!phone) throw new HttpsError("invalid-argument", "Geçerli bir cep telefonu girin (örn. 0532 123 45 67).");

  let pointsDocId = null;
  const caller = (await db.collection("users").doc(uid).get()).data();
  if (cafeId) {
    const resolved = await resolveCafe(db, cafeId);
    await callerRole(db, uid, resolved.cafe, cafeId);
    pointsDocId = resolved.pointsDocId;
  } else if (caller?.role !== "admin") {
    throw new HttpsError("permission-denied", "İşletme seçilmedi.");
  }

  let authUser;
  try {
    authUser = await admin.auth().getUserByPhoneNumber(phone);
  } catch (err) {
    if (err?.code === "auth/user-not-found") throw new HttpsError("not-found", "Bu numarayla kayıtlı müşteri bulunamadı.");
    throw err;
  }

  const profile = (await db.collection("users").doc(authUser.uid).get()).data() || {};
  if (profile.role && profile.role !== "user") throw new HttpsError("not-found", "Bu numarayla kayıtlı müşteri bulunamadı.");

  const points = pointsDocId
    ? (await db.collection("users").doc(authUser.uid).collection("points").doc(pointsDocId).get()).data()
    : null;
  const name =
    profile.fullName || profile.displayName || [profile.name, profile.surname].filter(Boolean).join(" ") || authUser.displayName || "";

  return {
    uid: authUser.uid,
    displayName: name || "İsimsiz müşteri",
    email: profile.email || authUser.email || "",
    phoneMasked: maskPhone(phone),
    stamps: Number(points?.stamps ?? 0),
    rewards: Number(points?.rewards ?? 0),
    hasCard: !!points,
  };
}

module.exports = { adjustPoints, findCustomerByPhone, normalizeTrPhone };
