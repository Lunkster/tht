import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.addInitScript(() => localStorage.setItem('tht-session', JSON.stringify({ access_token: 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6ImFkbWluIn19.y', refresh_token: 'r', expires_at: Date.now() / 1000 + 3600 })));
await p.route('**/*', (r) => { const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
  const t = u.pathname.replace('/rest/v1/', ''); return r.fulfill({ contentType: 'application/json', body: JSON.stringify(t === 'tht' ? [{ nr: 28, artal: 2025, ort: 'Lindesberg', start: null, deltavling: [] }] : []) }); });
await p.goto('http://localhost:8765/#/admin/tht'); await p.waitForTimeout(600);
for (const v of ['20260904', '2026-9-4', '2026-02-30', '']) {
  await p.fill('#tstart', v); await p.locator('#tort').focus();
  console.log(JSON.stringify(v), '→', JSON.stringify(await p.inputValue('#tstart')), 'fel:', await p.locator('#tstart').evaluate((e) => e.classList.contains('fel')));
}
await p.fill('#tstart', '2026-02-30'); await p.fill('#tort', 'Visby'); await p.click('#nytht [type=submit]');
console.log('spara ogiltigt:', await p.locator('#tmsg').textContent());
console.log('placeholder:', await p.getAttribute('#tstart', 'placeholder'));
await b.close();
