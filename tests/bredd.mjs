import { chromium } from 'playwright';
const ADMIN = 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6ImFkbWluIn19.y';
const b = await chromium.launch();
const banor = [[33, 'Karlskoga GK'], [34, 'Degerfors Golf'], [77, 'Örebro City Golf & Country Club'], [80, 'Lannalodge Golf Resort'], [81, 'Kårsta GK']];
for (const w of [360, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 844 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.addInitScript((tok) => localStorage.setItem('tht-session', JSON.stringify({ access_token: tok, refresh_token: 'r', expires_at: Date.now() / 1000 + 3600 })), ADMIN);
  await p.route('**/*', (r) => { const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
    const J = (x) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) }); const t = u.pathname.replace('/rest/v1/', '');
    if (t === 'tht') return J([{ nr: 29, artal: 2026, ort: 'Degerfors', klar: true, deltavling: [{ id: 1 }] }]);
    if (t === 'deltavling') return J(banor.map(([id, namn], i) => ({ ordning: i + 1, banversion: { bana: { id, namn } } })));
    if (t === 'v_runda') return J([1, 2, 3, 5, 9, 11].flatMap((pid) => [1, 2, 3, 4, 5].map((o) => ({ person_id: pid, ordning: o }))));
    if (t === 'person') return J([[1, 'Jörgen'], [2, 'Marcus'], [3, 'Robert'], [5, 'Johan'], [9, 'Henrik'], [11, 'David']].map(([id, f]) => ({ id, fornamn: f, efternamn: 'X' })));
    return J([]); });
  await p.goto('http://localhost:8765/#/admin/banbetyg'); await p.waitForTimeout(800);
  const m = await p.evaluate(() => { const tw = document.querySelector('.betygtabell'); return { wrap: tw.clientWidth, tabell: tw.scrollWidth, sida: document.documentElement.scrollWidth }; });
  console.log(w, JSON.stringify(m));
  if (w === 360) await p.screenshot({ path: 'bredd-360.png' });
  await p.close();
}
await b.close();
