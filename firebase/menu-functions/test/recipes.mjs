// Yerel deneme: ANTHROPIC_API_KEY ortamdan okunur.  node test/recipes.mjs [çıktı.json]
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { suggestRecipes } = require("../recipes.js");
const INGREDIENTS = require("../ingredients.json");
const kcalOf = new Map(INGREDIENTS.map((i) => [i.id, i.kcal]));

const size = (opts) => ({ id: "size", name: { tr: "Boy" }, selection: "single", options: opts.map(([id, tr, d]) => ({ id, name: { tr }, priceDelta: d })) });
const items = [
  { id: "latte", categoryId: "hot", name: { tr: "Latte" }, price: 120, ingredients: [], variants: [size([["s1", "Küçük", 0], ["s2", "Orta", 15], ["s3", "Büyük", 30]])] },
  { id: "americano", categoryId: "hot", name: { tr: "Americano" }, price: 100, ingredients: [] },
  { id: "turk", categoryId: "hot", name: { tr: "Türk Kahvesi" }, price: 80, ingredients: [] },
  {
    id: "chai",
    categoryId: "hot",
    name: { tr: "Chai Tea Latte" },
    price: 140,
    ingredients: [],
    variants: [
      { id: "milk", name: { tr: "Süt seçimi" }, selection: "single", options: [{ id: "cow", name: { tr: "İnek sütü" }, priceDelta: 0 }, { id: "oat", name: { tr: "Yulaf sütü" }, priceDelta: 20 }] },
      { id: "ex", name: { tr: "Ekstralar" }, selection: "multi", options: [{ id: "shot", name: { tr: "Ekstra shot" }, priceDelta: 25 }, { id: "van", name: { tr: "Vanilya şurubu" }, priceDelta: 20 }] },
    ],
  },
  { id: "icm", categoryId: "cold", name: { tr: "Iced Caramel Macchiato" }, price: 150, ingredients: [] },
  { id: "limonata", categoryId: "cold", name: { tr: "Ev Yapımı Limonata" }, price: 90, ingredients: [] },
  { id: "sansebastian", categoryId: "dessert", name: { tr: "San Sebastian Cheesecake" }, price: 180, ingredients: [] },
  { id: "brownie", categoryId: "dessert", name: { tr: "Brownie" }, description: { tr: "Sıcak servis, yanında dondurma ile" }, price: 160, ingredients: [] },
  { id: "tost", categoryId: "food", name: { tr: "Karışık Tost" }, price: 170, ingredients: [{ name: { tr: "Kaşar" } }, { name: { tr: "Sucuk" } }, { name: { tr: "Domates" } }] },
  { id: "menemen", categoryId: "food", name: { tr: "Menemen" }, price: 190, ingredients: [] },
  { id: "special", categoryId: "hot", name: { tr: "Sorryb Special" }, price: 160, ingredients: [] },
  { id: "pasta", categoryId: "food", name: { tr: "Fettuccine Alfredo" }, price: 280, ingredients: [] },
];
const categoryNames = { hot: "Sıcak Kahveler", cold: "Soğuk İçecekler", dessert: "Tatlılar", food: "Yemekler" };

const t = Date.now();
const r = await suggestRecipes({ apiKey: process.env.ANTHROPIC_API_KEY, items, categoryNames });
console.log(`süre ${((Date.now() - t) / 1000).toFixed(0)} sn · ${r.model} · giriş ${r.usage.inputTokens} (önbellek ${r.usage.cacheRead}) · çıkış ${r.usage.outputTokens} · $${r.costUsd.toFixed(3)}`);
const kcal = (lines) => Math.round(lines.reduce((s, l) => s + (kcalOf.get(l.ingredientId) * l.amount) / 100, 0));
for (const x of r.results) {
  const name = items.find((i) => i.id === x.itemId).name.tr;
  console.log(`\n${name} · ${x.portion} · ${kcal(x.recipe)} kcal · ${x.confidence}${x.note ? " · " + x.note : ""}`);
  console.log("   " + x.recipe.map((l) => `${l.ingredientId} ${l.amount}`).join(", "));
  for (const o of x.options) console.log(`   [${o.optionId}${o.portion ? " " + o.portion : ""}] ${o.changes.map((l) => `${l.ingredientId} ${l.amount > 0 ? "+" : ""}${l.amount}`).join(", ") || "-"} → ${kcal(o.changes) >= 0 ? "+" : ""}${kcal(o.changes)} kcal`);
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(r.results, null, 2));
