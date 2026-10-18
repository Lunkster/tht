import { chromium } from 'playwright';
let pers = [
  { id: 1, fornamn: 'Jörgen', efternamn: 'Nilsson', hcp: 14.4, aktiv: true, runda: [{ count: 91 }] },
  { id: 5, fornamn: 'Johan', efternamn: 'Watz', hcp: 10.9, aktiv: true, runda: [{ count: 50 }] },
  { id: 9, fornamn: 'Henrik', efternamn: 'Lundqvist', hcp: 13.4, aktiv: true, runda: [{ count: 68 }] },
  { id: 10, fornamn: 'Linus', efternamn: 'Edström', hcp: 0, aktiv: false, runda: [{ count: 4 }] },
  { id: 99, fornamn: 'Gäst', efternamn: '(okänd)', hcp: null, aktiv: false, runda: [{ count: 1 }] },
];
const b = await chromium.launch();
for (const [w, h, v] of [[390, 844, 'mobil'], [1100, 900, 'dator']]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  p.on('dialog', (d) => d.dismiss());
  const J = (r, body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await p.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (!u.hostname.includes('supabase')) return r.continue();
    if (u.pathname.includes('/auth/')) { const bd = JSON.parse(r.request().postData()); return bd.password === 'kod123' ? J(r, { access_token: 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6ImFkbWluIn19.y', refresh_token: 'rt', expires_at: Date.now() / 1000 + 3600 }) : J(r, { error: 'bad' }, 400); }
    const path = u.pathname.replace('/rest/v1/', ''), m = r.request().method();
    if (path === 'person') {
      if (m === 'GET') return J(r, pers);
      const body = JSON.parse(r.request().postData() || '{}');
      console.log(v, m, decodeURIComponent(u.search), JSON.stringify(body), r.request().headers()['authorization']);
      if (m === 'PATCH') { const id = Number(u.searchParams.get('id').split('.')[1]); pers = pers.map((x) => x.id === id ? { ...x, ...body } : x); }
      if (m === 'POST') pers.push({ id: 100, runda: [{ count: 0 }], ...body });
      if (m === 'POST') return J(r, [{ id: 100, ...body }], 201);
      return r.fulfill({ status: 204, body: '' });
    }
    if (path === 'person_kontakt') { if (r.request().method() !== 'GET') console.log(v, r.request().method(), decodeURIComponent(u.search), r.request().postData()); return r.request().method() === 'GET' ? J(r, []) : r.fulfill({ status: 201, body: '' }); }
    return J(r, []);
  });
  await p.goto('http://localhost:8765/#/admin'); await p.waitForTimeout(500);
  console.log(v, 'login h1:', await p.locator('h1').textContent());
  await p.fill('#kod', 'kod123'); await p.click('#login button'); await p.waitForTimeout(500);
  await p.screenshot({ path: `adm1-meny-${v}.png`, fullPage: true });
  await p.click('a[href="#/admin/spelare"]'); await p.waitForTimeout(600);
  await p.screenshot({ path: `adm2-lista-${v}.png`, fullPage: true });
  await p.click('[data-aktiv="10"]'); await p.waitForTimeout(600);
  console.log(v, 'ok-msg:', await p.locator('.ok').textContent());
  await p.click('.adm-ny summary');
  await p.fill('#fn-ny', 'Johan'); await p.fill('#en-ny', 'Test'); await p.fill('#gid-ny', '800101-002');
  await p.screenshot({ path: `adm3-ny-${v}.png`, fullPage: true });
  await p.click('#f-ny [type=submit]'); await p.waitForTimeout(600);
  console.log(v, 'efter ny:', await p.locator('.ok').textContent());
  await p.click('[data-andra="9"]'); await p.fill('#gid-9', '751212-034');
  await p.screenshot({ path: `adm4-andra-${v}.png`, fullPage: true });
  await p.click('#f-9 [type=submit]'); await p.waitForTimeout(600);
  console.log(v, 'efter ändra:', await p.locator('.ok').textContent(), '| Henrik meta:', await p.locator('[data-id="9"] .meta').textContent());
  pers = pers.filter((x) => x.id !== 100).map((x) => x.id === 10 ? { ...x, aktiv: false } : x.id === 9 ? { ...x, hcp: 13.4 } : x);
  await p.close();
}
await b.close();
