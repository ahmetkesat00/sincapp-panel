// Menü Sihirbazı yardımcıları: logodan tema renkleri ve içeriğe göre tasarım önerisi.

import { loadLogoDataUrl } from "./qr-style";
import type { DesignGroup, MenuCategory, MenuItem, MenuLayout, MenuTheme } from "./types";

// ─── Renk dönüşümleri ───

type Hsl = { h: number; s: number; l: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function rgbToHsl(r: number, g: number, b: number): Hsl {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}

const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Logo okunamadı"));
    img.src = src;
  });
}

export type LogoPalette = {
  theme: MenuTheme;
  /** Logoda bulunan belirgin renkler (en baskın önce); panelde gösterilir. */
  swatches: string[];
  /** Logo siyah-beyaz/gri ise renk logodan değil nötr tonlardan üretildi. */
  monochrome: boolean;
};

/**
 * Logodaki baskın renklerden menü teması üretir. Ana renk beyaz yazı taşıyabilecek koyulukta,
 * Koyu aynı tonun derin hâli, Vurgu logodaki ikinci renk (yoksa ana renge uyan sıcak bir ton).
 */
export async function paletteFromLogo(logoUrl: string): Promise<LogoPalette> {
  const img = await loadImage(await loadLogoDataUrl(logoUrl));
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tarayıcı görseli işleyemedi");
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // Tonları 15°'lik kovalara topla; doygun pikseller daha ağır sayılır. Beyaz, siyah, gri ve saydam atlanır.
  const buckets = new Map<number, { weight: number; h: number; s: number; l: number; n: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const c = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (c.l > 0.92 || c.l < 0.08 || c.s < 0.18) continue;
    const key = Math.floor(c.h / 15);
    const b = buckets.get(key) ?? { weight: 0, h: 0, s: 0, l: 0, n: 0 };
    b.weight += c.s;
    b.h += c.h;
    b.s += c.s;
    b.l += c.l;
    b.n += 1;
    buckets.set(key, b);
  }
  const colors = [...buckets.values()]
    .filter((b) => b.n >= 6)
    .sort((a, b) => b.weight - a.weight)
    .map((b) => ({ weight: b.weight, hsl: { h: b.h / b.n, s: b.s / b.n, l: b.l / b.n } }));

  if (colors.length === 0) {
    return {
      monochrome: true,
      swatches: [],
      theme: { primary: "#2b2b2b", primaryDark: "#141414", accent: "#c9a46a" },
    };
  }

  const main = colors[0].hsl;
  const second = colors.find((c) => hueDistance(c.hsl.h, main.h) >= 40 && c.weight >= colors[0].weight * 0.15)?.hsl;
  const primary: Hsl = { h: main.h, s: clamp(main.s, 0.35, 0.8), l: clamp(main.l, 0.28, 0.45) };
  const primaryDark: Hsl = { h: main.h, s: clamp(main.s * 0.9, 0.25, 0.7), l: 0.16 };
  const isWarm = main.h >= 20 && main.h <= 65;
  const accent: Hsl = second
    ? { h: second.h, s: clamp(second.s, 0.55, 0.9), l: clamp(second.l, 0.55, 0.68) }
    : isWarm
      ? { h: main.h, s: 0.75, l: 0.72 } // sarı-turuncu markada aynı tonun açığı
      : { h: 40, s: 0.68, l: 0.6 }; // diğerlerinde her renge uyan sıcak altın

  return {
    monochrome: false,
    swatches: colors.slice(0, 4).map((c) => hslToHex(c.hsl)),
    theme: { primary: hslToHex(primary), primaryDark: hslToHex(primaryDark), accent: hslToHex(accent) },
  };
}

// ─── Tasarım önerisi ───

export type DesignSuggestion = {
  /** Fotoğraf oranına göre kategori (sihirbaz bu sekmeyi açar). */
  group: DesignGroup;
  groupReason: string;
  /** Kategori içinde en uygun tasarım. */
  best: MenuLayout;
  bestReason: string;
};

/**
 * Menünün içeriğine göre kategori ve o kategorideki en uygun tasarım:
 * fotoğraflı ürün oranı %60+ görsel ağırlıklı, %15+ karma, altı yazı ağırlıklı.
 */
export function suggestDesigns(items: MenuItem[], categories: MenuCategory[]): DesignSuggestion {
  const visible = items.filter((i) => i.isVisible);
  const n = visible.length;
  const photoRatio = n ? visible.filter((i) => i.imageUrl).length / n : 0;
  const sizeRatio = n ? visible.filter((i) => i.variants?.some((g) => g.selection === "single")).length / n : 0;
  const manyCategories = categories.length >= 8;
  const percent = `%${Math.round(photoRatio * 100)}`;

  if (n === 0) {
    return { group: "mixed", groupReason: "Henüz ürün yok; karma tasarımlar fotoğraflı da fotoğrafsız da iyi görünür.", best: "classic", bestReason: "Her menüye uyar." };
  }
  if (photoRatio >= 0.6) {
    return manyCategories
      ? { group: "photo", groupReason: `Ürünlerinizin ${percent}'inde fotoğraf var.`, best: "showcase", bestReason: "Çok kategoride fotoğrafları derli toplu ızgarada gösterir." }
      : { group: "photo", groupReason: `Ürünlerinizin ${percent}'inde fotoğraf var.`, best: "gallery", bestReason: "Büyük fotoğraf kartları iştah açar." };
  }
  if (photoRatio >= 0.15) {
    const groupReason = `Ürünlerinizin bir kısmında fotoğraf var (${percent}).`;
    if (manyCategories) return { group: "mixed", groupReason, best: "sidebar", bestReason: `${categories.length} kategoriniz var; kategoriler solda hep görünür.` };
    if (sizeRatio >= 0.3) return { group: "mixed", groupReason, best: "quick", bestReason: "Boy seçenekli ürünleriniz çok; fiyatlar satırda yan yana görünür." };
    return { group: "mixed", groupReason, best: "classic", bestReason: "Fotoğraflı ve fotoğrafsız ürünler bir arada dengeli görünür." };
  }
  const groupReason = photoRatio > 0 ? "Ürünlerinizin çok azında fotoğraf var." : "Ürünlerinizde fotoğraf yok.";
  if (sizeRatio >= 0.3) return { group: "text", groupReason, best: "paper", bestReason: "Basılı menü düzeninde fiyatlar noktalı çizgiyle hizalı, okunaklı." };
  return { group: "text", groupReason, best: "editorial", bestReason: "Zarif yazılar ve açıklamalar menüyü taşır." };
}

/** Önizleme linkine eklenecek renk parametreleri (# olmadan). */
export const themeQuery = (t: MenuTheme) =>
  `ana=${t.primary.slice(1)}&koyu=${t.primaryDark.slice(1)}&vurgu=${t.accent.slice(1)}`;

// ─── Tasarım uyarıları ───

/** Üst kısmında kafenin kapak fotoğrafını kullanan tasarımlar (menü sitesi: MenuHeader, CoverHeader, NightHeader). */
const COVER_DESIGNS = new Set<MenuLayout>(["classic", "showcase", "gallery", "rows", "night"]);

export type MenuPhotoStats = { itemCount: number; photoRatio: number; hasCover: boolean };

export function photoStats(items: MenuItem[], heroImage?: string): MenuPhotoStats {
  const visible = items.filter((i) => i.isVisible);
  return {
    itemCount: visible.length,
    photoRatio: visible.length ? visible.filter((i) => i.imageUrl).length / visible.length : 0,
    hasCover: Boolean(heroImage),
  };
}

/** Seçilen tasarım menüye uymuyorsa bilgilendirme (seçimi engellemez). */
export function designWarnings(id: MenuLayout, group: DesignGroup, stats: MenuPhotoStats): string[] {
  const warnings: string[] = [];
  const percent = `%${Math.round(stats.photoRatio * 100)}`;
  if (stats.itemCount > 0 && group === "photo" && stats.photoRatio < 0.6) {
    warnings.push(
      `Ürünlerinizin ${stats.photoRatio === 0 ? "hiçbirinde" : `sadece ${percent}'inde`} fotoğraf var. Bu tasarım fotoğraflarla güzel görünür; fotoğrafsız ürünler sade liste olarak gösterilir.`,
    );
  }
  if (stats.itemCount > 0 && group === "text" && stats.photoRatio >= 0.3) {
    warnings.push(`Bu tasarım ürün fotoğraflarını göstermez; ürünlerinizin ${percent}'inde fotoğraf var.`);
  }
  if (COVER_DESIGNS.has(id) && !stats.hasCover) {
    warnings.push("Bu tasarımın üstünde kapak fotoğrafı yer alır. Kapak fotoğrafınız olmadığı için marka renginde desen gösterilir; İşletme Yönetimi'nden ekleyebilirsiniz.");
  }
  return warnings;
}
