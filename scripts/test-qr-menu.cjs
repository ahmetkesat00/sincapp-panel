const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const menuRoot = path.resolve(__dirname, '..', '..', 'loopygo-menu');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: id => { if (!(id in imports)) throw new Error(`Unexpected import: ${id}`); return imports[id]; }, console, Date, setTimeout, clearTimeout });
  return module.exports;
}
const tools = load('lib/qr-menu/product-tools.ts');
const customer = load(path.join(menuRoot, 'lib/menu.ts'));
const item = { id: 'i1', categoryId: 'c1', name: { tr: 'Çay' }, price: 100, ingredients: [{ name: { tr: 'Su' } }], calories: 100, calorieInfo: { source: 'estimate' }, isAvailable: true, isVisible: true, sortOrder: 0 };
test('Türkçe karakterler ve boşluklarla ürün aranır', () => assert.equal(tools.matchesProduct(item, ' CAY ', 'all'), true));
test('Gizli ürün filtresi görünür ürünü dışlar', () => assert.equal(tools.matchesProduct(item, '', 'hidden'), false));
test('Fiyat kontrolü bekleyen ürün inceleme filtresinde görünür', () => assert.equal(tools.matchesProduct({ ...item, priceNeedsReview: true }, '', 'review'), true));
test('Eksik İngilizce çeviri bulunur', () => assert.equal(tools.matchesProduct(item, '', 'translation'), true));
test('Doğrulanmamış fiyat görünür kaydedilemez', () => assert.match(tools.validateProduct({ ...item, priceNeedsReview: true }), /fiyatı kontrol/));
test('Eksik fiyat gizli taslak olarak tutulabilir', () => assert.equal(tools.validateProduct({ ...item, priceNeedsReview: true, isVisible: false }), null));
test('NaN ve sonsuz fiyat reddedilir', () => { assert.ok(tools.validateProduct({ ...item, price: NaN })); assert.ok(tools.validateProduct({ ...item, price: Infinity })); });
test('Negatif kalori reddedilir', () => assert.ok(tools.validateProduct({ ...item, calories: -1 })));
const group = { id: 'milk', name: { tr: 'Süt' }, selection: 'single', options: [ { id: 'cow', name: { tr: 'İnek' }, priceDelta: 0, ingredients: [{ name: { tr: 'Süt' }, allergens: ['milk'] }] }, { id: 'oat', name: { tr: 'Yulaf' }, priceDelta: 20, ingredients: [{ name: { tr: 'Yulaf' }, allergens: ['gluten'] }] } ] };
const latte = { ...item, variants: [group] };
test('Süt filtresi yulaf seçeneğini kabul eder', () => assert.equal(customer.canAvoidAllergens(latte, ['milk']), true));
test('Süt ve gluten aynı anda kaçınılamıyorsa ürün dışlanır', () => assert.equal(customer.canAvoidAllergens(latte, ['milk', 'gluten']), false));
test('Filtreye uygun varsayılan seçenek seçilir', () => assert.equal(customer.defaultSelection(latte, ['milk']).milk[0], 'oat'));
test('Doğrulanmamış alerjenler güvenli kabul edilmez', () => assert.equal(customer.canAvoidAllergens({ ...latte, allergensConfirmed: false }, ['milk']), false));
test('Temel malzemede alerjen varsa seçenek kurtaramaz', () => assert.equal(customer.canAvoidAllergens({ ...latte, ingredients: group.options[0].ingredients }, ['milk']), false));
test('İsteğe bağlı ekstra seçilmeden alerjenden kaçınılabilir', () => assert.equal(customer.canAvoidAllergens({ ...item, variants: [{ ...group, selection: 'multi' }] }, ['milk', 'gluten']), true));
test('Boş zorunlu seçenek grubu filtreye uygun değildir', () => assert.equal(customer.canAvoidAllergens({ ...item, variants: [{ ...group, options: [] }] }, ['milk']), false));
test('Boş grup detay açılışında uygulamayı çökertmez', () => assert.equal(customer.defaultSelection({ ...item, variants: [{ ...group, options: [] }] }).milk.length, 0));
test('Varsayılan seçenek farkı doğrulanır', () => assert.ok(tools.validateProduct({ ...item, variants: [{ ...group, options: [{ ...group.options[0], priceDelta: 10 }] }] })));
test('Birden çok negatif ekstra toplam fiyatı negatife düşüremez', () => assert.ok(tools.validateProduct({ ...item, variants: [{ ...group, selection: 'multi', options: [{ ...group.options[0], priceDelta: -60 }, { ...group.options[1], priceDelta: -60 }] }] })));
test('Kampanya metni: rewardGift hediye adedi değil, kaçıncı ürünün hediye olduğu', () => { assert.equal(customer.loyaltyOffer({ rewardBuy: 5, rewardGift: 6 }, 'tr', 'kahve'), '5 kahve al, 6. kahven hediye'); assert.equal(customer.loyaltyOffer({ rewardBuy: 9, rewardGift: 10 }, 'tr', 'yemek'), '9 yemek al, 10. yemeğin hediye'); assert.equal(customer.loyaltyOffer({ rewardBuy: 5, rewardGift: 6 }, 'en', 'coffee'), 'Buy 5 coffee, get the 6th free'); });
let id = 0;
const importer = load('lib/qr-menu/import.ts', {
  'firebase/functions': { httpsCallable: () => () => {} },
  '@/lib/firebase': { functions: {} },
  './firestore': { newCategoryId: () => 'c' + ++id, newItemId: () => 'i' + ++id },
});
const importedItem = { name: 'Latte', nameEn: null, description: null, price: null, sizes: [], portion: null, calories: null, ingredients: [], dietTags: [] };
const imported = { categories: [{ name: 'Kahve', nameEn: null, description: null, servedFrom: null, servedTo: null, items: [importedItem] }], notes: [] };
test('Okunamayan fiyat gizli ve kontrol bekliyor olarak hazırlanır', () => { const { items } = importer.toMenuRecords(imported, 'cafe', { startOrder: 0, visible: true }); assert.equal(items[0].isVisible, false); assert.equal(items[0].priceNeedsReview, true); });
test('Yayındaki menüye aktarılan yeni ürün gizlidir', () => { const data = { ...imported, categories: [{ ...imported.categories[0], items: [{ ...importedItem, price: 120 }] }] }; const { items } = importer.toMenuRecords(data, 'cafe', { startOrder: 0, visible: false }); assert.equal(items[0].isVisible, false); assert.equal(items[0].price, 120); });
test('Boy fiyatları temel fiyat ve doğru farklara çevrilir', () => { const data = { ...imported, categories: [{ ...imported.categories[0], items: [{ ...importedItem, sizes: [{ name: 'Büyük', price: 160 }, { name: 'Küçük', price: 100 }] }] }] }; const i = importer.toMenuRecords(data, 'cafe', { startOrder: 0, visible: true }).items[0]; assert.equal(i.price, 100); assert.equal(i.variants[0].options[0].priceDelta, 0); assert.equal(i.variants[0].options[1].priceDelta, 60); assert.equal(i.isVisible, true); });
const writes = [];
let reserved = null;
const firestore = load('lib/qr-menu/firestore.ts', {
  'firebase/firestore': { collection: (_db, ...p) => p.join('/'), doc: (_db, ...p) => p.join('/'), serverTimestamp: () => 'timestamp', runTransaction: async (_db, callback) => callback({ get: async () => ({ exists: () => Boolean(reserved), data: () => reserved }), set: (...args) => writes.push(['set', ...args]), update: (...args) => writes.push(['update', ...args]) }), writeBatch: () => { const planned = []; return { set: (...args) => planned.push(['set', ...args]), update: (...args) => planned.push(['update', ...args]), commit: async () => writes.push(...planned) }; } },
  'firebase/storage': {}, '@/lib/firebase': { db: {}, storage: {} }, './types': { DEFAULT_SETTINGS: {} }, './product-tools': tools,
});
(async () => {
  const settings = { slug: 'test-menu', enabled: false };
  writes.length = 0;
  await firestore.saveSettings('cafe', settings, { categories: [{ id: 'c1', name: { tr: 'Kahve' }, sortOrder: 0 }], items: [item] });
  test('Adres, ayar, kategori ve ürün aynı transaction içinde yazılır', () => assert.deepEqual(writes.map(w => w[0]), ['set', 'update', 'set', 'set']));
  reserved = { cafeId: 'other-cafe' }; writes.length = 0;
  await assert.rejects(firestore.saveSettings('cafe', settings), /başka bir işletme/);
  test('Başkasının adresi ayarları değiştirmeden reddedilir', () => assert.equal(writes.length, 0));
  await assert.rejects(firestore.saveImportedMenu('cafe', [], Array.from({ length: 451 }, (_, i) => ({ ...item, id: String(i) }))), /450/);
  test('Büyük içe aktarma kısmi kayıt bırakmaz', () => assert.equal(writes.length, 0));
  await assert.rejects(firestore.saveItem('cafe', { ...item, priceNeedsReview: true }), /fiyatı kontrol/);
  test('Veri katmanı fiyat doğrulamasını zorunlu kılar', () => assert.equal(writes.length, 0));
  console.log(`\n${passed} tests passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
