import { chromium } from 'playwright';
import fs from 'fs';
const d = JSON.parse(fs.readFileSync(new URL('./fixture.json', import.meta.url)));
const b = await chromium.launch();
for (const [w,h,name] of [[390,844,'mobil'],[1100,900,'dator']]) {
const p = await b.newPage({ viewport: { width: w, height: h } });
p.on('pageerror', e => console.log('ERR', e.message)); p.on('console', m => m.type()==='error' && console.log('console:', m.text()));
await p.route('**/*', async (r) => {
  const u = new URL(r.request().url());
  if (u.hostname.includes('supabase')) {
    const path = u.pathname.replace('/rest/v1/', ''); const q = decodeURIComponent(u.search);
    let body = [];
    if (path === 'tht') body = d.tht;
    else if (path === 'v_tht_resultat') body = q.includes('tht_nr') ? d.res : (q.includes('placering') ? d.resall : d.resall.map(x=>({artal:x.artal})));
    else if (path === 'v_runda') body = d.rundor.map(x=>({...x, fornamn: 'X'+x.person_id}));
    else if (path === 'v_tht_kurva') body = d.kurva;
    else if (path === 'deltavling') body = d.delt;
    else if (path === 'pris') body = d.pris;
    return r.fulfill({ body: JSON.stringify(body), contentType: 'application/json' });
  }
  return r.continue();
});
let calls=0; p.on('request', r=>{ if(r.url().includes('v_tht_resultat')) calls++; });
await p.goto('http://localhost:8765/#/leaderboard');
await p.waitForTimeout(1200);
console.log(name, 'active tab:', await p.locator('.tabs a.active').textContent(), '| h1:', await p.locator('h1').textContent(), '| sub:', await p.locator('.sub').textContent());
console.log('podium?', await p.locator('.podium').count(), 'rounds?', await p.locator('.rounds').count(), 'rows', await p.locator('#lb tbody tr').count());
await p.locator('.seg button[data-mode=poang]').click();
await p.evaluate(()=>window.dispatchEvent(new Event('resize')));
await p.screenshot({ path: `lb-${name}.png`, fullPage: true });
await p.goto('http://localhost:8765/#/alltime'); await p.waitForTimeout(500);
console.log('alltime h1 ok:', await p.locator('h1').count(), 'resultat calls', calls);
}
await b.close();