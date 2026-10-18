// Övningsrunda (THT 0): eget kort i Mata in (inte i THT-listan), ruta på deltävlingen, admin kan tömma med två tryck
import { chromium } from 'playwright';
const TOKEN = { markor: 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6Im1hcmtvciJ9fQ.y', admin: 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6ImFkbWluIn19.y' };
const b = await chromium.launch();
for (const roll of ['markor', 'admin']) {
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.addInitScript(([t, r]) => localStorage.setItem('tht-session', JSON.stringify({ access_token: t, refresh_token: 'rt', expires_at: Date.now() / 1000 + 3600, roll: r })), [TOKEN[roll], roll]);
  let rundor = [{ id: 501, person_id: 9, spel_hcp: 14, boll_nr: 1 }, { id: 502, person_id: 3, spel_hcp: 9, boll_nr: 1 }];
  const raderat = [];
  await p.route('**/*', async (r) => {
    const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
    const t = u.pathname.replace('/rest/v1/', ''), q = decodeURIComponent(u.search), m = r.request().method();
    const J = (x, s = 200) => r.fulfill({ status: s, body: JSON.stringify(x), contentType: 'application/json' });
    if (m === 'DELETE') { raderat.push(`${t}?${q.replace('?', '')}`); if (t === 'runda') rundor = []; return r.fulfill({ status: 204, body: '' }); }
    if (t === 'deltavling' && q.includes('id=eq.107')) return J([{ id: 107, ordning: 1, namn: 'Övningsrunda', datum: '2000-01-01', tht_nr: 0, banversion: { bana: { namn: 'Bro-Bålsta GK' } } }]);
    if (t === 'deltavling') return J([
      { id: 106, ordning: 1, namn: 'Ett', datum: '2027-09-03', tht_nr: 30, tht: { artal: 2027, ort: 'Nytt', klar: false }, banversion: { bana: { namn: 'Ny GK' } } },
      { id: 107, ordning: 1, namn: 'Övningsrunda', datum: '2000-01-01', tht_nr: 0, tht: { artal: 0, ort: 'Övning', klar: false }, banversion: { bana: { namn: 'Bro-Bålsta GK' } } }]);
    if (t === 'tht') return J([{ nr: 30, artal: 2027, ort: 'Nytt', klar: false }]);
    if (t === 'runda') return J(q.includes('person(fornamn)') ? rundor.map((x) => ({ ...x, deltavling_id: 107, person: { fornamn: x.person_id === 9 ? 'Henrik' : 'Robert' } })) : rundor);
    if (t === 'person') return J([{ id: 9, fornamn: 'Henrik', efternamn: 'L', aktiv: true }, { id: 3, fornamn: 'Robert', efternamn: 'R', aktiv: true }]);
    return J([]);
  });
  await p.goto('http://localhost:8765/#/mata'); await p.waitForTimeout(700);
  console.log(roll, 'THT-val:', (await p.locator('#matatht option').allTextContents()).join(' | '), '| kort:', (await p.locator('.rounds .rn').allTextContents()).join(' | '));
  await p.click('.ovning-kort'); await p.waitForTimeout(700);
  console.log(roll, 'h1:', await p.textContent('h1'), '| ruta:', (await p.textContent('.ovning-ruta')).replace(/\s+/g, ' ').slice(0, 80), '| töm-knapp:', await p.locator('#tom-ovning').count());
  if (roll === 'admin') {
    await p.click('#tom-ovning'); await p.waitForTimeout(150);
    console.log('efter första trycket:', await p.textContent('#tom-ovning'), '| raderat:', raderat.length);
    await p.click('#tom-ovning'); await p.waitForTimeout(700);
    console.log('raderat:', raderat.join(' , '), '| bollar kvar:', await p.locator('.round.boll').count());
    await p.screenshot({ path: 'ovning-admin.png', fullPage: true });
  }
  await p.close();
}
await b.close();
