// Markörkonto: inloggning med andra kontot, Mata in visar bara öppen senaste THT, Admin nekas.
import { chromium } from 'playwright';
const MARKOR = 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6Im1hcmtvciJ9fQ.y';
const b = await chromium.launch();
for (const fall of ['oppen', 'avslutad']) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  const auth = [];
  await p.route('**/*', async (r) => {
    const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
    const J = (x, s = 200) => r.fulfill({ status: s, body: JSON.stringify(x), contentType: 'application/json' });
    if (u.pathname.includes('/auth/')) {
      const body = JSON.parse(r.request().postData()); auth.push(body.email ?? 'refresh');
      return body.email === 'h.lundqvist+thtmarkor@gmail.com' && body.password === 'mark1' ? J({ access_token: MARKOR, refresh_token: 'rt', expires_at: Date.now() / 1000 + 3600 }) : J({ error: 'bad' }, 400);
    }
    const t = u.pathname.replace('/rest/v1/', '');
    if (t === 'tht') return J(u.search.includes('deltavling') ? [{ nr: 30, artal: 2027, ort: 'Nytt', klar: fall === 'avslutad', deltavling: [{ id: 301 }] }, { nr: 29, artal: 2026, ort: 'Degerfors', klar: true, deltavling: [{ id: 201 }] }] : [{ nr: 30, artal: 2027, ort: 'Nytt', klar: fall === 'avslutad' }]);
    if (t === 'deltavling' && u.search.includes('tht_nr=eq.')) return J([{ id: 301, ordning: 1, namn: 'Ett', datum: '2027-09-03', banversion_id: 1, narmast_hal: null, longest_hal: null, banversion: { bana: { id: 5, namn: 'Ny GK' } }, runda: [] }]);
    if (t === 'deltavling') return J([
      { id: 301, ordning: 1, namn: 'Ett', datum: '2027-09-03', tht_nr: 30, tht: { artal: 2027, ort: 'Nytt', klar: fall === 'avslutad' }, banversion: { bana: { namn: 'Ny GK' } } },
      { id: 201, ordning: 1, namn: 'Gammal', datum: '2026-09-04', tht_nr: 29, tht: { artal: 2026, ort: 'Degerfors', klar: true }, banversion: { bana: { namn: 'Degerfors GK' } } }]);
    return J([]);
  });
  await p.goto('http://localhost:8765/#/mata'); await p.waitForTimeout(500);
  console.log(fall, 'login-text:', await p.textContent('.sub'));
  await p.fill('#kod', 'mark1'); await p.click('#login button'); await p.waitForTimeout(600);
  console.log(fall, 'auth-försök:', auth.join(', '));
  console.log(fall, 'THT-val:', (await p.locator('#matatht option').allTextContents()).join(' | ') || '(inget)');
  console.log(fall, 'kort:', (await p.locator('.rounds .rn').allTextContents()).join(' | ') || '(inga)');
  console.log(fall, 'text:', (await p.textContent('#app')).replace(/\s+/g, ' ').slice(0, 160));
  await p.screenshot({ path: `markor-${fall}.png`, fullPage: true });
  await p.goto('http://localhost:8765/#/admin'); await p.waitForTimeout(500);
  console.log(fall, 'admin → hash:', await p.evaluate(() => location.hash), '| kort på Mata in:', (await p.locator('.rounds .rn').allTextContents()).join(' | '));
  await p.goto('http://localhost:8765/#/admin/priser'); await p.waitForTimeout(600);
  console.log(fall, 'priser tillbaka:', await p.textContent('a.back'), '|', (await p.locator('#pristht option').allTextContents()).join(' | ') || (await p.textContent('#app')).replace(/\s+/g, ' ').slice(0, 120));
  await p.goto('http://localhost:8765/#/admin/banbetyg'); await p.waitForTimeout(600);
  console.log(fall, 'banbetyg:', (await p.locator('#betygtht option').allTextContents()).join(' | ') || (await p.textContent('#app')).replace(/\s+/g, ' ').slice(0, 120));
  await p.goto('http://localhost:8765/#/admin/banor'); await p.waitForTimeout(500);
  console.log(fall, 'banor:', (await p.textContent('#app')).replace(/\s+/g, ' ').slice(0, 140));
  await p.click('#bytkonto'); await p.waitForTimeout(300);
  console.log(fall, 'efter byt:', await p.locator('#kod').count() ? 'inloggningsformulär' : 'FEL');
  await p.close();
}
await b.close();
