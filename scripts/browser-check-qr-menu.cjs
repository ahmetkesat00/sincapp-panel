const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const basePort = 4000 + Math.floor(Math.random() * 8000);
const panelUrl = 'http://localhost:' + basePort;
const menuUrl = 'http://localhost:' + (basePort + 1);
const chromeUrl = 'http://localhost:' + (basePort + 2);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'loopygo-qr-review-'));
const panelSource = process.cwd();
const menuSource = path.resolve(panelSource, '..', 'loopygo-menu');
const processes = [];
const logs = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function copyProject(source, name) {
  const target = path.join(temporary, name);
  fs.mkdirSync(target);
  for (const entry of ['app', 'components', 'lib', 'public', 'package.json', 'tsconfig.json', 'postcss.config.mjs', 'next-env.d.ts']) {
    if (fs.existsSync(path.join(source, entry))) fs.cpSync(path.join(source, entry), path.join(target, entry), { recursive: true });
  }
  fs.symlinkSync(path.join(source, 'node_modules'), path.join(target, 'node_modules'), 'junction');
  const catalog = path.join(source, 'firebase/menu-functions/ingredients.json');
  if (fs.existsSync(catalog)) { fs.mkdirSync(path.join(target, 'firebase/menu-functions'), { recursive: true }); fs.copyFileSync(catalog, path.join(target, 'firebase/menu-functions/ingredients.json')); }
  // Geçici test kopyası font indirmesine ihtiyaç duymaz.
  fs.writeFileSync(path.join(target, 'app/layout.tsx'), 'import "./globals.css"; export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="tr"><body>{children}</body></html>; }');
  return target;
}
const panel = copyProject(panelSource, 'panel');
const menu = copyProject(menuSource, 'menu');
fs.mkdirSync(path.join(panel, 'app/review'), { recursive: true });
fs.writeFileSync(path.join(panel, 'app/review/page.tsx'), 'import QrMenuEditor from "@/components/qr-menu/qr-menu-editor"; export default function Review() { return <main className="mx-auto max-w-6xl p-4"><QrMenuEditor cafeId="review-cafe" cafeName="Test Kafe" /></main>; }');
fs.writeFileSync(path.join(panel, 'lib/qr-menu/firestore.ts'), `
import { DEFAULT_SETTINGS } from "./types";
let nextId = 10;
const settings = { ...DEFAULT_SETTINGS, slug: "test-kafe", enabled: false };
const categories = [{ id: "c1", name: { tr: "İçecekler" }, sortOrder: 0 }, { id: "c2", name: { tr: "Tatlılar" }, sortOrder: 1 }];
let items = [
  { id: "i1", categoryId: "c1", name: { tr: "Çay" }, price: 40, ingredients: [{ name: { tr: "Su" } }], calories: 0, calorieInfo: { source: "estimate", updatedAt: "2026-10-08" }, isAvailable: true, isVisible: true, sortOrder: 0 },
  { id: "i2", categoryId: "c1", name: { tr: "Latte" }, price: 120, ingredients: [{ name: { tr: "Espresso" } }], isAvailable: true, isVisible: true, sortOrder: 1 },
  { id: "i3", categoryId: "c2", name: { tr: "Brownie" }, price: 150, ingredients: [], isAvailable: false, isVisible: false, sortOrder: 0 },
];
const check = () => { if ((window as unknown as { __failWrites: boolean }).__failWrites) throw new Error("Test kayıt hatası"); };
export async function loadQrMenu() { return { settings, hasSettings: false, categories, items, previewCafe: { id: "review-cafe", name: "Test Kafe", qrMenu: settings, loyaltyCards: [{ id: "l1", itemTypeId: "kahve", rewardBuy: 20, rewardGift: 2 }] } }; }
export async function saveSettings(...args: unknown[]) { check(); }
export async function saveCategory(...args: unknown[]) { check(); }
export async function deleteCategory(...args: unknown[]) { check(); }
export async function saveOrder(...args: unknown[]) { check(); }
export async function saveItem(_id: string, item: typeof items[0]) { check(); items = [...items.filter(i => i.id !== item.id), item]; }
export async function patchItem(...args: unknown[]) { check(); }
export async function patchItems(...args: unknown[]) { check(); }
export async function deleteItem(...args: unknown[]) { check(); }
export async function saveQrStyle(...args: unknown[]) { check(); }
export async function saveBrandingSettings(...args: unknown[]) { check(); }
export async function saveLogoCheck(...args: unknown[]) { check(); }
export async function setMenuEnabled(...args: unknown[]) { check(); }
export async function saveImportedMenu(...args: unknown[]) { check(); }
export async function saveItems(...args: unknown[]) { check(); }
export async function touchPricesUpdatedAt(...args: unknown[]) { return "2026-10-08"; }
export const today = () => "2026-10-08";
export const newCategoryId = (...args: unknown[]) => "c" + ++nextId;
export const newItemId = (...args: unknown[]) => "i" + ++nextId;
export const isValidSlug = (s: string) => s.length >= 3;
export const slugify = (s: string) => "test-kafe";
export async function uploadItemImage(...args: unknown[]) { return ""; }
export async function uploadMenuBranding(...args: unknown[]) { return ""; }
`);
function start(source, args, cwd, env = {}) {
  const child = spawn(source, args, { cwd, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => logs.push(String(chunk)));
  child.stderr.on('data', chunk => logs.push(String(chunk)));
  processes.push(child);
  return child;
}
async function waitHTTP(url, max = 60000) {
  const end = Date.now() + max;
  let failures = 0;
  while (Date.now() < end) { try { const res = await fetch(url); if (res.ok) return; if (res.status === 500 && ++failures >= 3) throw new Error('Compilation failed: ' + url); } catch (error) { if (error.message.startsWith('Compilation failed')) throw error; } await delay(500); }
  throw new Error('Server did not start: ' + url);
}
start(process.execPath, [path.join(panel, 'node_modules/next/dist/bin/next'), 'dev', '-p', String(basePort)], panel, { NEXT_PUBLIC_MENU_BASE_URL: menuUrl });
start(process.execPath, [path.join(menu, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '-p', String(basePort + 1)], menu, { MENU_DATA: 'mock' });
let socket;
async function run() {
  await Promise.all([waitHTTP(panelUrl + '/review'), waitHTTP(menuUrl + '/preview')]);
  console.log('Temporary panel and menu servers ready.');
  const chrome = 'C:/Users/KESAT/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe';
  start(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=' + (basePort + 2), '--user-data-dir=' + path.join(temporary, 'browser'), 'about:blank'], temporary);
  await waitHTTP(chromeUrl + '/json/version', 20000);
  const targets = await (await fetch(chromeUrl + '/json')).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let requestId = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { const callback = pending.get(message.id); pending.delete(message.id); message.error ? callback.reject(message.error) : callback.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description ?? ''));
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++requestId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async expression => { const end = Date.now() + 20000; while (Date.now() < end) { if (await evaluate('Boolean(' + expression + ')')) return; await delay(250); } throw new Error('Condition failed: ' + expression); };
  const click = text => evaluate(`(() => { const buttons = [...document.querySelectorAll('button')].filter(b => b.getClientRects().length); const button = buttons.find(b => b.textContent.trim() === ${JSON.stringify(text)}) ?? buttons.find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})); if (!button) throw new Error('Button missing: ' + ${JSON.stringify(text)}); button.click(); })()`);
  const input = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); const proto = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
  const screenshot = async name => { const result = await send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(path.join(panelSource, 'artifacts'), { recursive: true }); fs.writeFileSync(path.join(panelSource, 'artifacts', name + '.png'), Buffer.from(result.data, 'base64')); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: panelUrl + '/review' });
  await wait("document.body?.innerText.includes('Menünü oluştur')");
  await input('[aria-label="Ürün ara"]', 'cay');
  await wait("document.querySelectorAll('li').length === 1 && document.querySelector('li').innerText.includes('Çay')");
  console.log('✓ Panel product search matches Turkish characters.');
  await click('₺ Fiyat'); await input('input[aria-label="Çay fiyatı"]', '49.5'); await click('Kaydet');
  await wait("document.querySelector('li').innerText.includes('₺49.5')");
  console.log('✓ Inline price saves and updates the row.');
  await evaluate('window.__failWrites = true'); await click('Satışta');
  await wait("document.body.innerText.includes('Ürün güncellenemedi.')");
  assert.equal(await evaluate("document.querySelector('li').innerText.includes('Satışta')"), true);
  console.log('✓ Failed availability write leaves the saved status visible.');
  await evaluate('window.__failWrites = false');
  await input('[aria-label="Ürün ara"]', '');
  await input('[aria-label="Ürün durumu filtresi"]', 'hidden');
  await wait("document.querySelectorAll('li').length === 1 && document.querySelector('li').innerText.includes('Brownie')");
  console.log('✓ Hidden-product filter works.');
  await click('Filtreleri temizle');
  await screenshot('qr-menu-panel-desktop');
  await click('Menünü oluştur'); await click('Devam');
  await wait("document.querySelector('iframe') && document.body.innerText.includes('Kendi menünüz')");
  // iframe hazır olduğunda yayın düğmesi ilerleyen adımda etkinleşir.
  await delay(2000); await click('Devam'); await click('Devam');
  await wait("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Kaydet ve yayına al' && !b.disabled)");
  console.log('✓ First setup uses the real menu bridge and waits for its render.');
  await screenshot('qr-menu-wizard-preview');
  await click('Sadece kaydet'); await click('Tamam');
  await click('Tasarım'); await click('Tasarım editörünü aç');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await wait("document.querySelector('[aria-label=\"Tasarım editörü\"]')");
  await click('Önizle'); await delay(1500);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  console.log('✓ Mobile design preview fits a 375px viewport.');
  await screenshot('qr-menu-studio-mobile');
  await evaluate("document.querySelector('[aria-label=\"Tasarım editörü\"] button[aria-label=\"Kapat\"]').click()");
  await click('Ürünler');
  await input('[aria-label="Ürün ara"]', 'cay');
  await evaluate("document.querySelector('li button[aria-label=\"Düzenle\"]').click()");
  await wait("document.querySelector('[aria-label=\"Ürünü düzenle\"]')");
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Ürünü düzenle\"] details').open"), false);
  console.log('✓ Product form keeps advanced fields collapsed.');
  await screenshot('qr-menu-product-mobile');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('Browser checks passed without unhandled browser errors.');
}
run().catch(error => { console.error(error); console.error(logs.join('').slice(0, 13000)); process.exitCode = 1; }).finally(() => {
  socket?.close();
  for (const child of processes.reverse()) { if (child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); }
  fs.mkdirSync(path.join(panelSource, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(panelSource, 'artifacts', 'qr-menu-browser-log.txt'), logs.join(''));
  console.log('Temporary review directory: ' + temporary);
});
