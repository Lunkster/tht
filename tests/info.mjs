import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [390, 360, 1280]) {
  const p = await b.newPage({ viewport: { width: w, height: 844 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.route('**/*', (r) => { const u = new URL(r.request().url()); if (u.hostname.includes('supabase')) return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); return r.continue(); });
  await p.goto('http://localhost:8765/#/nyheter'); await p.waitForTimeout(700);
  const m = await p.evaluate(() => { const t = document.querySelector('.topbar'); const n = document.querySelector('.tabs'); const r = [...n.children].map((a) => a.getBoundingClientRect()); return { scroll: document.documentElement.scrollWidth, topH: t.offsetHeight, last: Math.round(r.at(-1).right), tops: [...new Set(r.map((x) => Math.round(x.top)))] }; });
  console.log(w, JSON.stringify(m), '| aktiv:', await p.getAttribute('.tabs a.active', 'aria-label'));
  if (w === 390) { console.log('dagar:', (await p.locator('.ny-dag h2').allTextContents()).join(','), '| punkter:', await p.locator('.ny-lista li').count(), '| första:', (await p.locator('.ny-lista li').first().innerHTML()).slice(0, 80), '| ver:', await p.locator('.ny-ver').count()); await p.screenshot({ path: 'info-390.png' }); }
  await p.close();
}
await b.close();
