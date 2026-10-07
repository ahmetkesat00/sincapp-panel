// Kalori Asistanı çekirdeği: menüdeki ürünler için gerçekçi standart reçete (gramaj) önerir.
// Kaloriyi yapay zekâ hesaplamaz; panel, reçeteyi ingredients.json'daki USDA FoodData Central
// değerleriyle çarpar. Böylece her kalori, gramajı işletmece onaylanmış bir reçeteye dayanır.

const { Anthropic } = require("@anthropic-ai/sdk");
const INGREDIENTS = require("./ingredients.json");
const { MODEL, ExtractError } = require("./extract");

const PRICE_IN = 4;
const PRICE_OUT = 20;
const IDS = INGREDIENTS.map((i) => i.id);
const BY_ID = new Map(INGREDIENTS.map((i) => [i.id, i]));
const MAX_AMOUNT = 3000;

const line = {
  type: "object",
  additionalProperties: false,
  required: ["ingredient", "amount"],
  properties: { ingredient: { type: "string", enum: IDS }, amount: { type: "number" } },
};

const RECIPE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["itemId", "portion", "confidence", "note", "recipe", "options"],
        properties: {
          itemId: { type: "string" },
          portion: { anyOf: [{ type: "string" }, { type: "null" }] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          note: { anyOf: [{ type: "string" }, { type: "null" }] },
          recipe: { type: "array", items: line },
          options: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["optionId", "portion", "changes"],
              properties: {
                optionId: { type: "string" },
                portion: { anyOf: [{ type: "string" }, { type: "null" }] },
                changes: { type: "array", items: line },
              },
            },
          },
        },
      },
    },
  },
};

// Değeri pişmiş hâline ait malzemeler: gramaj tabaktaki (pişmiş) ağırlık olmalı.
const COOKED = new Set([
  "makarna", "pirinc_pilavi", "bulgur", "nohut", "mercimek", "haslanmis_patates", "patates_kizartmasi",
  "tavuk_gogsu", "tavuk_but", "burger_koftesi", "dana_kiyma", "somon", "karides", "bacon", "sosis",
]);
const catalogText = INGREDIENTS.map((i) => `${i.id} | ${i.tr}${COOKED.has(i.id) ? " (pişmiş ağırlık)" : ""} | ${i.unit}`).join("\n");

const SYSTEM_PROMPT = `Sen Türkiye'deki kafe ve restoranlar için standart reçete hazırlayan deneyimli bir mutfak şefi ve gıda mühendisisin. Sana bir işletmenin menüsünden ürünler verilecek. Her ürün için, o ürünün Türkiye'deki bir kafede tipik olarak nasıl hazırlandığına dair GERÇEKÇİ bir porsiyon reçetesi yaz. Bu reçeteden kalori hesaplanacak ve içindekiler listesi oluşturulacak; işletme gramajları kendi reçetesine göre düzeltip onaylayacak.

Malzeme kataloğu (id | ad | birim). Sadece buradaki id'leri kullan; miktar o malzemenin birimindedir (g ya da ml):
${catalogText}

Kurallar:
- recipe: ürünün TEMEL hâlinin (fiyatı yazılan, varsayılan seçimlerle) bir porsiyonu. Gerçekçi gramaj kullan (ör. tek shot espresso 30 ml, duble 60 ml; orta boy latte ~ 60 ml espresso + 250 ml süt; dilim cheesecake ~ 130 g). Ürün adı, açıklaması, kategorisi, porsiyonu ve fiyatı ipucudur. İşletmenin yazdığı içindekiler varsa ona sadık kal.
- Tatlı, sandviç, kahvaltı tabağı gibi hazırlanan ürünleri temel malzemelerine ayır (cheesecake → krem peynir, şeker, yumurta, krema, bisküvi, tereyağı). Sadece hazır alınan tek parça ürünlerde (kruvasan, simit, waffle) hazır malzemeyi kullan.
- Kalorisi ihmal edilebilir süsleri (birkaç nane yaprağı, tutam tuz) yazma; ama içeriğe/alerjene etkisi olanları yaz (ör. üstüne serpilen fıstık).
- Katalogda tam karşılığı olmayan malzeme için en yakınını seç ve note'ta belirt (ör. "Lotus bisküvi yerine Bisküvi kullanıldı").
- Ürün yiyecek/içecek değilse ya da ne olduğu anlaşılmıyorsa (ör. "Sürpriz menü", "Nargile") recipe boş kalsın, confidence low, note'ta nedenini yaz.
- options: SADECE ürünle birlikte verilen seçenekler için ve sadece verilen optionId'lerle yaz; seçenek uydurma. Ürünün seçeneği yoksa options boş dizi olsun. Boy seçeneği olmayan bir ürün için boy reçetesi düşünme.
  - Tekli (single) gruplarda İLK seçenek varsayılandır ve temel reçeteye dahildir; onun changes'i boş olmalı. Diğer seçenekler için changes, temel reçeteye göre FARKTIR: artan miktar pozitif, azalan negatif. Ör. Büyük boy: espresso +30, süt +100. Yulaf sütü seçeneği: süt -250, yulaf_sutu +250 (değiştirilen malzemeyi tamamen çıkar, yenisini ekle).
  - Çoklu (multi) gruplarda (ekstralar) changes, seçenek eklenince gelen malzemedir (ör. Ekstra shot: espresso +30; Vanilya şurubu: aromali_surup +20).
  - Kaloriyi ve içeriği etkilemeyen seçeneklerde (Sıcak/Soğuk hariç buz, "Şekersiz" gibi) changes boş olabilir; anlamlı olanları yaz (Soğuk: buz +150).
  - portion: boy seçenekleri için porsiyonu yaz (ör. "450 ml"), değilse null.
- portion (ürün): temel porsiyonun kısa ifadesi (ör. "350 ml", "1 dilim (130 g)", "1 porsiyon (250 g)").
- confidence: high = standart, iyi bilinen ürün; medium = makul tahmin; low = ürün belirsiz ya da işletmeye özel.
- note: işletmenin kontrol etmesi gereken nokta varsa kısa bir Türkçe cümle; yoksa null.
- Verilen her ürün için tam olarak bir sonuç döndür; itemId'yi aynen kopyala.`;

/** Bir ürünü Claude'a verilecek kısa metne çevirir. */
function describeItem(item, categoryName) {
  const parts = [`itemId: ${item.id}`, `Kategori: ${categoryName || "-"}`, `Ürün: ${item.name?.tr || ""}`];
  if (item.description?.tr) parts.push(`Açıklama: ${item.description.tr}`);
  if (item.portion) parts.push(`Porsiyon: ${item.portion}`);
  if (typeof item.price === "number") parts.push(`Fiyat: ${item.price} TL`);
  const ings = (item.ingredients || []).map((i) => i.name?.tr).filter(Boolean);
  if (ings.length) parts.push(`İşletmenin yazdığı içindekiler: ${ings.join(", ")}`);
  for (const g of item.variants || []) {
    const opts = (g.options || []).map((o, idx) => `${o.id}="${o.name?.tr || ""}"${g.selection === "single" && idx === 0 ? " (varsayılan)" : ""}`);
    parts.push(`Seçenek grubu "${g.name?.tr || ""}" (${g.selection === "multi" ? "multi" : "single"}): ${opts.join(", ")}`);
  }
  return parts.join("\n");
}

const clampAmount = (n) => Math.max(-MAX_AMOUNT, Math.min(MAX_AMOUNT, Math.round(Number(n) * 10) / 10));

/** Yanıtı doğrular: bilinmeyen ürün/seçenek/malzeme atılır, aynı malzeme birleştirilir. */
function sanitize(result, items) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const merge = (lines, allowNegative) => {
    const sum = new Map();
    for (const l of lines || []) {
      if (!BY_ID.has(l.ingredient) || !Number.isFinite(Number(l.amount))) continue;
      sum.set(l.ingredient, (sum.get(l.ingredient) || 0) + clampAmount(l.amount));
    }
    return [...sum]
      .map(([ingredientId, amount]) => ({ ingredientId, amount: Math.round(amount * 10) / 10 }))
      .filter((l) => (allowNegative ? l.amount !== 0 : l.amount > 0));
  };
  const out = [];
  const seen = new Set();
  for (const r of result.items || []) {
    const item = byId.get(r.itemId);
    if (!item || seen.has(r.itemId)) continue;
    seen.add(r.itemId);
    const optionIds = new Set((item.variants || []).flatMap((g) => (g.options || []).map((o) => o.id)));
    out.push({
      itemId: r.itemId,
      portion: r.portion ? String(r.portion).slice(0, 60) : null,
      confidence: ["high", "medium", "low"].includes(r.confidence) ? r.confidence : "low",
      note: r.note ? String(r.note).slice(0, 300) : null,
      recipe: merge(r.recipe, false),
      options: (r.options || [])
        .filter((o) => optionIds.has(o.optionId))
        .map((o) => ({ optionId: o.optionId, portion: o.portion ? String(o.portion).slice(0, 60) : null, changes: merge(o.changes, true) })),
    });
  }
  return out;
}

/**
 * items: Firestore'daki menü ürünleri ({ id, ...MenuItem }), categories: { id → ad }.
 * → { results, usage, costUsd, model }
 */
async function suggestRecipes({ apiKey, items, categoryNames }) {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 5 * 60 * 1000 });
  const text = items.map((i) => describeItem(i, categoryNames[i.categoryId])).join("\n\n---\n\n");
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: RECIPE_SCHEMA } },
    // Katalog her çağrıda aynı: önbelleğe alınır, sonraki parçalar ucuzlar.
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Bu ${items.length} ürün için reçete hazırla:\n\n${text}` }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new ExtractError("refusal", "Reçeteler hazırlanamadı, tekrar deneyin.");
  if (message.stop_reason === "max_tokens") throw new ExtractError("too-long", "Çok fazla ürün gönderildi; daha az ürünle deneyin.");
  let parsed;
  try {
    parsed = JSON.parse(message.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
  } catch {
    throw new ExtractError("bad-output", "Reçeteler hazırlanırken bir sorun oldu, tekrar deneyin.");
  }
  const u = message.usage || {};
  const inputTokens = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  const outputTokens = u.output_tokens || 0;
  return {
    results: sanitize(parsed, items),
    usage: { inputTokens, outputTokens, cacheRead: u.cache_read_input_tokens || 0 },
    // Önbellekten okunan girdi liste fiyatının ~%10'u.
    costUsd: ((inputTokens - (u.cache_read_input_tokens || 0) * 0.9) * PRICE_IN + outputTokens * PRICE_OUT) / 1e6,
    model: message.model,
  };
}

module.exports = { suggestRecipes, describeItem, sanitize };
