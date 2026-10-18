// Quiz: skapa (frågor ur datan), redigera (byt, ta bort, egen fråga), storskärm (quiz och flashcards med tangenter)
import { chromium } from 'playwright';
import fs from 'fs';
const DATA = process.env.QUIZ_DATA ? JSON.parse(fs.readFileSync(process.env.QUIZ_DATA)) : null;
const ADMIN = 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6ImFkbWluIn19.y';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.addInitScript((t) => localStorage.setItem('tht-session', JSON.stringify({ access_token: t, refresh_token: 'rt', expires_at: Date.now() / 1000 + 3600, roll: 'admin' })), ADMIN);
const enkel = {
  v_tht_resultat: [{ tht_nr: 15, artal: 2012, fornamn: 'Robert', placering: 1, poang: 150 }, { tht_nr: 15, artal: 2012, fornamn: 'Marcus', placering: 2, poang: 140 }, { tht_nr: 16, artal: 2013, fornamn: 'Henrik', placering: 1, poang: 160 }, { tht_nr: 16, artal: 2013, fornamn: 'Pär', placering: 2, poang: 150 }, { tht_nr: 16, artal: 2013, fornamn: 'Jörgen', placering: 3, poang: 120 }],
  tht: [{ nr: 15, artal: 2012, ort: 'Stockholm', klar: true, kronika: 'Det var varmt och alla fick skavsår redan första dagen på Arninge.' }, { nr: 16, artal: 2013, ort: 'Lindesberg', klar: true, kronika: null }],
  deltavling: [{ id: 1, tht_nr: 15, ordning: 1, banversion: { bana: { namn: 'Arninge GK' } } }, { id: 2, tht_nr: 16, ordning: 1, banversion: { bana: { namn: 'Lindesbergs GK' } } }, { id: 3, tht_nr: 16, ordning: 2, banversion: { bana: { namn: 'Nora Golfbana' } } }],
  kommentar: [{ id: 1, deltavling_id: 1, text: 'Var fan är min järnnia?', fran_lank: false, runda: { person: { fornamn: 'Pär' } } }],
  v_stat_totalt: [{ fornamn: 'Robert', rundor: 90, poang: 2800, meter: 500000, banor: 50 }, { fornamn: 'Marcus', rundor: 88, poang: 2700, meter: 480000, banor: 48 }],
  v_stat_fordelning: [], v_stat_halvinst: [], pris: [], v_runda: [], overnattning: [], ban_betyg: [],
};
const D = DATA ?? enkel;
let quiz = [];
await p.route('**/*', async (r) => {
  const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
  const t = u.pathname.replace('/rest/v1/', ''), m = r.request().method(), q = decodeURIComponent(u.search);
  const J = (x, s = 200) => r.fulfill({ status: s, body: JSON.stringify(x), contentType: 'application/json' });
  if (t === 'quiz') {
    if (m === 'POST') { const x = { id: 1, ...JSON.parse(r.request().postData()), andrad: '2026-10-18' }; quiz = [x]; return J([x], 201); }
    if (m === 'PATCH') { Object.assign(quiz[0], JSON.parse(r.request().postData())); return r.fulfill({ status: 204, body: '' }); }
    if (m === 'DELETE') { quiz = []; return r.fulfill({ status: 204, body: '' }); }
    return J(quiz);
  }
  if (t === 'kommentar') { const off = Number(q.match(/offset=(\d+)/)?.[1] ?? 0); return J((D.kommentar ?? []).slice(off, off + 1000)); }
  return J(D[t] ?? []);
});
await p.goto('http://localhost:8765/#/admin'); await p.waitForTimeout(500);
console.log('adminmeny har quiz:', await p.locator('a[href="#/admin/quiz"]').count());
await p.goto('http://localhost:8765/#/admin/quiz'); await p.waitForTimeout(500);
await p.fill('input[name=namn]', 'Middagsquiz'); await p.selectOption('select[name=antal]', '40');
await p.click('#nyquiz button[type=submit]'); await p.waitForTimeout(1200);
const n0 = quiz[0]?.fragor.length;
const amn = {}; (quiz[0]?.fragor ?? []).forEach((f) => { amn[f.amne] = (amn[f.amne] ?? 0) + 1; });
console.log('skapad:', quiz[0]?.namn, '| frågor:', n0, '| per ämne:', JSON.stringify(amn), '| hash:', await p.evaluate(() => location.hash));
console.log('exempel:'); (quiz[0]?.fragor ?? []).slice(0, 8).forEach((f) => console.log('  -', f.fraga.slice(0, 90), '→', f.svar, '| fel:', f.fel.join(', ')));
const tre = (quiz[0]?.fragor ?? []).filter((f) => f.fel.length === 3).length;
console.log('med 3 felsvar:', tre, 'av', n0, '| rätt svar bland felsvar:', (quiz[0]?.fragor ?? []).filter((f) => f.fel.includes(f.svar)).length);
await p.click('[data-bort="0"]'); await p.waitForTimeout(300);
console.log('efter ta bort:', quiz[0].fragor.length);
await p.fill('#egen input[name=fraga]', 'Vem tappade bilnyckeln?'); await p.fill('#egen input[name=svar]', 'Jörgen'); await p.click('#egen button[type=submit]'); await p.waitForTimeout(300);
console.log('egen fråga sist:', JSON.stringify(quiz[0].fragor.at(-1)));
await p.screenshot({ path: 'quiz-redigera.png', fullPage: false });
await p.goto('http://localhost:8765/#/quiz/1'); await p.waitForTimeout(600);
console.log('storskärm topbar dold:', await p.evaluate(() => getComputedStyle(document.querySelector('.topbar')).display));
await p.click('[data-lage="quiz"]'); await p.waitForTimeout(200);
console.log('fråga 1:', await p.textContent('.qs-nr'), '| alt:', await p.locator('.qs-alt li').count());
await p.screenshot({ path: 'quiz-storskarm-fraga.png' });
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
console.log('efter → rätt markerad:', await p.locator('.qs-alt li.ratt').count(), '| info:', await p.locator('.qs-info').count());
await p.screenshot({ path: 'quiz-storskarm-svar.png' });
await p.keyboard.press('Space'); await p.waitForTimeout(150);
console.log('nästa:', await p.textContent('.qs-nr'));
await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(150);
console.log('tillbaka:', await p.textContent('.qs-nr'), '| visat:', await p.locator('.qs-fraga.visat').count());
await p.click('.qs-ut'); await p.waitForTimeout(300);
await p.goto('http://localhost:8765/#/quiz/1'); await p.waitForTimeout(500);
await p.click('[data-lage="kort"]'); await p.click('.qs-kort'); await p.waitForTimeout(150);
console.log('flashcard svar:', await p.textContent('.qs-svar'));
await p.goto('http://localhost:8765/#/alltime'); await p.waitForTimeout(400);
console.log('tillbaka i appen, topbar:', await p.evaluate(() => getComputedStyle(document.querySelector('.topbar')).display));
await b.close();
