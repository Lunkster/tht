// Minnesvärda moment: skriva i Mata in (bollar), på årssidan i avslutad THT, ändra/ta bort, visas på scorekortet
import { chromium } from 'playwright';
const MARKOR = 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6Im1hcmtvciJ9fQ.y';
const b = await chromium.launch();
for (const inloggad of [true, false]) {
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  if (inloggad) await p.addInitScript((t) => localStorage.setItem('tht-session', JSON.stringify({ access_token: t, refresh_token: 'rt', expires_at: Date.now() / 1000 + 3600, roll: 'markor' })), MARKOR);
  let kom = [{ id: 1, deltavling_id: 201, runda_id: 11, boll_nr: null, text: 'Chip in 40 m', skapad: '2026-09-04T18:00:00+00' }];
  let nid = 2; const skrivet = [];
  await p.route('**/*', async (r) => {
    const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
    const t = u.pathname.replace('/rest/v1/', ''), q = decodeURIComponent(u.search), m = r.request().method();
    const J = (x, s = 200) => r.fulfill({ status: s, body: JSON.stringify(x), contentType: 'application/json' });
    if (t === 'kommentar') {
      if (m === 'POST') { const x = JSON.parse(r.request().postData()); skrivet.push('POST ' + JSON.stringify(x)); kom.push({ boll_nr: null, runda_id: null, ...x, id: nid++, skapad: '2026-10-18T12:00:00+00' }); return r.fulfill({ status: 201, body: '' }); }
      if (m === 'PATCH') { const id = Number(q.match(/id=eq\.(\d+)/)[1]); const x = JSON.parse(r.request().postData()); skrivet.push('PATCH ' + id); kom = kom.map((k) => (k.id === id ? { ...k, ...x } : k)); return r.fulfill({ status: 204, body: '' }); }
      if (m === 'DELETE') { const id = Number(q.match(/id=eq\.(\d+)/)[1]); skrivet.push('DELETE ' + id); kom = kom.filter((k) => k.id !== id); return r.fulfill({ status: 204, body: '' }); }
      if (q.includes('runda_id=eq.')) return J(kom.filter((k) => k.runda_id === 11).map((k) => ({ text: k.text })));
      return J(kom);
    }
    if (t === 'runda' && q.includes('person(fornamn)')) return J([{ id: 11, deltavling_id: 201, person_id: 9, boll_nr: 1, person: { fornamn: 'Henrik' } }, { id: 12, deltavling_id: 201, person_id: 3, boll_nr: 1, person: { fornamn: 'Robert' } }]);
    if (t === 'runda') return J([{ id: 11, person_id: 9, spel_hcp: 14, boll_nr: 1 }, { id: 12, person_id: 3, spel_hcp: 9, boll_nr: 1 }]);
    if (t === 'person') return J([{ id: 9, fornamn: 'Henrik', efternamn: 'L', aktiv: true }, { id: 3, fornamn: 'Robert', efternamn: 'R', aktiv: true }]);
    if (t === 'tht') return J([{ nr: 29, artal: 2026, ort: 'Degerfors', klar: true, kronika: null }]);
    if (t === 'v_tht_resultat') return J(q.includes('tht_nr') ? [{ tht_nr: 29, artal: 2026, person_id: 3, fornamn: 'Robert', placering: 1, poang: 70, rundor: 1 }, { tht_nr: 29, artal: 2026, person_id: 9, fornamn: 'Henrik', placering: 2, poang: 66, rundor: 1 }] : [{ artal: 2026 }]);
    if (t === 'v_runda') return J([{ runda_id: 12, person_id: 3, ordning: 1, poang: 36, slag: 80, antal_hal: 18, spel_hcp: 9 }, { runda_id: 11, person_id: 9, ordning: 1, poang: 33, slag: 88, antal_hal: 18, spel_hcp: 14 }]);
    if (t === 'deltavling') return J([{ id: 201, ordning: 1, namn: 'Första', datum: '2026-09-04', tht_nr: 29, narmast_hal: null, longest_hal: null, vinnare_utan_kort: null, banversion: { bana: { id: 5, namn: 'Degerfors GK' } } }]);
    return J([]);
  });
  const vis = async (lbl) => console.log(inloggad ? 'markör' : 'utloggad', lbl, (await p.locator('.mm-lista li').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim()).join(' | ') || '(inga)');
  if (inloggad) {
    await p.goto('http://localhost:8765/#/mata/201'); await p.waitForTimeout(800);
    await vis('mata, före:');
    await p.click('.mm-boll'); await p.waitForTimeout(300);
    console.log('valt i formuläret:', await p.inputValue('.mm-form select'));
    await p.fill('.mm-form textarea', 'Hela bollen i bunkern på 9:an'); await p.click('.mm-form button[type=submit]'); await p.waitForTimeout(500);
    await vis('mata, efter:');
    await p.screenshot({ path: 'minnen-mata.png', fullPage: true });
  }
  await p.goto('http://localhost:8765/#/ar/2026'); await p.waitForTimeout(900);
  console.log(inloggad ? 'markör' : 'utloggad', 'årssidan summary:', (await p.locator('.mm-ar summary').allTextContents()).join(' | ') || '(ingen)');
  if (await p.locator('.mm-ar summary').count()) {
    await p.click('.mm-ar summary'); await p.waitForTimeout(300); await vis('årssidan:');
    console.log('formulär:', await p.locator('.mm-ar .mm-form').count(), '| ändra-knappar:', await p.locator('.mm-andra').count());
    if (inloggad) {
      await p.selectOption('.mm-ar .mm-form select', 'd'); await p.fill('.mm-ar .mm-form textarea', 'Åska på 14:e, alla in i klubbhuset'); await p.click('.mm-ar .mm-form button[type=submit]'); await p.waitForTimeout(500);
      await p.locator('.mm-andra').first().click(); await p.fill('.mm-ny', 'Chip in 40 m på 7:an'); await p.click('.mm-spara'); await p.waitForTimeout(400);
      await p.locator('.mm-bort').nth(1).click(); await p.locator('.mm-bort').nth(1).click(); await p.waitForTimeout(400);
      await vis('årssidan efter skriv/ändra/ta bort:');
      console.log('summary nu:', await p.locator('.mm-ar summary').textContent(), '| anrop:', skrivet.join(', '));
      await p.screenshot({ path: 'minnen-ar.png', fullPage: true });
    }
  }
  await p.goto('http://localhost:8765/#/runda/11'); await p.waitForTimeout(700);
  console.log(inloggad ? 'markör' : 'utloggad', 'scorekort:', (await p.locator('.runda-kommentar').allTextContents()).join(' | ') || '(inga)');
  await p.close();
}
await b.close();
