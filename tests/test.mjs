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
await p.goto('http://localhost:8765/#/ar');
await p.waitForTimeout(1200);
await p.screenshot({ path: `ar-${name}.png`, fullPage: true });
const bx = await p.locator('#kurvabox').boundingBox();
await p.mouse.move(bx.x+bx.width*0.62, bx.y+bx.height*0.5); await p.waitForTimeout(200);
await p.locator('.chartcard').screenshot({ path: `graf-${name}.png` });
await p.goto('http://localhost:8765/#/alltime'); await p.waitForTimeout(800);
await p.screenshot({ path: `alltime-${name}.png`, fullPage: true });
}
await b.close();
