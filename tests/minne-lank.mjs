// Personlig länk: ett eget minnesvärt moment per deltävling (sparas med lamna_minne), banbetyg som förut
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 900 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
const anrop = [];
await p.route('**/*', async (r) => {
  const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
  const t = u.pathname.replace('/rest/v1/', '');
  const J = (x) => r.fulfill({ status: 200, body: JSON.stringify(x), contentType: 'application/json' });
  if (t === 'rpc/betyg_lank_info') return J({ fornamn: 'Henrik', tht: [{ tht_nr: 29, artal: 2026, ort: 'Degerfors', banor: [{ bana_id: 80, namn: 'Degerfors GK', betyg: 4 }] }, { tht_nr: 28, artal: 2025, ort: 'Lindesberg', banor: [{ bana_id: 26, namn: 'Lindesbergs GK', betyg: null }] }] });
  if (t === 'rpc/minne_lank_info') return J([{ deltavling_id: 103, tht_nr: 29, artal: 2026, ort: 'Degerfors', ordning: 2, bana: 'Degerfors GK', text: null }, { deltavling_id: 102, tht_nr: 29, artal: 2026, ort: 'Degerfors', ordning: 1, bana: 'Degerfors GK', text: 'Chip in' }, { deltavling_id: 90, tht_nr: 28, artal: 2025, ort: 'Lindesberg', ordning: 1, bana: 'Lindesbergs GK', text: null }]);
  if (t.startsWith('rpc/')) { anrop.push(`${t} ${r.request().postData()}`); return r.fulfill({ status: 200, body: '' }); }
  return J([]);
});
await p.goto('http://localhost:8765/#/betyg/abc123'); await p.waitForTimeout(800);
console.log('h1:', await p.textContent('h1'), '| rutor:', await p.locator('.mm-lank textarea').count(), '| R-ordning 2026:', (await p.locator('details').first().locator('.mm-lank-rad .meta').allTextContents()).join(', '));
console.log('befintlig text:', await p.inputValue('textarea[data-did="102"]'));
await p.fill('textarea[data-did="103"]', 'Birdie på 18:e'); await p.fill('textarea[data-did="102"]', '');
console.log('status:', await p.textContent('#msg'));
await p.click('#spara'); await p.waitForTimeout(500);
console.log('status efter:', await p.textContent('#msg'));
console.log('anrop:', anrop.join(' || '));
await p.screenshot({ path: 'minne-lank.png', fullPage: true });
await b.close();
