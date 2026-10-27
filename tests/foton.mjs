// Foton: länksidan (ladda upp med EXIF-datum → rätt deltävling, krympning ≤ 300 kB, ta bort eget),
// årssidan som markör (ladda upp via appen), deltävlingssidan, All-time → Minnen. Supabase och Storage är attrapper.
import { chromium } from 'playwright';

// JPEG med EXIF DateTimeOriginal (byggs i webbläsaren: brus-bild 4000×3000 + egen APP1)
async function testbild(p, { w = 4000, h = 3000, datum = '2026:09:05 14:22:10' } = {}) {
  const b64 = await p.evaluate(async ({ w, h, datum }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); const d = g.createImageData(w, h);
    for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = (i / 4 % w) / w * 255; d.data[i + 2] = 120; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
    const jpg = new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95))).arrayBuffer());
    let ut = jpg;
    if (datum) {
      // TIFF (little endian): IFD0 med ExifIFD-pekare → Exif-IFD med 0x9003
      const s = new TextEncoder().encode(datum + '\0');   // 20 byte
      const t = new Uint8Array(8 + 2 + 12 + 4 + 2 + 12 + 4 + s.length); const v = new DataView(t.buffer);
      t.set([0x49, 0x49, 0x2a, 0x00]); v.setUint32(4, 8, true);
      v.setUint16(8, 1, true); v.setUint16(10, 0x8769, true); v.setUint16(12, 4, true); v.setUint32(14, 1, true); v.setUint32(18, 26, true); v.setUint32(22, 0, true);
      v.setUint16(26, 1, true); v.setUint16(28, 0x9003, true); v.setUint16(30, 2, true); v.setUint32(32, s.length, true); v.setUint32(36, 44, true); v.setUint32(40, 0, true);
      t.set(s, 44);
      const app1 = new Uint8Array(4 + 6 + t.length); const a = new DataView(app1.buffer);
      a.setUint16(0, 0xffe1); a.setUint16(2, 2 + 6 + t.length); app1.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4); app1.set(t, 10);
      ut = new Uint8Array(jpg.length + app1.length); ut.set(jpg.subarray(0, 2)); ut.set(app1, 2); ut.set(jpg.subarray(2), 2 + app1.length);
    }
    let bin = ''; for (let i = 0; i < ut.length; i += 0x8000) bin += String.fromCharCode(...ut.subarray(i, i + 0x8000));
    return btoa(bin);
  }, { w, h, datum });
  return Buffer.from(b64, 'base64');
}

const DELT = [{ id: 102, ordning: 1, namn: 'Öppning', datum: '2026-09-04', banversion: { bana: { namn: 'Degerfors GK' } } }, { id: 103, ordning: 2, namn: 'Andra', datum: '2026-09-05', banversion: { bana: { namn: 'Karlskoga GK' } } }];
const FOTON = [
  { id: 7, tht_nr: 29, deltavling_id: 102, person_id: 1, fil: '29/a.jpg', bredd: 1600, hojd: 1000, tagen: '2026-09-04T10:00:00+00', text: 'Utslaget på ettan', skapad: '2026-09-04', person: { fornamn: 'Martin' } },
  { id: 8, tht_nr: 29, deltavling_id: null, person_id: null, fil: '29/b.jpg', bredd: 1600, hojd: 1000, tagen: null, text: null, skapad: '2026-09-04', person: null },
];
const b = await chromium.launch();
const visaJpg = await (async () => { const p = await b.newPage(); await p.goto('http://localhost:8765/'); const x = await testbild(p, { w: 1600, h: 1000, datum: null }); await p.close(); return x; })();

function attrapp(p, logg, extra = () => null) {
  return p.route('**/*', async (r) => {
    const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
    const m = r.request().method(), t = u.pathname.replace('/rest/v1/', ''), q = decodeURIComponent(u.search);
    const J = (x, status = 200) => r.fulfill({ status, body: JSON.stringify(x), contentType: 'application/json' }).then(() => true);
    if (u.pathname.startsWith('/storage/v1/object/public/')) return r.fulfill({ status: 200, body: visaJpg, contentType: 'image/jpeg' });
    if (u.pathname.startsWith('/storage/v1/object/foton')) {
      const body = r.request().postDataBuffer();
      logg.push(`storage ${m} ${u.pathname.replace('/storage/v1/object/foton', '')} ${m === 'POST' ? body.length + ' byte' : body?.toString()} auth=${r.request().headers().authorization ? 'ja' : 'nej'}`);
      return J(m === 'POST' ? { Key: 'x' } : []);
    }
    const e = await extra(t, q, m, r, J); if (e !== null && e !== undefined) return e;
    if (t === 'deltavling' && q.includes('tht_nr=eq.29')) return J(DELT);
    if (t === 'foto' && m === 'GET') return J(q.includes('deltavling_id=eq.103') ? [] : FOTON);
    if (t === 'foto' && m === 'POST') { const x = JSON.parse(r.request().postData()); logg.push(`POST foto ${JSON.stringify(x)}`); return J([{ id: 99, ...x }], 201); }
    if (t === 'foto') { logg.push(`${m} foto ${q} ${r.request().postData() ?? ''}`); return r.fulfill({ status: 204, body: '' }); }
    return J([]);
  });
}

// ---------- 1. länksidan ----------
{
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  const logg = [];
  await attrapp(p, logg, (t, q, m, r, J) => {
    if (t === 'rpc/betyg_lank_info') return J({ fornamn: 'Henrik', tht: [{ tht_nr: 29, artal: 2026, ort: 'Degerfors', banor: [] }] });
    if (t === 'rpc/minne_lank_info') return J([]);
    if (t === 'rpc/foto_lank_info') return J([{ id: 7, tht_nr: 29, deltavling_id: 102, fil: '29/a.jpg', text: 'Utslaget på ettan', tagen: null }]);
    if (t === 'rpc/foto_lank_reservera') { logg.push(`reservera ${r.request().postData()}`); return J({ id: 50, fil: '29/ny.jpg' }); }
    if (t === 'rpc/foto_lank_ta_bort') { logg.push(`ta_bort ${r.request().postData()}`); return J('29/a.jpg'); }
    if (t.startsWith('rpc/')) { logg.push(`${t} ${r.request().postData()}`); return r.fulfill({ status: 204, body: '' }).then(() => true); }
    return null;
  });
  await p.goto('http://localhost:8765/#/betyg/abc123'); await p.waitForTimeout(900);
  console.log('länk h1:', await p.textContent('h1'), '| rubrik:', (await p.textContent('.foto-lank .foto-rubrik')).trim(), '| bilder:', await p.locator('.foto-lank .foto-ruta').count());
  await p.click('.foto-ny summary');
  const stor = await testbild(p);
  console.log('testbild:', Math.round(stor.length / 1000), 'kB');
  await p.setInputFiles('.fu input[type=file]', [{ name: 'IMG_1234.jpg', mimeType: 'image/jpeg', buffer: stor }, { name: 'IMG_1235.jpg', mimeType: 'image/jpeg', buffer: await testbild(p, { w: 800, h: 600, datum: null }) }]);
  await p.waitForSelector('.fu-rad:nth-child(2) select', { timeout: 20000 });
  console.log('rader:', (await p.locator('.fu-rad .meta').allTextContents()).join(' | '));
  console.log('förvalt:', await p.locator('.fu-rad').nth(0).locator('select').inputValue(), '/', await p.locator('.fu-rad').nth(1).locator('select').inputValue(), '(103 = R2 2026-09-05, tomt = hela THT)');
  await p.locator('.fu-rad').nth(0).locator('.fu-text').fill('Birdie på 18:e');
  console.log('knapp:', await p.textContent('.fu-skicka'));
  await p.screenshot({ path: 'foton-lank-fore.png', fullPage: true });
  await p.click('.fu-skicka'); await p.waitForTimeout(1200);
  console.log('meddelande:', await p.textContent('.fu-msg'));
  console.log('anrop:\n  ' + logg.join('\n  '));
  logg.length = 0;
  await p.locator('.foto-lank .foto-ruta').first().click(); await p.waitForTimeout(300);
  console.log('ljus:', (await p.textContent('.fl-topp')).replace(/\s+/g, ' ').trim(), '| text:', (await p.textContent('.fl-text')).replace(/\s+/g, ' ').trim());
  await p.screenshot({ path: 'foton-ljus.png' });
  await p.click('.fl-bort'); await p.click('.fl-bort'); await p.waitForTimeout(500);
  console.log('efter ta bort: ljus öppen', await p.locator('.foto-ljus').count(), '| anrop:', logg.join(' || '));
  await p.close();
}

// ---------- 2. årssidan som markör ----------
{
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.addInitScript(() => localStorage.setItem('tht-session', JSON.stringify({ access_token: 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6Im1hcmtvciJ9fQ.y', refresh_token: 'rt', expires_at: Date.now() / 1000 + 3600, roll: 'markor' })));
  const logg = [];
  await attrapp(p, logg, (t, q, m, r, J) => {
    if (t === 'tht') return J([{ nr: 29, artal: 2026, ort: 'Degerfors', klar: false, kronika: null }]);
    if (t === 'v_tht_resultat') return J([{ artal: 2026, person_id: 1, fornamn: 'Martin', placering: 1, poang: 70, slag: 170, rundor: 2 }]);
    return null;
  });
  await p.goto('http://localhost:8765/#/ar/2026'); await p.waitForTimeout(1000);
  console.log('år: rubrik', (await p.textContent('#foto-sek .foto-rubrik')).trim(), '| bilder:', await p.locator('#foto-sek .foto-ruta').count(), '| karusell-länk:', await p.locator('a[href="#/karusell/2026"]').count());
  await p.click('#foto-sek .foto-ny summary');
  await p.setInputFiles('#foto-sek .fu input[type=file]', [{ name: 'gammal.jpg', mimeType: 'image/jpeg', buffer: await testbild(p, { w: 1200, h: 900, datum: '2026:09:04 18:00:00' }) }]);
  await p.waitForSelector('#foto-sek .fu-rad select', { timeout: 20000 });
  console.log('förvalt:', await p.inputValue('#foto-sek .fu-rad select'), '(102 = R1)');
  await p.click('#foto-sek .fu-skicka'); await p.waitForTimeout(1000);
  console.log('meddelande:', await p.textContent('#foto-sek .fu-msg'));
  console.log('anrop:\n  ' + logg.map((x) => x.replace(/29\/[0-9a-f-]{36}/g, '29/<uuid>')).join('\n  '));
  await p.screenshot({ path: 'foton-ar.png', fullPage: true });
  await p.close();
}

// ---------- 3. deltävlingssidan + 4. All-time → Minnen (utan inloggning) ----------
{
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await attrapp(p, [], (t, q, m, r, J) => {
    if (t === 'deltavling' && q.includes('id=eq.102')) return J([{ id: 102, tht_nr: 29, ordning: 1, namn: 'Öppning', datum: '2026-09-04', banversion_id: null, tee: null, banversion: { bana: { id: 1, namn: 'Degerfors GK' } }, tht: { nr: 29, artal: 2026, ort: 'Degerfors', klar: false } }]);
    if (t === 'tht') return J([{ nr: 29, artal: 2026, ort: 'Degerfors', kronika: null }]);
    if (t === 'deltavling' && q.includes('tht_nr=gt.0')) return J(DELT.map((d) => ({ ...d, tht_nr: 29 })));
    return null;
  });
  await p.goto('http://localhost:8765/#/deltavling/102'); await p.waitForTimeout(900);
  console.log('deltävling: rubrik', (await p.textContent('#dt-foton .foto-rubrik')).trim(), '| ladda upp synlig (ej inloggad):', await p.locator('#dt-foton .foto-ny').count());
  await p.goto('http://localhost:8765/#/alltime/minnen'); await p.waitForTimeout(900);
  console.log('minnen:', (await p.textContent('#statflik .hint')).trim(), '|', (await p.textContent('.mm-ar-alla summary')).replace(/\s+/g, ' ').trim());
  await p.click('.mm-ar-alla summary'); await p.waitForTimeout(300);
  console.log('minnen bilder:', await p.locator('.mm-foton .foto-ruta').count(), '| sidbredd:', await p.evaluate(() => document.documentElement.scrollWidth));
  await p.close();
}
await b.close();
