import { MENU_BASE_URL } from "./types";

// QR kişiselleştirme: cafes/{cafeId}.qrMenu.qrStyle alanında saklanır.
// Kütüphaneler (qr-code-styling, jsqr) tarayıcıya özgü olduğu için fonksiyonların içinde dinamik yüklenir.

export type QrDotStyle = "square" | "rounded" | "dots" | "classy-rounded";
export type QrCornerStyle = "square" | "extra-rounded" | "dot";
export type CardTemplate = "minimal" | "brand" | "cover" | "tent";

export type QrStyle = {
  logo: boolean;
  logoSize: "small" | "medium";
  color: string;
  dots: QrDotStyle;
  corners: QrCornerStyle;
  template: CardTemplate;
};

export const DEFAULT_QR_STYLE: QrStyle = {
  logo: false,
  logoSize: "small",
  color: "#000000",
  dots: "square",
  corners: "square",
  template: "minimal",
};

export const DOT_STYLES: { key: QrDotStyle; label: string }[] = [
  { key: "square", label: "Kare" },
  { key: "rounded", label: "Yuvarlak" },
  { key: "dots", label: "Nokta" },
  { key: "classy-rounded", label: "Zarif" },
];

export const CORNER_STYLES: { key: QrCornerStyle; label: string }[] = [
  { key: "square", label: "Kare" },
  { key: "extra-rounded", label: "Yuvarlak" },
  { key: "dot", label: "Daire" },
];

export const CARD_TEMPLATES: { key: CardTemplate; label: string; hint: string }[] = [
  { key: "minimal", label: "Minimal", hint: "Beyaz, sade" },
  { key: "brand", label: "Marka rengi", hint: "Kafenin renginde dolu arka plan" },
  { key: "cover", label: "Kapak fotoğraflı", hint: "Üstte kafenin kapak fotoğrafı" },
  { key: "tent", label: "Masa üstü (katlanır)", hint: "Ortadan katlanır, iki yüzden okunur" },
];

// ─── Renk / kontrast ───

function luminance(hex: string): number {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m || m.length < 3) return 0;
  const [r, g, b] = m.slice(0, 3).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Beyaz zemine göre kontrast oranı (1–21). QR için en az ~4.5 önerilir. */
export const contrastOnWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

// ─── Logo ───

const logoCache = new Map<string, Promise<string>>();

/**
 * Logoyu QR'a gömülebilecek data URL'e çevirir. Firebase Storage CORS başlığı göndermediği için
 * menü sitesindeki /api/image aktarıcısı üzerinden indirilir.
 */
export function loadLogoDataUrl(logoUrl: string): Promise<string> {
  let cached = logoCache.get(logoUrl);
  if (!cached) {
    cached = fetch(`${MENU_BASE_URL}/api/image?u=${encodeURIComponent(logoUrl)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Logo alınamadı (${r.status})`);
        return r.blob();
      })
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          }),
      );
    cached.catch(() => logoCache.delete(logoUrl));
    logoCache.set(logoUrl, cached);
  }
  return cached;
}

// ─── QR üretimi ───

type RenderOptions = { size: number; margin?: number; logoDataUrl?: string };

async function createQr(style: QrStyle, data: string, { size, margin = 0, logoDataUrl }: RenderOptions, type: "svg" | "canvas") {
  const { default: QRCodeStyling } = await import("qr-code-styling");
  const withLogo = style.logo && Boolean(logoDataUrl);
  return new QRCodeStyling({
    type,
    width: size,
    height: size,
    margin,
    data,
    image: withLogo ? logoDataUrl : undefined,
    // Logo kodun bir kısmını kapattığı için en yüksek hata düzeltme seviyesi.
    qrOptions: { errorCorrectionLevel: withLogo ? "H" : "M" },
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: style.logoSize === "medium" ? 0.4 : 0.3,
      margin: Math.round(size / 80),
      saveAsBlob: true,
    },
    dotsOptions: { type: style.dots, color: style.color },
    cornersSquareOptions: { type: style.corners, color: style.color },
    cornersDotOptions: { type: style.corners === "square" ? "square" : "dot", color: style.color },
    backgroundOptions: { color: "#ffffff" },
  });
}

export async function renderQrSvg(style: QrStyle, data: string, options: RenderOptions): Promise<string> {
  const qr = await createQr(style, data, options, "svg");
  const blob = (await qr.getRawData("svg")) as Blob | null;
  if (!blob) throw new Error("QR üretilemedi");
  return blob.text();
}

export async function renderQrPng(style: QrStyle, data: string, options: RenderOptions): Promise<Blob> {
  const qr = await createQr(style, data, options, "canvas");
  const blob = (await qr.getRawData("png")) as Blob | null;
  if (!blob) throw new Error("QR üretilemedi");
  return blob;
}

/** QR'ı gerçekten okuyup beklenen linki verdiğini doğrular (telefon kamerası yerine jsQR). */
export async function isReadable(png: Blob, expected: string): Promise<boolean> {
  const { default: jsQR } = await import("jsqr");
  const bitmap = await createImageBitmap(png);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(data, width, height, { inversionAttempts: "dontInvert" })?.data === expected;
}
