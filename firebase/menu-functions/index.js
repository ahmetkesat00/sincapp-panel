// LoopyGo QR menü fonksiyonları ("menu" codebase). Uygulamanın fonksiyonlarından ayrı deploy edilir:
//   cd firebase && firebase deploy --only functions:menu
// Diğer fonksiyonlar (damga, Apple Wallet vb.) cafe_loyalty_app/functions'ta; bu deploy onlara dokunmaz.

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { extractMenu, fetchMenuUrl, ExtractError, MODEL } = require("./extract");
const { handleMenuEvents, aggregateStats } = require("./stats");
const { suggestRecipes } = require("./recipes");

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

/** Kalori Asistanı: tek çağrıda en fazla bu kadar ürün; kafe başına günlük ürün hakkı (adminler hariç). */
const RECIPE_BATCH = 25;
const RECIPE_DAILY_ITEMS = 400;

/** Günlük reçete hakkından n ürün düşer; dolmuşsa hata. */
async function takeRecipeQuota(cafeId, n, refund = false) {
  const ref = db.collection("menuRecipeQuota").doc(cafeId);
  const day = todayTR();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists && snap.data().day === day ? snap.data().count : 0;
    if (!refund && count + n > RECIPE_DAILY_ITEMS) {
      throw new HttpsError("resource-exhausted", `Bugünkü kalori asistanı hakkınız doldu (${RECIPE_DAILY_ITEMS} ürün). Yarın devam edebilirsiniz.`);
    }
    tx.set(ref, { day, count: Math.max(0, count + (refund ? -n : n)) });
  });
}

/**
 * Kalori Asistanı: { cafeId, itemIds: string[] (≤25) } → { results }.
 * Ürünler Firestore'dan okunur (panelin gönderdiği metne güvenilmez). Firestore'a yazmaz;
 * panel reçeteleri gösterir, işletme düzeltip onaylayınca kendisi kaydeder.
 */
exports.suggestRecipes = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: "512MiB", maxInstances: 10 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Giriş yapmalısınız.");
    const cafeId = String(request.data?.cafeId || "");
    if (!cafeId) throw new HttpsError("invalid-argument", "cafeId zorunlu.");
    const role = await assertCanEditCafe(uid, cafeId);

    const raw = request.data?.itemIds;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > RECIPE_BATCH) {
      throw new HttpsError("invalid-argument", `Tek seferde 1–${RECIPE_BATCH} ürün gönderilebilir.`);
    }
    const ids = [...new Set(raw.map(String))].filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id));
    const cafeRef = db.collection("cafes").doc(cafeId);
    const [itemSnaps, catSnap] = await Promise.all([
      db.getAll(...ids.map((id) => cafeRef.collection("menuItems").doc(id))),
      cafeRef.collection("menuCategories").get(),
    ]);
    const items = itemSnaps.filter((s) => s.exists).map((s) => ({ id: s.id, ...s.data() }));
    if (!items.length) throw new HttpsError("not-found", "Ürünler bulunamadı.");
    const categoryNames = Object.fromEntries(catSnap.docs.map((d) => [d.id, d.data().name?.tr || ""]));

    if (role !== "admin") await takeRecipeQuota(cafeId, items.length);
    const startedAt = Date.now();
    try {
      const result = await suggestRecipes({ apiKey: ANTHROPIC_API_KEY.value(), items, categoryNames });
      await db
        .collection("menuImportLogs")
        .add({
          kind: "recipes",
          cafeId,
          uid,
          role,
          model: result.model || MODEL,
          inputTokens: result.usage.inputTokens,
          cacheReadTokens: result.usage.cacheRead,
          outputTokens: result.usage.outputTokens,
          costUsd: result.costUsd,
          items: items.length,
          ms: Date.now() - startedAt,
          at: admin.firestore.FieldValue.serverTimestamp(),
        })
        .catch((err) => console.error("menuImportLogs", err));
      return { results: result.results };
    } catch (err) {
      if (role !== "admin") await takeRecipeQuota(cafeId, items.length, true).catch((e) => console.error("refund", e));
      if (err instanceof HttpsError) throw err;
      if (err instanceof ExtractError) throw new HttpsError("failed-precondition", err.message);
      console.error("suggestRecipes", err);
      throw new HttpsError("internal", "Reçeteler hazırlanamadı. Biraz sonra tekrar deneyin.");
    }
  },
);

/** Menü sitesinden anonim kullanım sayaçları (sendBeacon). Kimlik doğrulama yok; girdiler sıkı temizlenir. */
exports.menuEvents = onRequest({ region: REGION, memory: "256MiB", timeoutSeconds: 15, maxInstances: 10, concurrency: 80 }, (req, res) =>
  handleMenuEvents(db, req, res),
);

/** Panel raporu: son 7 veya 30 günün menü istatistikleri (kafe sahibi veya admin). */
exports.getMenuStats = onCall({ region: REGION, memory: "256MiB", timeoutSeconds: 30 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Giriş yapmalısınız.");
  const cafeId = String(request.data?.cafeId || "");
  if (!cafeId) throw new HttpsError("invalid-argument", "cafeId zorunlu.");
  await assertCanEditCafe(uid, cafeId);
  const days = Number(request.data?.days) === 30 ? 30 : 7;
  return aggregateStats(db, cafeId, days);
});
