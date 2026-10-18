// Deltävlingssida: topplista, priser, bollar, hål för hål med hålvinnare, hålvinster, minnen; länkar dit från år/runda
import { chromium } from 'playwright';
const namn = ['Martin', 'David', 'Robert', 'Gustav', 'Marcus', 'Henrik', 'Pär', 'Joacim'];
const par = [5, 5, 3, 4, 4, 4, 4, 3, 4, 5, 3, 4, 3, 4, 5, 4, 3, 5];
const rundor = namn.map((n, i) => ({ runda_id: 320 + i, person_id: i + 1, fornamn: n, spel_hcp: 8 + i * 2, boll_nr: (i % 3) + 1, antal_hal: i === 7 ? 9 : 18, slag: 85 + i * 3, poang: 41 - i * 2, puttar: 30, hal_med_puttar: 18, placering: i + 1 }));
const score = rundor.flatMap((r, i) => par.slice(0, r.antal_hal).map((p, h) => { const s = p + ((h + i) % 4) - 1; return { runda_id: r.runda_id, person_id: r.person_id, hal_nr: h + 1, par: p, slag: s, slag_tak: Math.min(s, p + 5), poang: Math.max(0, p + 3 - s) }; }));
const b = await chromium.launch();
for (const [w, v] of [[390, 'mobil'], [1100, 'dator']]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.route('**/*', async (r) => {
    const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
    const t = u.pathname.replace('/rest/v1/', ''), q = decodeURIComponent(u.search);
    const J = (x) => r.fulfill({ status: 200, body: JSON.stringify(x), contentType: 'application/json' });
    if (t === 'deltavling' && q.includes('id=eq.56')) return J([{ id: 56, tht_nr: 15, ordning: 3, namn: 'Plastic or glass smashing invitation', datum: '2012-09-09', narmast_hal: 8, longest_hal: 16, vinnare_utan_kort: null, banversion_id: 42, tee: { namn: 'gul' }, banversion: { bana: { id: 39, namn: 'Arninge GK' } }, tht: { nr: 15, artal: 2012, ort: 'Arninge', klar: true } }]);
    if (t === 'deltavling' && q.includes('tht_nr=eq.15&select=id,ordning,namn')) return J([{ id: 54, ordning: 1, namn: 'A' }, { id: 55, ordning: 2, namn: 'B' }, { id: 56, ordning: 3, namn: 'C' }]);
    if (t === 'v_runda') return J(rundor);
    if (t === 'v_score') return J(score);
    if (t === 'hal') return J(par.map((x, i) => ({ nr: i + 1, par: x, hcp_index: i + 1 })));
    if (t === 'pris') return J([{ typ: 'narmast', person: { id: 5, fornamn: 'Johan' } }, { typ: 'longest', person: { id: 3, fornamn: 'Robert' } }]);
    if (t === 'kommentar') return J([{ id: 1, deltavling_id: 56, runda_id: 322, text: '2a bunkerslaget i koppen', skapad: '2012-09-09T18:00:00+00', fran_lank: false }]);
    if (t === 'runda') return J(rundor.map((r) => ({ id: r.runda_id, deltavling_id: 56, person_id: r.person_id, boll_nr: r.boll_nr, person: { fornamn: r.fornamn } })));
    return J([]);
  });
  await p.goto('http://localhost:8765/#/deltavling/56'); await p.waitForTimeout(900);
  console.log(v, 'h1:', await p.textContent('h1'), '| sub:', (await p.textContent('.sub')).trim());
  console.log(v, 'rutor:', (await p.locator('.sp-tile').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim()).join(' | '));
  console.log(v, 'topplista:', await p.locator('.stat-tabell').first().locator('tbody tr').count(), '| bollar:', await p.locator('.dt-boll').count(), '| hål-kolumner:', await p.locator('.dt-hal thead tr').first().locator('th').count(), '| hålvinnarrutor:', await p.locator('.dt-hal td.hv').count());
  console.log(v, 'hålvinster:', (await p.locator('h2:has-text("Hålvinster") + .tablewrap tbody tr').allTextContents()).slice(0, 3).map((x) => x.replace(/\s+/g, ' ')).join(' | '));
  console.log(v, 'minnen:', (await p.locator('.mm-lista li').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim()).join(' | '), '| nav:', (await p.locator('.dt-nav a').allTextContents()).join(','), '| sidbredd:', await p.evaluate(() => document.documentElement.scrollWidth));
  await p.screenshot({ path: `deltavling-${v}.png`, fullPage: true });
  await p.close();
}
await b.close();
