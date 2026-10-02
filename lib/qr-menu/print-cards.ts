import type { CardTemplate } from "./qr-style";

// Yazdırılabilir QR kartlarının HTML'i. Hem yazdırma penceresinde hem kişiselleştirme önizlemesinde kullanılır.

export type CardEntry = { table?: number; svg: string };

type Options = {
  cafeName: string;
  logoUrl?: string;
  heroImage?: string;
  color: string;
  template: CardTemplate;
  entries: CardEntry[];
  /** true: yazdırma penceresi; görseller yüklenince yazdır diyaloğunu açar. */
  autoPrint: boolean;
  /** Önizleme için tek kartı kendi boyutunda gösterir (sayfa ızgarası olmadan). */
  preview?: boolean;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Kılavuz md. 41.4: karekodla sunulan bilgi için cihazı olmayanlara talep hâlinde sunulacağı yazılı olmalı.
const NOTICE =
  "Ürünlerin içerik, alerjen ve kalori bilgilerine bu karekod ile ulaşabilirsiniz. Karekod okutacak cihazı olmayan misafirlerimize talep etmeleri hâlinde bu bilgiler ayrıca sunulur.";

function face(o: Options, e: CardEntry) {
  const logo = o.logoUrl ? `<img class="logo" src="${esc(o.logoUrl)}" alt="" />` : "";
  return `
    <div class="brand">${o.template === "cover" ? "" : logo}<span class="name">${esc(o.cafeName)}</span></div>
    <div class="cta">Menü için okutun<span>Scan for menu</span></div>
    <div class="qr">${e.svg}</div>
    ${e.table ? `<div class="table">Masa ${e.table}</div>` : ""}
    <p class="notice">${NOTICE}</p>
    <div class="footer">LoopyGo QR Menü</div>`;
}

function card(o: Options, e: CardEntry) {
  if (o.template === "tent") {
    // Ortadan katlanır: üst yüz ters basılır, katlanınca iki taraftan da düz okunur.
    return `<div class="card tent"><div class="face flip">${face(o, e)}</div><div class="fold"></div><div class="face">${face(o, e)}</div></div>`;
  }
  const cover =
    o.template === "cover"
      ? `<div class="cover">${o.heroImage ? `<img src="${esc(o.heroImage)}" alt="" />` : ""}</div>${
          o.logoUrl ? `<img class="cover-logo" src="${esc(o.logoUrl)}" alt="" />` : ""
        }`
      : "";
  return `<div class="card ${o.template}">${cover}<div class="body">${face(o, e)}</div></div>`;
}

export function buildCardsHtml(o: Options): string {
  const c = o.color;
  const style = `
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1d1b;
           -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm; }
    .card { position: relative; height: 132mm; border: 1px dashed #b8b8b8; border-radius: 4mm; overflow: hidden;
            break-inside: avoid; page-break-inside: avoid; background: #fff; }
    .body, .face { height: 100%; padding: 7mm 6mm; display: flex; flex-direction: column; align-items: center;
                   justify-content: space-between; text-align: center; }
    .brand { display: flex; align-items: center; gap: 3mm; }
    .logo { width: 12mm; height: 12mm; border-radius: 3mm; object-fit: cover; }
    .name { font-size: 15pt; font-weight: 800; }
    .cta { font-size: 14pt; font-weight: 800; color: ${c}; }
    .cta span { display: block; font-size: 9pt; font-weight: 600; color: #777; }
    .qr { line-height: 0; }
    .qr svg { width: 58mm; height: 58mm; display: block; }
    .table { font-size: 18pt; font-weight: 800; color: #fff; background: ${c}; padding: 1.5mm 7mm; border-radius: 20mm; }
    .notice { margin: 0; font-size: 6.5pt; line-height: 1.35; color: #555; }
    .footer { font-size: 6.5pt; color: #9a9a9a; letter-spacing: 0.05em; }

    /* Marka rengi: dolu arka plan, QR beyaz kutuda (kontrast korunur) */
    .card.brand { background: ${c}; border-style: solid; border-color: ${c}; }
    .card.brand .name, .card.brand .cta { color: #fff; }
    .card.brand .cta span, .card.brand .notice { color: rgba(255,255,255,.82); }
    .card.brand .footer { color: rgba(255,255,255,.6); }
    .card.brand .qr { background: #fff; padding: 3mm; border-radius: 4mm; }
    .card.brand .qr svg { width: 52mm; height: 52mm; }
    .card.brand .table { background: #fff; color: ${c}; }

    /* Kapak fotoğraflı */
    .card.cover .cover { height: 34mm; background: ${c}; }
    .card.cover .cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .card.cover .cover-logo { position: absolute; top: 26mm; left: 50%; transform: translateX(-50%); width: 15mm; height: 15mm;
                              border-radius: 4mm; object-fit: cover; border: 1mm solid #fff; background: #fff; }
    .card.cover .body { height: calc(100% - 34mm); padding-top: 9mm; }
    .card.cover .qr svg { width: 42mm; height: 42mm; }
    .card.cover .table { font-size: 15pt; }

    /* Masa üstü katlanır kart: iki yüz, ortada katlama çizgisi */
    .card.tent { height: 270mm; display: flex; flex-direction: column; }
    .card.tent .face { height: 50%; padding: 6mm; }
    .card.tent .face.flip { transform: rotate(180deg); }
    .card.tent .fold { border-top: 1px dashed #999; position: relative; }
    .card.tent .fold::after { content: "katlama çizgisi"; position: absolute; right: 3mm; top: -3.2mm; font-size: 6pt; color: #999; background: #fff; padding: 0 1mm; }
    .card.tent .qr svg { width: 50mm; height: 50mm; }

    @media screen { body { background: #eee; padding: 10mm; } .grid { max-width: 190mm; margin: 0 auto; } }
    ${o.preview ? `@media screen { body { padding: 0; background: transparent; } .grid { display: block; width: 92mm; } }` : ""}
  `;

  const entries = o.preview ? o.entries.slice(0, 1) : o.entries;
  const printScript = o.autoPrint
    ? `<script>
        const imgs = [...document.images];
        Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))).then(() => setTimeout(() => window.print(), 200));
      </script>`
    : "";

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8" />
    <title>${esc(o.cafeName)} · QR ${entries.some((e) => e.table) ? "masa kartları" : "kartı"}</title>
    <style>${style}</style></head>
    <body><div class="grid">${entries.map((e) => card(o, e)).join("")}</div>${printScript}</body></html>`;
}
