// Karusell (#/karusell): leaderboard, dagens runda, höjdpunkter, minnen och foton – bläddras med piltangenten.
import { chromium } from 'playwright';
const namn = ['Martin', 'David', 'Robert', 'Gustav', 'Marcus', 'Henrik', 'Pär', 'Joacim', 'Johan', 'Fredrik'];
const par = [5, 5, 3, 4, 4, 4, 4, 3, 4, 5, 3, 4, 3, 4, 5, 4, 3, 5];
const idag = new Date(); const iso = `${idag.getFullYear()}-${String(idag.getMonth() + 1).padStart(2, '0')}-${String(idag.getDate()).padStart(2, '0')}`;
const delt = [{ id: 102, ordning: 1, namn: 'A', datum: '2026-09-04', narmast_hal: 3, longest_hal: 10, banversion: { bana: { namn: 'Degerfors GK' } } }, { id: 103, ordning: 2, namn: 'B', datum: iso, narmast_hal: 8, longest_hal: 15, banversion: { bana: { namn: 'Karlskoga GK' } } }, { id: 104, ordning: 3, namn: 'C', datum: null, narmast_hal: null, longest_hal: null, banversion: null }];
const rundor = [];
namn.forEach((n, i) => { [102, 103].forEach((did, k) => rundor.push({ runda_id: 400 + i * 2 + k, deltavling_id: did, person_id: i + 1, fornamn: n, ordning: k + 1, poang: 40 - i - k * 2, slag: 85 + i, antal_hal: k === 1 && i > 6 ? 12 : 18, spel_hcp: 10 + i, placering: i + 1 })); });
const res = namn.map((n, i) => ({ person_id: i + 1, fornamn: n, placering: i + 1, poang: 80 - i * 3, artal: 2026 }));
const score = rundor.filter((r) => r.deltavling_id === 103).flatMap((r, i) => par.slice(0, r.antal_hal).map((p, h) => { const s = Math.max(1, p + ((h * 3 + i) % 5) - 2); return { runda_id: r.runda_id, person_id: r.person_id, hal_nr: h + 1, par: p, slag: s, slag_tak: Math.min(s, p + 5), poang: Math.max(0, p + 2 - s) }; }));
const b = await chromium.launch();
const bild = await (async () => { const p = await b.newPage(); await p.goto('http://localhost:8765/'); const x = await p.evaluate(async () => { const c = document.createElement('canvas'); c.width = 1600; c.height = 1067; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 1600, 1067); gr.addColorStop(0, '#2b5d34'); gr.addColorStop(1, '#a7c7e7'); g.fillStyle = gr; g.fillRect(0, 0, 1600, 1067); const bl = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8)); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; u.forEach((v) => { s += String.fromCharCode(v); }); return btoa(s); }); await p.close(); return Buffer.from(x, 'base64'); })();
for (const [w, h, v] of [[1920, 1080, 'tv'], [390, 800, 'mobil']]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const valt = [];
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.route('**/*', async (r) => {
    const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
    if (u.pathname.startsWith('/storage/')) return r.fulfill({ status: 200, body: bild, contentType: 'image/jpeg' });
    const t = u.pathname.replace('/rest/v1/', ''), q = decodeURIComponent(u.search);
    const J = (x) => r.fulfill({ status: 200, body: JSON.stringify(x), contentType: 'application/json' });
    if (t === 'deltavling' && q.includes('limit=1')) return J([{ tht_nr: 30 }]);
    if (t === 'tht') { valt.push(q); return J(q.includes('nr=eq.29') ? [{ nr: 29, artal: 2026, ort: 'Degerfors', klar: false }] : [{ nr: 30, artal: 2027, ort: 'Nästa', klar: false }]); }
    if (t === 'deltavling') return J(delt);
    if (t === 'v_tht_resultat') return J(res);
    if (t === 'v_runda' && q.includes('limit=1')) { valt.push(q); return J([{ tht_nr: 29 }]); }   // senaste THT med poäng (THT 30 har bara deltävlingar)
    if (t === 'v_runda') return J(rundor);
    if (t === 'v_score') return J(score);
    if (t === 'pris') return J([{ typ: 'narmast', person: { fornamn: 'Gustav' } }]);
    if (t === 'kommentar') return J(q.includes('in.(103)') ? [{ id: 1, deltavling_id: 103, runda_id: 403, text: 'Robert sänkte bunkerslaget på 17:an och firade med en piruett', skapad: iso, fran_lank: false }, { id: 2, deltavling_id: 103, runda_id: null, boll_nr: 2, text: 'Åskvarning på 14:e', skapad: iso }] : []);
    if (t === 'runda') return J(rundor.map((x) => ({ id: x.runda_id, deltavling_id: x.deltavling_id, person_id: x.person_id, boll_nr: 1, person: { fornamn: x.fornamn } })));
    if (t === 'foto') return J([{ id: 1, tht_nr: 29, deltavling_id: 103, fil: '29/a.jpg', text: 'Solnedgång på 18:e', person: { fornamn: 'Martin' } }, { id: 2, tht_nr: 29, deltavling_id: 102, fil: '29/b.jpg', text: null, person: null }]);
    return J([]);
  });
  await p.goto('http://localhost:8765/#/karusell'); await p.waitForTimeout(1200);
  const sett = [];
  for (let i = 0; i < 12; i++) {
    const typ = await p.evaluate(() => [...document.querySelector('.ka-bild').classList].find((c) => c !== 'ka-bild'));
    const rub = (await p.locator('.ka-rubrik, .ka-bildtext').first().textContent().catch(() => '')).trim();
    sett.push(`${typ}: ${rub}`);
    if (!sett.slice(0, -1).some((x) => x.startsWith(typ + ':')) || typ === 'ka-foto' && i < 4) await p.screenshot({ path: `karusell-${v}-${i}-${typ}.png` });
    const ov = await p.evaluate(() => document.documentElement.scrollHeight > innerHeight + 2 ? `överflöde ${document.documentElement.scrollHeight}` : 'ok');
    if (ov !== 'ok') console.log(v, typ, ov);
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(250);
  }
  console.log(v, 'vald THT:', (await p.textContent('.ka-titel')).trim(), '| anrop:', valt.slice(0, 2).join(' , '));
  console.log(v, 'ordning:\n  ' + sett.join('\n  '));
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(200);
  await p.keyboard.press(' '); await p.waitForTimeout(100);
  console.log(v, 'paus-knapp:', await p.textContent('#ka-paus'), '| topbar dold:', await p.evaluate(() => getComputedStyle(document.querySelector('.topbar')).display));
  await p.goto('http://localhost:8765/#/leaderboard'); await p.waitForTimeout(600);
  console.log(v, 'efter avslut: storskärm', await p.evaluate(() => document.body.classList.contains('storskarm')), '| länk i leaderboard:', await p.locator('a[href="#/karusell"]').count());
  await p.close();
}
await b.close();
