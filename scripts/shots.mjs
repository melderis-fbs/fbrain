import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:3200';
const USER = process.env.USER_ID || 'u-vicky';
const OUT = 'shots';
fs.mkdirSync(OUT, { recursive: true });

const pages = process.env.ONLY
  ? JSON.parse(process.env.ONLY)
  : [
      ['login', '/login'],
      ['cartera', '/cartera'],
      ['atencion', '/atencion'],
      ['clientes', '/mis-clientes'],
      ['alertas', '/alertas'],
      ['consultoras', '/consultoras'],
      ['modelo', '/modelo'],
    ];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: 'brain_usuario', value: USER, domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

for (const [name, path] of pages) {
  const res = await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(name, res?.status());
}
await browser.close();
if (errors.length) { console.log('\n--- errores ---'); console.log([...new Set(errors)].join('\n')); }
