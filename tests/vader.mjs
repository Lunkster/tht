// Väder (v0.38.0): kort på deltävlingssidan, timme för timme, ikon + temperatur på årssidan, hämtning via edge-funktionen
// när vädret saknas, och alla ikoner i ett galleri (vader-ikoner.png).
import { chromium } from 'playwright';
const timmar = [9, 10, 11, 12, 13, 14, 15].map((h, i) => ({ h, temp: 14 + i * 0.6, kod: [1, 2, 2, 3, 61, 61, 3][i], moln: 40 + i * 8, vind: 4.2, byar: 9.1, riktning: 225, nederbord: [0, 0, 0, 0, 1.2, 0.8, 0][i] }));
const rad = (id, kod, temp) => ({ deltavling_id: id, datum: '2012-09-09', lat: 59.4, lon: 18.1, kalla: 'arkiv', hamtad: '2026-11-10T00:00:00Z', temp, temp_min: 13.6, temp_max: 18.2, moln: 64, vind: 4.2, byar: 9.1, vindriktning: 225, nederbord: 2.0, kod, timmar });
const b = await chromium.launch();
let anrop = [];
for (const [w, v] of [[390, 'mobil'], [1100, 'dator']]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, locale: 'en-US' });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.route('**/*', async (r) => {
    const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
    const J = (x) => r.fulfill({ status: 200, body: JSON.stringify(x), contentType: 'application/json' });
    if (u.pathname === '/functions/v1/vader') { const ids = JSON.parse(r.request().postData()).deltavling_ids; anrop.push(ids); return J({ rader: ids.map((id) => rad(id, 3, 12.4)), fel: [] }); }
    const t = u.pathname.replace('/rest/v1/', ''), q = decodeURIComponent(u.search);
    if (t === 'deltavling' && q.includes('id=eq.56')) return J([{ id: 56, tht_nr: 15, ordning: 3, namn: 'Plastic or glass', datum: '2012-09-09', narmast_hal: 8, longest_hal: 16, vinnare_utan_kort: null, banversion_id: 42, tee: { namn: 'gul' }, banversion: { bana: { id: 39, namn: 'Arninge GK' } }, tht: { nr: 15, artal: 2012, ort: 'Arninge', klar: true } }]);
    if (t === 'deltavling' && q.includes('tht_nr=eq.15&order=ordning')) return J([54, 55, 56].map((id, i) => ({ id, ordning: i + 1, namn: 'R' + (i + 1), datum: `2012-09-0${7 + i}`, banversion: { bana: { id: 39, namn: 'Arninge GK' } } })));
    if (t === 'tht') return J([{ nr: 15, artal: 2012, ort: 'Arninge', klar: true }]);
    if (t === 'v_tht_resultat') return J([{ tht_nr: 15, artal: 2012, person_id: 1, fornamn: 'Martin', placering: 1, poang: 100, rundor: 3 }]);
    if (t === 'vader') return J(q.includes('56') && !q.includes('54') ? [rad(56, 61, 15.8)] : [rad(54, 0, 21.3), rad(56, 61, 15.8)]);   // 55 saknas → hämtas
    return J([]);
  });
  await p.goto('http://localhost:8765/#/deltavling/56'); await p.waitForTimeout(1200);
  console.log(v, 'väderkort:', (await p.locator('.vd-kort').textContent().catch(() => 'SAKNAS')).replace(/\s+/g, ' ').trim().slice(0, 160));
  console.log(v, 'timmar:', await p.locator('.vd-timme').count(), '| ikoner:', await p.locator('.vd-kort svg.vi').count(), '| sidbredd:', await p.evaluate(() => document.documentElement.scrollWidth));
  await p.locator('#dt-vader').screenshot({ path: `vader-kort-${v}.png` });
  anrop = [];
  await p.goto('http://localhost:8765/#/ar/2012'); await p.waitForTimeout(1500);
  console.log(v, 'årssidan mini:', (await p.locator('.vd-mini').allTextContents()).join(' | '), '| hämtade saknade:', JSON.stringify(anrop));
  await p.close();
}
// Galleri med alla ikoner
const p = await b.newPage({ viewport: { width: 900, height: 260 }, deviceScaleFactor: 2 });
await p.goto('http://localhost:8765/'); await p.waitForTimeout(500);
await p.evaluate(async () => {
  const { vaderIkon, vaderTyp } = await import('/vader.js?v=0.39.1');
  document.body.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:18px;padding:20px;background:#121110">${[0, 2, 3, 45, 53, 61, 80, 73, 95].map((k) => `<div style="text-align:center;color:#eee;font:14px sans-serif">${vaderIkon(k, 'vi-stor')}<br>${vaderTyp(k)[1]}</div>`).join('')}</div>`;
});
await p.screenshot({ path: 'vader-ikoner.png' });
await b.close();
