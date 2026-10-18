// All-time → Minnen: krönikor och minnesvärda moment år för år, hopfällda, med antal; ordning äldst/nyast
import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [w, v] of [[390, 'mobil'], [1100, 'dator']]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.route('**/*', async (r) => {
    const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
    const t = u.pathname.replace('/rest/v1/', '');
    const J = (x) => r.fulfill({ status: 200, body: JSON.stringify(x), contentType: 'application/json' });
    if (t === 'tht') return J([{ nr: 15, artal: 2012, ort: 'Stockholm', kronika: 'Varmt.\n\nSkavsår.' }, { nr: 16, artal: 2013, ort: 'Lindesberg', kronika: null }, { nr: 17, artal: 2014, ort: 'Inget', kronika: '' }]);
    if (t === 'deltavling') return J([{ id: 1, tht_nr: 15, ordning: 2, banversion: { bana: { namn: 'Arninge GK' } } }, { id: 2, tht_nr: 16, ordning: 1, banversion: { bana: { namn: 'Lindesbergs GK' } } }, { id: 3, tht_nr: 17, ordning: 1, banversion: null }]);
    if (t === 'kommentar') return J([{ id: 1, deltavling_id: 1, runda_id: 11, text: 'Var fan är min järnnia?', skapad: '2012-09-01T18:00:00+00', fran_lank: false }, { id: 2, deltavling_id: 1, boll_nr: 2, text: 'Åska', skapad: '2012-09-01T19:00:00+00', fran_lank: false }, { id: 3, deltavling_id: 2, runda_id: 12, text: 'Robert sänkte från bunkern', skapad: '2013-09-01T18:00:00+00', fran_lank: true }]);
    if (t === 'runda') return J([{ id: 11, deltavling_id: 1, person_id: 4, boll_nr: 2, person: { fornamn: 'Pär' } }, { id: 12, deltavling_id: 2, person_id: 9, boll_nr: 1, person: { fornamn: 'Henrik' } }]);
    return J([]);
  });
  await p.goto('http://localhost:8765/#/alltime/minnen'); await p.waitForTimeout(800);
  console.log(v, 'flik på:', await p.locator('.underflikar a.on').textContent(), '| år:', (await p.locator('.mm-ar-alla summary').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim()).join(' | '), '| hint:', await p.locator('#statflik .hint').first().textContent());
  await p.locator('.mm-ar-alla summary').nth(1).click(); await p.waitForTimeout(200);
  console.log(v, '2013 utfällt:', (await p.locator('.mm-ar-alla').nth(1).locator('li').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim()).join(' | '));
  await p.click('[data-o="1"]'); await p.waitForTimeout(200);
  console.log(v, 'nyast först:', (await p.locator('.mm-ar-alla summary strong').allTextContents()).join(','));
  await p.locator('.mm-ar-alla summary').nth(1).click(); await p.waitForTimeout(200);
  await p.screenshot({ path: `minnen-alla-${v}.png`, fullPage: true });
  await p.close();
}
await b.close();
