// Menü istatistikleri: menü sitesinden gelen anonim sayaçlar (menuEvents) ve panel raporu (getMenuStats).
// Kişisel veri tutulmaz: IP, çerez, cihaz kimliği yok; sadece kafe + gün bazında toplam sayılar.
//   cafes/{cafeId}/menuStats/{YYYY-MM-DD} = { opens, hours{0-23}, tables{}, lang{}, items{}, soldOut{}, cats{}, filters{}, misses{} }

const admin = require("firebase-admin");

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const FILTER = /^(diet|no):[A-Za-z]{2,20}$/;
const TABLE = /^[0-9A-Za-z-]{1,8}$/;
const MAX_KEYS = 60;
const MAX_COUNT = 20;
const MAX_BODY = 16 * 1024;

const dayTR = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
const hourTR = () => Number(new Date().toLocaleString("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hour12: false }).slice(0, 2)) % 24;

// ─── Kötüye kullanım sınırları (örnek başına bellekte; kesin değil, sayaç şişirmeyi zorlaştırır) ───

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > 60_000) {
    hits.set(ip, { start: now, n: 1 });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  entry.n += 1;
  return entry.n > 30;
}

const cafeCache = new Map();
/** Kafe var ve menüsü yayında mı (10 dk önbellek; her istekte okuma yapılmasın). */
async function isLiveMenu(db, cafeId) {
  const cached = cafeCache.get(cafeId);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.live;
  const snap = await db.collection("cafes").doc(cafeId).get();
  const live = snap.exists && snap.data()?.qrMenu?.enabled === true;
  cafeCache.set(cafeId, { live, at: Date.now() });
  return live;
}

/** { anahtar: sayı } haritasını temizler: geçerli anahtar, 1–20 arası tam sayı, en fazla 60 anahtar. */
function cleanCounts(raw, keyOk) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  for (const [key, value] of Object.entries(raw).slice(0, MAX_KEYS)) {
    const n = Math.floor(Number(value));
    if (keyOk(key) && n >= 1) out[key] = Math.min(n, MAX_COUNT);
  }
  return Object.keys(out).length ? out : null;
}

const cleanTerm = (k) => {
  const t = String(k).toLocaleLowerCase("tr").replace(/[^a-z0-9çğıöşüâîû ]/g, "").replace(/\s+/g, " ").trim();
  return t.length >= 3 && t.length <= 40 ? t : null;
};

/** Menü sitesinden sendBeacon ile gelen sayaçları günün belgesine ekler. Hep 204 döner (bilgi sızdırmaz). */
async function handleMenuEvents(db, req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  if (req.method !== "POST") return res.status(405).end();

  const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
  if (rateLimited(ip)) return res.status(204).end();

  const raw = req.rawBody ? req.rawBody.toString("utf8") : typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  if (raw.length > MAX_BODY) return res.status(204).end();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return res.status(204).end();
  }

  const cafeId = String(body.cafeId || "");
  if (!/^[A-Za-z0-9]{10,40}$/.test(cafeId)) return res.status(204).end();
  if (!(await isLiveMenu(db, cafeId).catch(() => false))) return res.status(204).end();

  const inc = admin.firestore.FieldValue.increment;
  const incMap = (counts) => Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, inc(n)]));
  const update = {};

  if (body.open === true) {
    update.opens = inc(1);
    update.hours = { [String(hourTR())]: inc(1) };
    if (body.lang === "tr" || body.lang === "en") update.lang = { [body.lang]: inc(1) };
    if (body.table && TABLE.test(String(body.table))) update.tables = { [String(body.table)]: inc(1) };
  }
  const items = cleanCounts(body.items, (k) => ID.test(k));
  const soldOut = cleanCounts(body.soldOut, (k) => ID.test(k));
  const cats = cleanCounts(body.cats, (k) => ID.test(k));
  const filters = cleanCounts(body.filters, (k) => FILTER.test(k));
  const misses = cleanCounts(
    Object.fromEntries(Object.entries(body.misses && typeof body.misses === "object" ? body.misses : {}).map(([k, v]) => [cleanTerm(k), v]).filter(([k]) => k)),
    () => true,
  );
  if (items) update.items = incMap(items);
  if (soldOut) update.soldOut = incMap(soldOut);
  if (cats) update.cats = incMap(cats);
  if (filters) update.filters = incMap(filters);
  if (misses) update.misses = incMap(misses);
  if (!Object.keys(update).length) return res.status(204).end();

  const day = dayTR();
  await db
    .collection("cafes")
    .doc(cafeId)
    .collection("menuStats")
    .doc(day)
    .set({ day, ...update }, { merge: true })
    .catch((err) => console.error("menuEvents write", err));
  return res.status(204).end();
}

/** Son N günün sayaçlarını toplar (panel raporu). */
async function aggregateStats(db, cafeId, days) {
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  const from = dayTR(start);
  const snap = await db.collection("cafes").doc(cafeId).collection("menuStats").where("day", ">=", from).get();

  const byDay = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
  const sum = (field) => {
    const out = {};
    for (const data of Object.values(byDay)) for (const [k, n] of Object.entries(data[field] || {})) out[k] = (out[k] || 0) + n;
    return out;
  };
  const daily = [];
  for (let i = 0; i < days; i++) {
    const d = dayTR(new Date(start.getTime() + i * 86_400_000));
    daily.push({ day: d, opens: byDay[d]?.opens || 0 });
  }
  const hoursMap = sum("hours");
  return {
    from,
    to: dayTR(end),
    daily,
    opens: daily.reduce((n, d) => n + d.opens, 0),
    hours: Array.from({ length: 24 }, (_, h) => hoursMap[String(h)] || 0),
    lang: sum("lang"),
    tables: sum("tables"),
    items: sum("items"),
    soldOut: sum("soldOut"),
    cats: sum("cats"),
    filters: sum("filters"),
    misses: sum("misses"),
  };
}

module.exports = { handleMenuEvents, aggregateStats };
