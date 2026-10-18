import { chromium } from 'playwright';
import fs from 'fs';
const fx = JSON.parse(fs.readFileSync(new URL('./fixture.json', import.meta.url)));
const ar = [2018, 2019, 2021, 2022, 2023, 2024, 2025, 2026];
const tht = ar.map((a, i) => ({ nr: 21 + i, artal: a, ort: ['Sandviken', 'Mallorca', 'Kristinehamn', 'Nyköping', 'Sälen', 'Praia', 'Lindesberg', 'Degerfors'][i], klar: a < 2026 }));
const res = tht.map((t, i) => ({ tht_nr: t.nr, artal: t.artal, placering: [3, 1, 5, 2, 1, 4, 8, 2][i], poang: 90 + i * 3, slag: 270 - i, puttar_per_hal: 1.9, rundor: 3 }));
const rundor = tht.flatMap((t, i) => [1, 2, 3].map((o) => ({ tht_nr: t.nr, artal: t.artal, ordning: o, deltavling: 'R' + o, poang: 28 + ((i + o) % 9), slag: 92 - o, antal_hal: t.artal === 2026 && o === 3 ? 9 : 18, puttar: 33, hal_med_puttar: 18, placering: (i + o) % 4 === 0 ? 1 : 3, spel_hcp: 12 + (i % 3) })));
const res2 = ['par', 'bogey', 'bogey', 'dubbelbogey', 'birdie', 'par', 'trippelbogey', 'kvadrupel+', 'bogey'];
const score = Array.from({ length: 1250 }, (_, i) => ({ resultat: res2[i % 9], par: [3, 4, 4, 5][i % 4], slag_tak: 5, poang: 2 })).concat([{ resultat: 'eagle', par: 5, slag_tak: 3, poang: 4 }]);
const b = await chromium.launch();
for (const [w, v] of [[390, 'mobil'], [1100, 'dator']]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.route('**/*', (r) => {
    const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
    const t = u.pathname.replace('/rest/v1/', ''), q = decodeURIComponent(u.search);
    const J = (x) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(x) });
    if (t === 'person') return J(q.includes('id=eq.') ? [{ id: 9, fornamn: 'Henrik', efternamn: 'Lundqvist', hcp: 13.4, aktiv: true }] : [{ id: 1, fornamn: 'Jörgen' }, { id: 9, fornamn: 'Henrik' }]);
    if (t === 'tht') return J(tht);
    if (t === 'v_tht_resultat') return J(q.includes('person_id=eq.') ? res : fx.res.map((x) => ({ ...x })));
    if (t === 'v_runda') return J(q.includes('person_id=eq.') ? rundor : fx.rundor.map((x) => ({ ...x, fornamn: 'X', artal: 2025, placering: 2 })));
    if (t === 'pris') return J([{ typ: 'narmast' }, { typ: 'narmast' }, { typ: 'longest' }]);
    if (t === 'v_score') { const off = Number(q.match(/offset=(\d+)/)?.[1] ?? 0); return J(score.slice(off, off + 1000)); }
    if (t === 'v_tht_kurva') return J(fx.kurva);
    if (t === 'deltavling') return J(fx.delt);
    return J([]);
  });
  await p.goto('http://localhost:8765/#/spelare/9'); await p.waitForTimeout(1000);
  console.log(v, 'h1:', await p.locator('h1').textContent(), '| tiles:', (await p.locator('.sp-tile').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim()).slice(0, 4).join(' | '));
  console.log(v, 'rader år:', await p.locator('tbody tr').count(), '| staplar:', await p.locator('.sp-rad').count(), '| hål totalt hint:', await p.locator('#sp-staplar + .hint').textContent());
  const bx = await p.locator('#sp-linje').boundingBox(); await p.mouse.move(bx.x + bx.width * 0.2, bx.y + 60); await p.waitForTimeout(150);
  console.log(v, 'tooltip:', (await p.locator('#sp-tip').textContent()).replace(/\s+/g, ' '));
  await p.screenshot({ path: `spelare-${v}.png`, fullPage: true });
  // länkar från leaderboard och all-time
  await p.goto('http://localhost:8765/#/alltime'); await p.waitForTimeout(700);
  console.log(v, 'all-time namnlänkar:', await p.locator('a.namn').count(), '| första sortering:', (await p.locator('tbody tr td:nth-child(1)').allTextContents()).slice(0, 3).join(','));
  await p.close();
}
await b.close();
