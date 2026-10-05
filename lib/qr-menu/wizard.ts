// Menü Sihirbazı yardımcıları: logodan tema renkleri ve içeriğe göre tasarım önerisi.

import { loadLogoDataUrl } from "./qr-style";
import type { MenuCategory, MenuItem, MenuLayout, MenuTheme } from "./types";

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

export type DesignSuggestion = { id: MenuLayout; reason: string };

/** Menünün içeriğine göre en uygun üç tasarım (ilki en uygun). */
export function suggestDesigns(items: MenuItem[], categories: MenuCategory[]): DesignSuggestion[] {
  const visible = items.filter((i) => i.isVisible);
  const n = visible.length;
  const photoRatio = n ? visible.filter((i) => i.imageUrl).length / n : 0;
  const sizeRatio = n ? visible.filter((i) => i.variants?.some((g) => g.selection === "single")).length / n : 0;

  let list: DesignSuggestion[];
  if (n === 0) {
    list = [
      { id: "classic", reason: "Her menüye uyar; fotoğraflı da fotoğrafsız da iyi görünür." },
      { id: "showcase", reason: "Ürün fotoğrafı ekleyecekseniz onları öne çıkarır." },
      { id: "editorial", reason: "Fotoğraf eklemeyecekseniz şık ve sade durur." },
    ];
  } else if (photoRatio >= 0.6) {
    list = [
      { id: "gallery", reason: "Ürünlerinizin çoğunda fotoğraf var; büyük fotoğraf kartları iştah açar." },
      { id: "showcase", reason: "Çok sevilenler şeridi ve fotoğraf ızgarası." },
      { id: "classic", reason: "Fotoğraflar küçük, liste derli toplu." },
    ];
  } else if (photoRatio >= 0.2) {
    list = [
      { id: "classic", reason: "Fotoğraflı ve fotoğrafsız ürünler bir arada dengeli görünür." },
      { id: "rows", reason: "Her kategori yana kayan şerit; az kaydırmayla çok ürün." },
      { id: "quick", reason: "Sıkı liste, hızlı seçim." },
    ];
  } else {
    list = [
      { id: "editorial", reason: "Ürünlerinizde fotoğraf yok; zarif yazılar menüyü taşır." },
      { id: "paper", reason: "Basılı menü hissi; fotoğrafsız menülere çok yakışır." },
      { id: "quick", reason: "Sade ve hızlı okunan liste." },
    ];
  }

  // Boy seçenekli ürünler çoksa satırda boy fiyatlarını gösteren Hızlı öne geçsin.
  if (sizeRatio >= 0.3 && photoRatio < 0.6 && list[0].id !== "quick") {
    list = [{ id: "quick", reason: "Boy seçenekli ürünleriniz çok; fiyatlar satırda yan yana görünür." }, ...list.filter((d) => d.id !== "quick")];
  }
  // Çok kategorili büyük menülerde kategoriler yanda sabit dursun.
  if (categories.length >= 8) {
    list = [{ id: "sidebar", reason: `${categories.length} kategoriniz var; kategoriler solda hep görünür.` }, ...list.filter((d) => d.id !== "sidebar")];
  }
  return list.slice(0, 3);
}

/** Önizleme linkine eklenecek renk parametreleri (# olmadan). */
export const themeQuery = (t: MenuTheme) =>
  `ana=${t.primary.slice(1)}&koyu=${t.primaryDark.slice(1)}&vurgu=${t.accent.slice(1)}`;
