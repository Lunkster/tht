// Statistikflikar i All-time, årssidans statistik, bansidans hålstatistik, HCP-läget och tabellbredder.
import { chromium } from 'playwright';
const P = [[1, 'Jörgen'], [2, 'Marcus'], [3, 'Robert'], [9, 'Henrik'], [11, 'David'], [6, 'Gustav'], [7, 'Joacim'], [8, 'Martin']];
const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const halv = P.flatMap(([id, f]) => [28, 29].map((t) => ({ tht_nr: t, person_id: id, fornamn: f, alla: R(5, 25), ensamma: R(0, 8) })));
const ford = P.flatMap(([id, f]) => [28, 29].map((t) => ({ tht_nr: t, person_id: id, fornamn: f, rundor: 3, hal: 54, eagle: R(0, 1), birdie: R(0, 5), par: R(5, 20), bogey: R(10, 25), dubbel: R(3, 12), trippel: R(0, 6), quad: R(0, 3), quint: R(0, 4) })));
const par = P.flatMap(([id, f]) => [28, 29].flatMap((t) => [3, 4, 5].map((pp) => ({ tht_nr: t, person_id: id, fornamn: f, par: pp, hal: 18, poang: R(20, 45), slag: 18 * pp + R(10, 30) }))));
let rid = 1;
const rundor = P.flatMap(([id, f]) => [2024, 2025, 2026].flatMap((ar) => [1, 2, 3].map((o) => ({ runda_id: rid++, deltavling_id: o, tht_nr: ar - 1997, person_id: id, fornamn: f, artal: ar, ordning: o, deltavling: 'D' + o, poang: R(20, 40), slag: R(80, 110), antal_hal: 18, puttar: R(28, 40), hal_med_puttar: 18, placering: R(1, 8), spel_hcp: R(8, 20) }))));
const extra = rundor.map((r) => ({ runda_id: r.runda_id, birdies: R(0, 3), basta_svit: R(0, 7) }));
const res = P.flatMap(([id, f], i) => [2024, 2025, 2026].map((ar) => ({ tht_nr: ar - 1997, artal: ar, person_id: id, fornamn: f, placering: ((i + ar) % 8) + 1, poang: 120 - (((i + ar) % 8) * 3), slag: 280, rundor: 3, puttar_per_hal: 1.8, snitt_spel_hcp: 14 })));
const halstat = [74, 75].flatMap((b) => Array.from({ length: 18 }, (_, i) => ({ bana_id: b, bana: b === 74 ? 'Lindesbergs GK' : 'Kårsta GK', hal_nr: i + 1, par: [4, 3, 5][i % 3], spelade: R(6, 30), over_par: (Math.random() * 3).toFixed(2), poang: (Math.random() * 2.5).toFixed(2) })));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const fel = []; p.on('pageerror', (e) => { fel.push(e.message); console.log('ERR', e.message); });
await p.route('**/*', (r) => {
  const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
  const J = (x) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
  const t = u.pathname.replace('/rest/v1/', ''); const q = decodeURIComponent(u.search);
  const off = Number(u.searchParams.get('offset') ?? 0); if (off > 0) return J([]);
  const tf = (xs) => { const m = q.match(/tht_nr=eq\.(\d+)/); return m ? xs.filter((x) => x.tht_nr === Number(m[1])) : xs; };
  if (t === 'v_stat_halvinst') return J(tf(halv));
  if (t === 'v_stat_fordelning') return J(tf(ford));
  if (t === 'v_stat_par') return J(tf(par));
  if (t === 'v_stat_runda') return J(extra);
  if (t === 'v_stat_hal') { const m = q.match(/bana_id=eq\.(\d+)/); return J(m ? halstat.filter((h) => h.bana_id === Number(m[1])) : halstat); }
  if (t === 'v_runda') { const m = q.match(/person_id=eq\.(\d+)/); return J(m ? rundor.filter((x) => x.person_id === Number(m[1])) : tf(rundor)); }
  if (t === 'v_tht_resultat') { const m = q.match(/person_id=eq\.(\d+)/); let xs = m ? res.filter((x) => x.person_id === Number(m[1])) : tf(res); if (q.includes('placering=lte.2')) xs = xs.filter((x) => x.placering <= 2); return J(xs); }
  if (t === 'v_score') return J([{ person_id: 3, artal: 2025, ordning: 2, deltavling_id: 2, hal_nr: 7, par: 5, slag: 3, poang: 5 }]);
  if (t === 'tht') return J([2024, 2025, 2026].map((ar) => ({ nr: ar - 1997, artal: ar, ort: 'Ort' + ar, klar: true })));
  if (t === 'deltavling') return J(q.includes('tht_nr=eq') ? [1, 2, 3].map((o) => ({ id: o, ordning: o, namn: 'D' + o, datum: '2025-09-0' + o, banversion: { bana: { id: 74, namn: 'Lindesbergs GK' } } })) : [1, 2, 3].map((o) => ({ id: o, banversion: { bana: { namn: 'Lindesbergs GK' } } })));
  if (t === 'person') return J(q.includes('id=eq.3') ? [{ id: 3, fornamn: 'Robert', efternamn: 'L', aktiv: true }] : P.map(([id, f]) => ({ id, fornamn: f })));
  if (t === 'bana') return J([{ id: 74, namn: 'Lindesbergs GK', lat: null, lon: null, restaurang: true, rattigheter: true }]);
  if (t === 'banversion') return J([{ id: 74, giltig_fran: '2025-01-01', kommentar: null, deltavling: [{ id: 1, tht_nr: 28, ordning: 1, namn: 'D1', datum: '2025-09-05' }] }]);
  if (t === 'hal') return J(Array.from({ length: 18 }, (_, i) => ({ nr: i + 1, par: [4, 3, 5][i % 3], hcp_index: i + 1, hal_langd: [] })));
  return J([]);
});
const vid = async (hash, ms = 900) => { await p.goto('http://localhost:8765/' + hash); await p.waitForTimeout(ms); };
await vid('#/alltime');
const m = await p.evaluate(() => { const n = document.querySelector('.underflikar').getBoundingClientRect(); const t = document.querySelector('table.radbryt'); return { flikrad: Math.round(n.height), tabell: t.scrollWidth, wrap: t.parentElement.clientWidth, sida: document.documentElement.scrollWidth }; });
console.log('SPELARE', JSON.stringify(m), '| th:', (await p.locator('table.radbryt th').allTextContents()).map((x) => x.replace(/​/g, '')).join('/'));
await p.screenshot({ path: 'stat-spelare.png' });
for (const f of ['vinnare', 'banor', 'halvinster', 'fordelning', 'par', 'rekord', 'hal']) {
  await vid('#/alltime/' + f);
  const info = await p.evaluate(() => ({ h: [...document.querySelectorAll('#app h2, #app h3')].map((x) => x.textContent).slice(0, 9).join(','), rader: document.querySelectorAll('#app tbody tr, #app li').length, sida: document.documentElement.scrollWidth, tabeller: [...document.querySelectorAll('.tablewrap')].map((w) => w.scrollWidth - w.clientWidth).join(',') }));
  console.log(f.toUpperCase(), JSON.stringify(info));
  await p.screenshot({ path: `stat-${f}.png`, fullPage: true });
}
await p.click('[data-lage="fordelning:antal"]').catch(() => {});
await vid('#/alltime/fordelning'); await p.click('[data-lage="fordelning:antal"]'); await p.waitForTimeout(200); console.log('FÖRDELNING antal:', await p.textContent('.stat-seg button.on'), (await p.locator('tbody tr').first().textContent()).slice(0, 60));
await vid('#/ar/2025', 1500);
console.log('ÅR statistik:', (await p.locator('#arsstat summary').allTextContents()).join(' | '));
await vid('#/bana/74', 1200);
await p.click('.bana-hal summary'); await p.waitForTimeout(200);
console.log('BANA th:', (await p.locator('.bana-hal th').allTextContents()).join('/'), '|', (await p.locator('.bana-hal tbody tr').first().textContent()), '|', await p.locator('.bana-hal td.win').count(), (await p.locator('.bana-hal .hint').textContent()).slice(0, 80));
await vid('#/spelare/3', 1200);
await p.click('.sp-seg button[data-lage="hcp"]'); await p.waitForTimeout(300);
console.log('HCP-läge:', await p.textContent('.sp-seg button.on'), '| punkter', await p.locator('#sp-linje circle').count());
console.log('FEL:', fel.length);
await b.close();
