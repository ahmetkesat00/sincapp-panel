import type { QrStyle } from "./qr-style";

// QR Menü veri modeli. menu.loopygo.app (loopygo-menu projesi, lib/types.ts) ile birebir aynı
// tutulmalı — bir tarafta alan eklenirse diğerine de eklenmeli.
//
// Firestore:
//   cafes/{cafeId}.qrMenu                   → QrMenuSettings
//   cafes/{cafeId}/menuCategories/{id}      → MenuCategory
//   cafes/{cafeId}/menuItems/{id}           → MenuItem
//   menuSlugs/{slug}                        → { cafeId }  (eski slug'lar da kalır; menü sitesi güncel slug'a yönlendirir)

export type Locale = "tr" | "en";

export type LocalizedText = { tr: string; en?: string };

export type Allergen =
  | "gluten"
  | "crustaceans"
  | "eggs"
  | "fish"
  | "peanuts"
  | "soy"
  | "milk"
  | "nuts"
  | "celery"
  | "mustard"
  | "sesame"
  | "sulphites"
  | "lupin"
  | "molluscs";

export type DietTag = "vegan" | "vegetarian" | "glutenFree" | "spicy";

export type ItemBadge = "new" | "chef" | "popular";

export type TimeRange = { open: string; close: string };

/** menu.loopygo.app tasarımları — loopygo-menu/lib/layouts.ts ile aynı tutulmalı. */
export const MENU_DESIGNS = [
  { id: "classic", name: "Klasik", description: "Kapak fotoğrafı, bilgi kartı ve küçük fotoğraflı liste. Her işletmeye uyar." },
  { id: "editorial", name: "Editoryal", description: "Fotoğrafsız, zarif tipografi. Açıklamaları ve tat notları öne çıkar." },
  { id: "showcase", name: "Vitrin", description: "Çok sevilenler şeridi ve ikili fotoğraf ızgarası. Fotoğrafları güçlü menüler için." },
  { id: "quick", name: "Hızlı", description: "Kategori kutucukları, sıkı liste ve satırda boy fiyatları. Hızlı karar için." },
  { id: "night", name: "Gece", description: "Koyu zemin ve parlak vurgular; büyük harfli başlıklar. Loş ortamlarda rahat okunur.", defaultDark: true },
  { id: "gallery", name: "Galeri", description: "Tam genişlikte büyük fotoğraf kartları; ad ve fiyat fotoğrafın üstünde." },
  { id: "paper", name: "Menü Kartı", description: "Basılı menü hissi: kâğıt zemin, çerçeve ve noktalı fiyat çizgileri." },
  { id: "colorful", name: "Renkli", description: "Her kategori ayrı renkli bir blok. Neşeli ve samimi." },
  { id: "rows", name: "Şeritler", description: "Her kategori yana kayan bir kart şeridi. Az kaydırmayla çok ürün." },
  { id: "sidebar", name: "Yan Menü", description: "Kategoriler solda, ürünler sağda. Çok kategorili büyük menüler için." },
] as const satisfies readonly { id: string; name: string; description: string; defaultDark?: boolean }[];

export type MenuLayout = (typeof MENU_DESIGNS)[number]["id"];

export type QrMenuSettings = {
  /** Yayındaki tasarım (verilmezse Klasik). */
  layout?: MenuLayout;
  /** Seçilmiş ama henüz yayınlanmamış tasarım. */
  layoutDraft?: MenuLayout;
  /** Müşteri gece modunu açıp kapatabilsin mi (varsayılan: evet). */
  darkToggle?: boolean;
  /** Menünün açılış modu; verilmezse tasarımın varsayılanı. */
  defaultMode?: "light" | "dark";
  enabled: boolean;
  slug: string;
  tagline?: LocalizedText;
  phone?: string;
  wifi?: { ssid: string; password?: string };
  theme: { primary: string; primaryDark: string; accent: string };
  locales: Locale[];
  timezone: string;
  pricesUpdatedAt: string;
  /** Panelde QR kişiselleştirme ayarları (menü sitesi kullanmaz). */
  qrStyle?: QrStyle;
};

export type MenuCategory = {
  id: string;
  name: LocalizedText;
  description?: LocalizedText;
  sortOrder: number;
  servedBetween?: TimeRange;
};

export type Ingredient = {
  name: LocalizedText;
  allergens?: Allergen[];
  alcohol?: boolean;
  pork?: boolean;
};

export type VariantOption = {
  id: string;
  name: LocalizedText;
  priceDelta: number;
  calorieDelta?: number;
  portion?: string;
  ingredients?: Ingredient[];
};

export type VariantGroup = {
  id: string;
  name: LocalizedText;
  selection: "single" | "multi";
  options: VariantOption[];
};

export type CalorieSource = "turkomp_recipe" | "supplier_label" | "supplier_recipe" | "lab" | "estimate";

export type MenuItem = {
  id: string;
  categoryId: string;
  name: LocalizedText;
  description?: LocalizedText;
  price: number;
  imageUrl?: string;
  ingredients: Ingredient[];
  variants?: VariantGroup[];
  dietTags?: DietTag[];
  portion?: string;
  calories?: number;
  calorieInfo?: {
    source: CalorieSource;
    updatedAt: string;
    supplier?: string;
    note?: string;
    docs?: string[];
  };
  badges?: ItemBadge[];
  isAvailable: boolean;
  isVisible: boolean;
  loyaltyItemTypeId?: string;
  sortOrder: number;
};

// ─── Etiketler (panel Türkçe) ───

export const ALLERGENS: { key: Allergen; label: string }[] = [
  { key: "gluten", label: "Gluten" },
  { key: "milk", label: "Süt" },
  { key: "eggs", label: "Yumurta" },
  { key: "nuts", label: "Sert kabuklu yemiş" },
  { key: "peanuts", label: "Yer fıstığı" },
  { key: "soy", label: "Soya" },
  { key: "sesame", label: "Susam" },
  { key: "mustard", label: "Hardal" },
  { key: "celery", label: "Kereviz" },
  { key: "sulphites", label: "Sülfit" },
  { key: "fish", label: "Balık" },
  { key: "crustaceans", label: "Kabuklu deniz ürünleri" },
  { key: "molluscs", label: "Yumuşakçalar" },
  { key: "lupin", label: "Acı bakla" },
];

export const DIET_TAGS: { key: DietTag; label: string }[] = [
  { key: "vegan", label: "Vegan" },
  { key: "vegetarian", label: "Vejetaryen" },
  { key: "glutenFree", label: "Glutensiz" },
  { key: "spicy", label: "Acılı" },
];

export const BADGES: { key: ItemBadge; label: string }[] = [
  { key: "new", label: "Yeni" },
  { key: "chef", label: "Şefin önerisi" },
  { key: "popular", label: "Çok sevilen" },
];

export const CALORIE_SOURCES: { key: CalorieSource; label: string; hint: string }[] = [
  { key: "turkomp_recipe", label: "Reçete × TürKomp", hint: "Kendi reçetenizin gramajları × TürKomp ortalama değerleri (kılavuzdaki yöntem)" },
  { key: "supplier_label", label: "Tedarikçi etiketi", hint: "Etiketteki kcal/100 g × porsiyon gramı" },
  { key: "supplier_recipe", label: "Tedarikçi reçetesi", hint: "Tedarikçiden alınan gramajlar × TürKomp" },
  { key: "lab", label: "Laboratuvar analizi", hint: "Akredite laboratuvar raporu" },
  { key: "estimate", label: "Tahmini (benzer ürün)", hint: "TürKomp'taki benzer ürün × tartılmış porsiyon" },
];

/** Paneldeki sadakat kartı ürün türleriyle aynı (loyalty-tab ITEM_TYPES). */
export const LOYALTY_ITEM_TYPES: { value: string; label: string }[] = [
  { value: "kahve", label: "Kahve" },
  { value: "cay", label: "Çay" },
  { value: "tatli", label: "Tatlı" },
  { value: "dondurma", label: "Dondurma" },
  { value: "pizza", label: "Pizza" },
  { value: "burger", label: "Burger" },
  { value: "firin", label: "Fırın" },
  { value: "yemek", label: "Yemek" },
  { value: "icecek", label: "İçecek" },
  { value: "diger", label: "Diğer" },
];

export const MENU_BASE_URL = process.env.NEXT_PUBLIC_MENU_BASE_URL ?? "https://menu.loopygo.app";

export const DEFAULT_SETTINGS: Omit<QrMenuSettings, "slug"> = {
  enabled: false,
  theme: { primary: "#2F6B55", primaryDark: "#1c4535", accent: "#d4a24e" },
  locales: ["tr"],
  timezone: "Europe/Istanbul",
  pricesUpdatedAt: new Date().toISOString().slice(0, 10),
};
