// LoopyGo QR menü fonksiyonları ("menu" codebase). Uygulamanın fonksiyonlarından ayrı deploy edilir:
//   cd firebase && firebase deploy --only functions:menu
// Diğer fonksiyonlar (damga, Apple Wallet vb.) cafe_loyalty_app/functions'ta; bu deploy onlara dokunmaz.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { extractMenu, fetchMenuUrl, ExtractError, MODEL } = require("./extract");

admin.initializeApp();
const db = admin.firestore();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const REGION = "europe-west1";

/** Kafe başına günlük menü okuma hakkı (adminler hariç). */
const DAILY_LIMIT = 5;
const MAX_FILES = 10;
/** Base64 metin olarak toplam boyut (~15 MB dosya). */
const MAX_TOTAL_BASE64 = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Sadece adminler ve kafenin sahibi o kafenin menüsünü içe aktarabilir. */
async function assertCanEditCafe(uid, cafeId) {
  const userSnap = await db.collection("users").doc(uid).get();
  const user = userSnap.data();
  if (user?.role === "admin") return "admin";
  if (user?.role === "owner") {
    if (user.cafeId === cafeId) return "owner";
    const cafeSnap = await db.collection("cafes").doc(cafeId).get();
    if (cafeSnap.exists && cafeSnap.data()?.ownerUid === uid) return "owner";
  }
  throw new HttpsError("permission-denied", "Bu işletmenin menüsünü düzenleme yetkiniz yok.");
}

const todayTR = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });

/** Günlük hakkı düşer; dolmuşsa hata. Okuma başarısız olursa refundQuota ile geri verilir. */
async function takeQuota(cafeId) {
  const ref = db.collection("menuImportQuota").doc(cafeId);
  const day = todayTR();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists && snap.data().day === day ? snap.data().count : 0;
    if (count >= DAILY_LIMIT) {
      throw new HttpsError("resource-exhausted", `Bugünkü menü okuma hakkınız doldu (${DAILY_LIMIT}). Yarın tekrar deneyin.`);
    }
    tx.set(ref, { day, count: count + 1 });
  });
}

async function refundQuota(cafeId) {
  const ref = db.collection("menuImportQuota").doc(cafeId);
  await db
    .runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.data().day === todayTR() && snap.data().count > 0) tx.update(ref, { count: snap.data().count - 1 });
    })
    .catch((err) => console.error("refundQuota", err));
}

function readFiles(raw) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_FILES) throw new HttpsError("invalid-argument", `En fazla ${MAX_FILES} dosya yükleyebilirsiniz.`);
  let total = 0;
  return raw.map((f) => {
    const mediaType = String(f?.mediaType || "");
    const data = String(f?.data || "");
    if (!ALLOWED_TYPES.has(mediaType)) throw new HttpsError("invalid-argument", "Sadece PDF, JPG, PNG veya WEBP yükleyebilirsiniz.");
    if (!/^[A-Za-z0-9+/]+=*$/.test(data)) throw new HttpsError("invalid-argument", "Dosya okunamadı.");
    total += data.length;
    if (total > MAX_TOTAL_BASE64) throw new HttpsError("invalid-argument", "Dosyalar çok büyük (en fazla ~15 MB).");
    return { mediaType, data };
  });
}

/**
 * Menü içe aktarma: { cafeId, files?: [{ mediaType, data(base64) }], url?: string }
 * → { menu: { categories, notes }, stats }. Firestore'a yazmaz; panel önizletip onaylatır, sonra kendisi yazar.
 */
exports.importMenu = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: "1GiB", maxInstances: 5 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Giriş yapmalısınız.");
    const cafeId = String(request.data?.cafeId || "");
    if (!cafeId) throw new HttpsError("invalid-argument", "cafeId zorunlu.");
    const role = await assertCanEditCafe(uid, cafeId);

    const files = readFiles(request.data?.files);
    const url = request.data?.url ? String(request.data.url).trim() : "";
    if (!files.length && !url) throw new HttpsError("invalid-argument", "Menü dosyası veya linki gerekli.");

    if (role !== "admin") await takeQuota(cafeId);
    const startedAt = Date.now();
    try {
      const source = url && !files.length ? await fetchMenuUrl(url) : { files };
      const result = await extractMenu({ apiKey: ANTHROPIC_API_KEY.value(), ...source });

      const itemCount = result.menu.categories.reduce((n, c) => n + c.items.length, 0);
      await db
        .collection("menuImportLogs")
        .add({
          cafeId,
          uid,
          role,
          source: files.length ? `files:${files.map((f) => f.mediaType).join(",")}` : `url:${url}`,
          model: result.model || MODEL,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costUsd: result.costUsd,
          categories: result.menu.categories.length,
          items: itemCount,
          ms: Date.now() - startedAt,
          at: admin.firestore.FieldValue.serverTimestamp(),
        })
        .catch((err) => console.error("menuImportLogs", err));

      return { menu: result.menu, stats: { categories: result.menu.categories.length, items: itemCount, seconds: Math.round((Date.now() - startedAt) / 1000) } };
    } catch (err) {
      if (role !== "admin") await refundQuota(cafeId);
      if (err instanceof HttpsError) throw err;
      if (err instanceof ExtractError) throw new HttpsError("failed-precondition", err.message);
      console.error("importMenu", err);
      throw new HttpsError("internal", "Menü okunamadı. Biraz sonra tekrar deneyin.");
    }
  },
);
