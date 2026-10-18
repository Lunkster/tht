// Inbördes möten: rutan på spelarsidan, matrisen i All-time och duellsidan (data: utdrag ur riktiga vyerna)
import { chromium } from 'playwright';
import fs from 'fs';
const fx = JSON.parse(fs.readFileSync(new URL('./ib-fixture.json', import.meta.url)));
const b = await chromium.launch();
for (const [w, v] of [[390, 'mobil'], [1100, 'dator']]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.route('**/*', (r) => {
    const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
    const t = u.pathname.replace('/rest/v1/', ''), q = decodeURIComponent(u.search);
    const J = (x) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(x) });
    const pid = Number(q.match(/[?&]person_id=eq\.(\d+)/)?.[1] ?? 0);
    if (t === 'person') return J(q.includes('id=eq.') ? [{ id: pid || 3, fornamn: 'Robert', efternamn: 'R', aktiv: true }] : fx.person);
    if (t === 'v_inbordes_summa') return J(pid ? fx.summa.filter((x) => x.person_id === pid) : fx.summa);
    if (t === 'v_inbordes') return J(fx.moten);
    if (t === 'v_tht_resultat') return J(q.includes('in.(') ? fx.res : []);
    if (t === 'tht') return J(fx.tht);
    return J([]);
  });
  await p.goto('http://localhost:8765/#/spelare/3'); await p.waitForTimeout(900);
  console.log(v, 'spelare: rader', await p.locator('.ib-tabell tbody tr').count(), '|', (await p.locator('.ib-summa').textContent()).replace(/\s+/g, ' '));
  await p.locator('#sp-inbordes').screenshot({ path: `inbordes-spelare-${v}.png` });
  await p.goto('http://localhost:8765/#/alltime/inbordes'); await p.waitForTimeout(700);
  console.log(v, 'matris: rader', await p.locator('.ib-matris tbody tr').count(), 'kol', await p.locator('.ib-matris thead th').count(), '| bredd', await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth].join('/')));
  await p.screenshot({ path: `inbordes-matris-${v}.png`, fullPage: true });
  await p.click('#ib-alla'); await p.waitForTimeout(200);
  console.log(v, 'alla spelare: rader', await p.locator('.ib-matris tbody tr').count());
  await p.goto('http://localhost:8765/#/duell/3/2'); await p.waitForTimeout(900);
  console.log(v, 'duell:', (await p.locator('.duell-score').textContent()).replace(/\s+/g, ' ').trim(), '| möten', await p.locator('.du-tabell tbody tr').count(), '| prickar', await p.locator('.du-prick').count(), '| graf', await p.locator('#du-graf svg path').count());
  console.log(v, 'rutor:', (await p.locator('.sp-tile').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim()).join(' | '));
  await p.screenshot({ path: `inbordes-duell-${v}.png`, fullPage: true });
  await p.click('.ib-seg [data-satt="slag"]'); await p.waitForTimeout(400);
  console.log(v, 'duell på slag:', (await p.locator('.duell-score').textContent()).replace(/\s+/g, ' ').trim());
  await p.click('#du-byt'); await p.waitForTimeout(500);
  console.log(v, 'bytt:', await p.evaluate(() => location.hash));
  await p.close();
}
await b.close();
