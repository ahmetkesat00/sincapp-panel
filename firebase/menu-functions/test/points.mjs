// adjustPoints mantık testi (bellek içi sahte Firestore).  node test/points.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { adjustPoints } = require("../points.js");

function fakeDb(seed) {
  const store = new Map(Object.entries(seed));
  let auto = 0;
  const ref = (path) => ({
    path,
    id: path.split("/").pop(),
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    collection: (c) => col(`${path}/${c}`),
  });
  const col = (p) => ({ doc: (id) => ref(`${p}/${id ?? `auto${++auto}`}`) });
  const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v && typeof v === "object" && v.constructor?.name?.includes("Transform") ? "<ts>" : v)));
  return {
    store,
    collection: col,
    runTransaction: async (fn) => {
      const writes = [];
      const t = {
        get: (r) => r.get(),
        set: (r, d, o) => writes.push(() => store.set(r.path, o?.merge ? { ...(store.get(r.path) || {}), ...clean(d) } : clean(d))),
        delete: (r) => writes.push(() => store.delete(r.path)),
      };
      const res = await fn(t);
      writes.forEach((w) => w());
      return res;
    },
  };
}

const seed = () => ({
  "users/adm": { role: "admin" },
  "users/own": { role: "owner", cafeId: "c1" },
  "users/own2": { role: "owner", cafeId: "c9" },
  "users/cust": { role: "user" },
  "cafes/c1": { loyaltyCards: [{ rewardBuy: 8 }], ownerUid: "own" },
  "cafes/c2": { chainId: "ch", ownerUid: "own" },
  "cafes/c3": { loyaltyCards: [{ rewardBuy: 8 }], ownerUid: "own3", dailyStampLimit: 1 },
  "users/own3": { role: "owner", cafeId: "c3" },
  "chains/ch": { loyaltyCard: { rewardBuy: 5 } },
  "users/cust/points/c1": { cafeId: "c1", userUid: "cust", stamps: 7, rewards: 0 },
});
const call = (db, uid, data) => adjustPoints(db, { auth: uid && { uid }, data });
const rejects = async (p, code) => assert.equal((await p.then(() => null, (e) => e))?.code, code);

// Owner +1 → 7+1 = 8 = rewardBuy → 0 yıldız, 1 ödül
{
  const db = fakeDb(seed());
  const r = await call(db, "own", { userUid: "cust", cafeId: "c1", stampDelta: 1 });
  assert.deepEqual(r, { stampsBefore: 7, stampsAfter: 0, rewardsBefore: 0, rewardsAfter: 1, earned: 1 });
  const tx = [...db.store].find(([k]) => k.startsWith("users/cust/points/c1/tx/"))[1];
  assert.equal(tx.type, "manual_stamp");
  assert.equal(tx.byRole, "owner");
  const token = db.store.get(`qrTokens/${tx.txId}`);
  assert.equal(token.status, "processed");
  assert.equal(token.manual, true);
  assert.equal(token.processedType, "stamp");
  assert.equal(token.stampCount, 1);
  assert.equal(token.scannedUserId, "cust");
}
// Admin düşme / sadece ödül → rapora işlem yazılmaz
{
  const db = fakeDb(seed());
  await call(db, "adm", { userUid: "cust", cafeId: "c1", stampDelta: -2, rewardDelta: 1, reason: "düzeltme" });
  assert.equal([...db.store.keys()].some((k) => k.startsWith("qrTokens/")), false);
}
// Owner: ödül değiştiremez, eksi veremez, başka işletmeye veremez, kendine veremez
{
  const db = fakeDb(seed());
  await rejects(call(db, "own", { userUid: "cust", cafeId: "c1", stampDelta: -1 }), "invalid-argument");
  await rejects(call(db, "own", { userUid: "cust", cafeId: "c1", stampDelta: 11 }), "invalid-argument");
  const r = await call(db, "own", { userUid: "cust", cafeId: "c1", stampDelta: 1, rewardDelta: 5 });
  assert.equal(r.rewardsAfter, 1, "owner rewardDelta yok sayılmalı");
  await rejects(call(db, "own2", { userUid: "cust", cafeId: "c1", stampDelta: 1 }), "permission-denied");
  await rejects(call(db, "cust", { userUid: "cust", cafeId: "c1", stampDelta: 1 }), "permission-denied");
  await rejects(call(db, null, { userUid: "cust", cafeId: "c1", stampDelta: 1 }), "unauthenticated");
}
// Zincir: doküman chainId, rewardBuy zincirden
{
  const db = fakeDb(seed());
  const r = await call(db, "own", { userUid: "cust", cafeId: "c2", stampDelta: 6 });
  assert.deepEqual(r, { stampsBefore: 0, stampsAfter: 1, rewardsBefore: 0, rewardsAfter: 1, earned: 1 });
  assert.equal(db.store.get("users/cust/points/ch").chainId, "ch");
}
// Günlük limit: owner ikinci damgada durur, admin takılmaz
{
  const db = fakeDb(seed());
  await call(db, "own3", { userUid: "cust", cafeId: "c3", stampDelta: 1 });
  await rejects(call(db, "own3", { userUid: "cust", cafeId: "c3", stampDelta: 1 }), "failed-precondition");
  const r = await call(db, "adm", { userUid: "cust", cafeId: "c3", stampDelta: 1, reason: "telafi" });
  assert.equal(r.stampsAfter, 2);
}
// Admin: açıklama zorunlu, eksiye düşmez, sıfıra inince doküman silinir
{
  const db = fakeDb(seed());
  await rejects(call(db, "adm", { userUid: "cust", cafeId: "c1", stampDelta: 1 }), "invalid-argument");
  await rejects(call(db, "adm", { userUid: "cust", cafeId: "c1", stampDelta: -8, reason: "hata" }), "failed-precondition");
  await rejects(call(db, "adm", { userUid: "cust", cafeId: "c1", rewardDelta: -1, reason: "hata" }), "failed-precondition");
  const r = await call(db, "adm", { userUid: "cust", cafeId: "c1", stampDelta: -7, reason: "yanlış damga" });
  assert.equal(r.stampsAfter, 0);
  assert.equal(db.store.has("users/cust/points/c1"), false);
}
// findCustomerByPhone (Firebase Auth sahte)
{
  const { findCustomerByPhone } = require("../points.js");
  const adminSdk = require("firebase-admin");
  Object.defineProperty(adminSdk, "auth", { configurable: true, value: () => ({
    getUserByPhoneNumber: async (p) => {
      if (p === "+905321234567") return { uid: "cust", phoneNumber: p };
      if (p === "+905329999999") return { uid: "own", phoneNumber: p };
      throw Object.assign(new Error("nf"), { code: "auth/user-not-found" });
    },
  }) });
  const db = fakeDb(seed());
  const find = (uid, data) => findCustomerByPhone(db, { auth: { uid }, data });
  const r = await find("own", { cafeId: "c1", phone: "0532 123 45 67" });
  assert.deepEqual({ uid: r.uid, stamps: r.stamps, hasCard: r.hasCard, phoneMasked: r.phoneMasked }, { uid: "cust", stamps: 7, hasCard: true, phoneMasked: "+90532 *** ** 67" });
  assert.equal((await find("own", { cafeId: "c2", phone: "5321234567" })).hasCard, false);
  await rejects(find("own", { cafeId: "c1", phone: "5320000000" }), "not-found");
  await rejects(find("own", { cafeId: "c1", phone: "5329999999" }), "not-found"); // owner hesapları dönmez
  await rejects(find("own", { phone: "5321234567" }), "permission-denied"); // owner cafeId vermeli
  await rejects(find("own2", { cafeId: "c1", phone: "5321234567" }), "permission-denied");
  await rejects(find("own", { cafeId: "c1", phone: "212 123 4567" }), "invalid-argument");
  assert.equal((await find("adm", { phone: "+90 532 123 45 67" })).uid, "cust");
}
console.log("adjustPoints + findCustomerByPhone: tüm testler geçti");
