// Yerel deneme: ANTHROPIC_API_KEY ortamdan okunur (deploy edilmez; firebase.json "test"i dışarıda bırakır).
//   node test/run.mjs <dosya.pdf|.jpg|.png ... | https://...>  [çıktı.json]
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { extractMenu, fetchMenuUrl } = require("../extract.js");

const args = process.argv.slice(2);
const out = args.find((a) => a.endsWith(".json"));
const inputs = args.filter((a) => a !== out);
const typeOf = (p) => (p.endsWith(".pdf") ? "application/pdf" : p.endsWith(".png") ? "image/png" : "image/jpeg");
const source = inputs[0].startsWith("http")
  ? await fetchMenuUrl(inputs[0])
  : { files: inputs.map((p) => ({ mediaType: typeOf(p), data: readFileSync(p).toString("base64") })) };
if (source.pageText) console.log("sayfa metni:", source.pageText.length, "karakter");
const t = Date.now();
const r = await extractMenu({ apiKey: process.env.ANTHROPIC_API_KEY, ...source });
const items = r.menu.categories.reduce((n, c) => n + c.items.length, 0);
console.log(`süre ${((Date.now() - t) / 1000).toFixed(0)} sn · model ${r.model} · giriş ${r.usage.inputTokens} · çıkış ${r.usage.outputTokens} token · $${r.costUsd.toFixed(3)}`);
console.log(`${r.menu.categories.length} kategori · ${items} ürün`);
for (const c of r.menu.categories) console.log(`- ${c.name} (${c.items.length}): ${c.items.slice(0, 3).map((i) => `${i.name} ${i.price ?? "?"}${i.sizes.length ? ` [${i.sizes.map((s) => s.name + " " + s.price).join(", ")}]` : ""}`).join(" | ")}`);
if (r.menu.notes.length) console.log("notlar:", r.menu.notes);
if (out) writeFileSync(out, JSON.stringify(r.menu, null, 2));
