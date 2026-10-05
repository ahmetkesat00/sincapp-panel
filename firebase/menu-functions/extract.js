// Menü okuma çekirdeği: PDF, fotoğraf veya web sayfası metninden kategori/ürün çıkarır.
// index.js'teki onCall burayı çağırır; test/run.mjs de anahtarı ortamdan alıp doğrudan dener.

const { Anthropic } = require("@anthropic-ai/sdk");
const dns = require("node:dns/promises");
const net = require("node:net");

const MODEL = "claude-opus-5-5";
// Opus 5.5 liste fiyatı ($/1M token) — sadece maliyet kaydı için.
const PRICE_IN = 4;
const PRICE_OUT = 20;

const ALLERGENS = [
  "gluten", "crustaceans", "eggs", "fish", "peanuts", "soy", "milk",
  "nuts", "celery", "mustard", "sesame", "sulphites", "lupin", "molluscs",
];
const DIET_TAGS = ["vegan", "vegetarian", "glutenFree", "spicy"];

const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const str = { type: "string" };

// Yapılandırılmış çıktı şeması: yanıt her zaman bu yapıda gelir (panel doğrudan işler).
const MENU_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["categories", "notes"],
  properties: {
    categories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "nameEn", "description", "servedFrom", "servedTo", "items"],
        properties: {
          name: str,
          nameEn: nullable(str),
          description: nullable(str),
          servedFrom: nullable(str),
          servedTo: nullable(str),
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "name", "nameEn", "description", "price", "sizes", "portion",
                "calories", "ingredients", "dietTags",
              ],
              properties: {
                name: str,
                nameEn: nullable(str),
                description: nullable(str),
                price: nullable({ type: "number" }),
                sizes: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["name", "price"],
                    properties: { name: str, price: { type: "number" } },
                  },
                },
                portion: nullable(str),
                calories: nullable({ type: "integer" }),
                ingredients: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["name", "allergens", "alcohol", "pork"],
                    properties: {
                      name: str,
                      allergens: { type: "array", items: { type: "string", enum: ALLERGENS } },
                      alcohol: { type: "boolean" },
                      pork: { type: "boolean" },
                    },
                  },
                },
                dietTags: { type: "array", items: { type: "string", enum: DIET_TAGS } },
              },
            },
          },
        },
      },
    },
    notes: { type: "array", items: str },
  },
};

const SYSTEM_PROMPT = `Sen bir kafe/restoran menüsünü dijital QR menüye aktaran bir asistansın. Sana bir menünün PDF'i, fotoğrafları ya da web sayfasının metni verilecek. Menüdeki her kategoriyi ve ürünü eksiksiz, menüdeki sırasıyla çıkar.

Kurallar:
- Ürün ve kategori adlarını menüde yazdığı gibi al; Türkçe karakterleri koru. TAMAMI BÜYÜK HARFLE yazılmış adları doğal Türkçe yazıma çevir ("SICAK KAHVELER" → "Sıcak Kahveler", "İRLANDA KREMASI" → "İrlanda Kreması"). Yabancı özel adları (Latte, Cold Brew, Cheesecake) özgün yazımıyla bırak.
- Fiyatlar TL cinsinden sayı olsun (₺, TL, nokta/virgül ayrımına dikkat: "1.250" bin iki yüz elli, "85,50" seksen beş buçuk). Fiyat okunamıyorsa null yaz ve notes'a ekle.
- Ürünün boy/porsiyon seçenekleri ayrı fiyatlarla yazılıysa (Küçük/Orta/Büyük, Tek/Duble, 8oz/12oz) hepsini sizes'a mutlak fiyatlarıyla yaz; price en ucuz seçeneğin fiyatı olsun. Tek fiyat varsa sizes boş kalsın.
- Menüde İngilizce ad yazıyorsa nameEn'e koy; yoksa null. Çeviri uydurma.
- description: menüde ürünün altında yazan açıklama; yoksa null.
- portion: menüde yazıyorsa (250 ml, 2 kişilik, 180 g); yoksa null. calories: sadece menüde yazıyorsa; asla tahmin etme.
- ingredients: menüde yazan içerikler. Menüde yazmıyorsa yalnızca ürün adından açıkça anlaşılan temel bileşenleri yaz (Latte → Espresso, Süt; Limonata → Limon, Su, Şeker). Emin olmadığın üründe boş bırak. Uydurma süsleme yapma.
- allergens: her bileşen için Türk Gıda Kodeksi'ndeki 14 alerjenden içerdiklerini işaretle (süt → milk, un → gluten, fındık → nuts, yumurta → eggs ...). Bunlar öneridir; işletme kontrol edecek.
- alcohol / pork: bileşen alkol veya domuz kaynaklıysa true.
- dietTags: sadece menüde belirtilmişse ya da kesinse (vegan, vegetarian, glutenFree, spicy).
- servedFrom / servedTo: kategori başlığında saat aralığı varsa ("Kahvaltı 08:00-12:00") HH:MM biçiminde; yoksa null.
- Menü olmayan içerikleri (adres, sosyal medya, kampanya metinleri, çerez uyarıları) alma.
- notes: okunamayan, emin olmadığın veya işletmenin kontrol etmesi gereken noktaları kısa Türkçe cümlelerle yaz. Sorun yoksa boş dizi.`;

/** Dosyaları/metni Claude içerik bloklarına çevirir. */
function toContent({ files, pageText, pageUrl }) {
  const blocks = [];
  for (const f of files) {
    if (f.mediaType === "application/pdf") {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } });
    } else {
      blocks.push({ type: "image", source: { type: "base64", media_type: f.mediaType, data: f.data } });
    }
  }
  if (pageText) {
    blocks.push({ type: "text", text: `Web sayfası (${pageUrl}) metni:\n\n${pageText}` });
  }
  blocks.push({ type: "text", text: "Bu menüyü kurallara göre çıkar." });
  return blocks;
}

class ExtractError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Menüyü okur; { menu, usage, costUsd, model } döner. */
async function extractMenu({ apiKey, files = [], pageText, pageUrl }) {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 8 * 60 * 1000 });
  // Uzun menülerde çıktı büyük olabilir; akışla alıp sonunda tam mesajı birleştir.
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: MENU_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: toContent({ files, pageText, pageUrl }) }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new ExtractError("refusal", "Menü işlenemedi. Farklı bir dosyayla tekrar deneyin.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new ExtractError("too-long", "Menü tek seferde okunamayacak kadar uzun. Sayfaları birkaç parçada yükleyin.");
  }
  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  let menu;
  try {
    menu = JSON.parse(text);
  } catch {
    throw new ExtractError("bad-output", "Menü okunurken bir sorun oldu, tekrar deneyin.");
  }

  const u = message.usage || {};
  const inputTokens = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  const outputTokens = u.output_tokens || 0;
  const costUsd = (inputTokens * PRICE_IN + outputTokens * PRICE_OUT) / 1e6;
  return { menu, usage: { inputTokens, outputTokens }, costUsd, model: message.model };
}

// ─── Web sayfası ───

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) || // bulut meta veri sunucusu dahil
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

const MAX_PAGE_BYTES = 8 * 1024 * 1024;

/**
 * Menü linkini indirir. Sadece herkese açık adresler (iç ağ/meta veri adresleri engellenir),
 * en fazla 4 yönlendirme. Bot korumalı sayfalar atlatılmaz; hata döner.
 */
async function fetchMenuUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ExtractError("bad-url", "Geçerli bir web adresi girin.");
  }
  for (let hop = 0; hop < 5; hop++) {
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new ExtractError("bad-url", "Sadece http/https linkleri desteklenir.");
    const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
    if (!addresses.length) throw new ExtractError("bad-url", "Bu adrese ulaşılamadı.");
    if (addresses.some((a) => isPrivateAddress(a.address))) throw new ExtractError("bad-url", "Bu adres kullanılamaz.");

    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: { "user-agent": "LoopyGoMenuImport/1.0 (+https://loopygo.app)", accept: "text/html,application/pdf,image/*;q=0.8,*/*;q=0.5" },
    }).catch(() => null);
    if (!res) throw new ExtractError("fetch-failed", "Sayfa açılamadı. PDF veya fotoğraf yüklemeyi deneyin.");

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) {
      throw new ExtractError("fetch-failed", `Sayfa açılamadı (${res.status}). Menünüzü PDF veya fotoğraf olarak yükleyin.`);
    }
    if (Number(res.headers.get("content-length") || 0) > MAX_PAGE_BYTES) throw new ExtractError("too-large", "Sayfa çok büyük.");
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_PAGE_BYTES) throw new ExtractError("too-large", "Sayfa çok büyük.");

    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (type === "application/pdf") return { files: [{ mediaType: "application/pdf", data: buffer.toString("base64") }] };
    if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type)) {
      return { files: [{ mediaType: type, data: buffer.toString("base64") }] };
    }
    const text = htmlToText(buffer.toString("utf8"));
    if (text.length < 80) {
      throw new ExtractError("empty-page", "Bu sayfada okunabilir menü metni bulunamadı. Menünüzü PDF veya fotoğraf olarak yükleyin.");
    }
    if (text.length > 400000) throw new ExtractError("too-large", "Sayfa çok uzun. Menünüzü PDF olarak yükleyin.");
    return { pageText: text, pageUrl: url.toString() };
  }
  throw new ExtractError("fetch-failed", "Çok fazla yönlendirme var.");
}

function htmlToText(html) {
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return html
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/td|\/th)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return entities[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

module.exports = { extractMenu, fetchMenuUrl, ExtractError, MODEL };
