import type { Ingredient, VariantGroup } from "./types";

// Kafelerde sık kullanılan seçenek grupları. Ürüne "şablondan ekle" ile kopyalanır, sonra düzenlenebilir.
// Kalori farkları küçük boy reçetesine göre örnek değerlerdir; işletme kendi reçetesine göre güncellemeli.

const uid = () => Math.random().toString(36).slice(2, 9);
const ing = (tr: string, en: string, extra: Omit<Ingredient, "name"> = {}): Ingredient => ({ name: { tr, en }, ...extra });

export const VARIANT_TEMPLATES: { key: string; label: string; build: () => VariantGroup }[] = [
  {
    key: "size",
    label: "Boy (Küçük/Orta/Büyük)",
    build: () => ({
      id: `size-${uid()}`,
      name: { tr: "Boy", en: "Size" },
      selection: "single",
      options: [
        { id: uid(), name: { tr: "Küçük", en: "Small" }, priceDelta: 0, portion: "250 ml" },
        { id: uid(), name: { tr: "Orta", en: "Medium" }, priceDelta: 15, calorieDelta: 0, portion: "350 ml" },
        { id: uid(), name: { tr: "Büyük", en: "Large" }, priceDelta: 30, calorieDelta: 0, portion: "450 ml" },
      ],
    }),
  },
  {
    key: "milk",
    label: "Süt seçimi",
    build: () => ({
      id: `milk-${uid()}`,
      name: { tr: "Süt seçimi", en: "Milk" },
      selection: "single",
      options: [
        { id: uid(), name: { tr: "İnek sütü", en: "Cow's milk" }, priceDelta: 0, ingredients: [ing("Süt", "Milk", { allergens: ["milk"] })] },
        {
          id: uid(),
          name: { tr: "Laktozsuz süt", en: "Lactose-free milk" },
          priceDelta: 0,
          ingredients: [ing("Laktozsuz süt", "Lactose-free milk", { allergens: ["milk"] })],
        },
        {
          id: uid(),
          name: { tr: "Yulaf içeceği", en: "Oat drink" },
          priceDelta: 20,
          calorieDelta: -32,
          ingredients: [ing("Yulaf içeceği", "Oat drink", { allergens: ["gluten"] })],
        },
        {
          id: uid(),
          name: { tr: "Badem içeceği", en: "Almond drink" },
          priceDelta: 20,
          calorieDelta: -72,
          ingredients: [ing("Badem içeceği", "Almond drink", { allergens: ["nuts"] })],
        },
      ],
    }),
  },
  {
    key: "coffee-extras",
    label: "Kahve ekstraları (şurup, shot, krema)",
    build: () => ({
      id: `extras-${uid()}`,
      name: { tr: "Ekstralar", en: "Extras" },
      selection: "multi",
      options: [
        { id: uid(), name: { tr: "Ekstra shot", en: "Extra shot" }, priceDelta: 25, calorieDelta: 2, ingredients: [ing("Espresso", "Espresso")] },
        {
          id: uid(),
          name: { tr: "Vanilya şurubu", en: "Vanilla syrup" },
          priceDelta: 20,
          calorieDelta: 65,
          ingredients: [ing("Vanilya aromalı şurup", "Vanilla flavoured syrup")],
        },
        {
          id: uid(),
          name: { tr: "Karamel şurubu", en: "Caramel syrup" },
          priceDelta: 20,
          calorieDelta: 65,
          ingredients: [ing("Karamel aromalı şurup", "Caramel flavoured syrup")],
        },
        {
          id: uid(),
          name: { tr: "Krema", en: "Whipped cream" },
          priceDelta: 20,
          calorieDelta: 70,
          ingredients: [ing("Krema", "Whipped cream", { allergens: ["milk"] })],
        },
      ],
    }),
  },
  {
    key: "empty-single",
    label: "Boş tekli seçim grubu",
    build: () => ({ id: `group-${uid()}`, name: { tr: "" }, selection: "single", options: [] }),
  },
  {
    key: "empty-multi",
    label: "Boş ekstra grubu",
    build: () => ({ id: `group-${uid()}`, name: { tr: "" }, selection: "multi", options: [] }),
  },
];

export const newOptionId = uid;
