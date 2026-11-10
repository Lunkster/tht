// Quiz i telefonen (v0.39.0): admin startar en omgång på tv:n, en spelare och en gäst går med i var sin telefon,
// godkänns på tv:n, svarar, tv:n går vidare när alla svarat, slutresultat, All-time → Quiz och spelarsidan.
// Supabase ersätts av en liten attrapp med samma regler som funktionerna i migrering 30.
import { chromium } from 'playwright';
const ADMIN = 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6ImFkbWluIn19.y';
const quiz = [{ id: 1, namn: 'Middagsquiz', andrad: '2026-11-10', fragor: [
  { amne: 'vinnare', fraga: 'Vem vann THT 2012?', svar: 'Robert', fel: ['Marcus', 'Henrik', 'Pär'] },
  { amne: 'egen', egen: true, fraga: 'Bara flashcard', svar: 'x', fel: [] },
  { amne: 'platser', fraga: 'Var spelades R2 2019?', svar: 'The Island', fel: ['Portmarnock', 'Malahide'] }] }];
const personer = [{ id: 1, fornamn: 'Martin', aktiv: true }, { id: 2, fornamn: 'Robert', aktiv: true }];
const S = { spel: [], enhet: {}, delt: [], svar: [] };
let nid = 1;
const fel = (r, m) => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: m }) });
const stall = (sp) => S.delt.filter((d) => d.spel_id === sp.id && d.godkand).map((d) => ({ d, p: S.svar.filter((x) => x.deltagare_id === d.id).reduce((a, x) => a + x.poang, 0) }));
const rpcs = {
  quiz_spelare: (a) => (S.spel.some((s) => s.kod === a.p_kod && s.status !== 'slut') ? personer : null),
  quiz_ga_med: (a) => {
    const s = S.spel.find((x) => x.kod === a.p_kod && x.status !== 'slut'); if (!s) throw new Error('Ingen pågående quiz med den koden');
    const pid = a.p_person_id, gast = a.p_gast_namn;
    let e = S.enhet[a.p_enhet];
    if (!(e && ((pid && e.person_id === pid) || (!pid && e.gast_namn === gast)))) { e = { nyckel: 'n' + (nid++) + 'x'.repeat(20), person_id: pid, gast_namn: pid ? null : gast, betrodd: false }; S.enhet[e.nyckel] = e; }
    let d = S.delt.find((x) => x.spel_id === s.id && x.enhet === e.nyckel);
    if (!d) { d = { id: nid++, spel_id: s.id, person_id: pid, gast_namn: pid ? null : gast, enhet: e.nyckel, godkand: false }; S.delt.push(d); }
    if (e.betrodd) d.godkand = true;
    return { enhet: e.nyckel, deltagare_id: d.id, godkand: d.godkand, namn: personer.find((p) => p.id === pid)?.fornamn ?? gast };
  },
  quiz_lage: (a) => {
    const s = [...S.spel].reverse().find((x) => x.kod === a.p_kod); if (!s) return { status: 'saknas' };
    const d = S.delt.find((x) => x.spel_id === s.id && x.enhet === a.p_enhet); if (!d) return { status: 'ej_med' };
    if (!d.godkand) return { status: 'vantar', namn: s.namn };
    const st = stall(s), mig = st.find((x) => x.d.id === d.id), f = s.fragor[s.fraga_nr], mitt = S.svar.find((x) => x.deltagare_id === d.id && x.fraga_nr === s.fraga_nr);
    const visa = s.status === 'svar' || s.status === 'slut';
    return { status: s.status, namn: s.namn, fraga_nr: s.fraga_nr, antal_fragor: s.fragor.length, fraga: f?.fraga, alt: f?.alt, tid_s: s.tid_s,
      kvar_ms: s.status === 'fraga' ? Math.max(0, s.tid_s * 1000 - (Date.now() - s.t0)) : null, mitt_svar: mitt?.svar ?? null, ratt: visa ? f?.ratt : null,
      poang: visa ? mitt?.poang ?? null : null, totalt: mig.p, placering: st.filter((x) => x.p > mig.p).length + 1, deltagare: st.length };
  },
  quiz_svara: (a) => {
    const s = S.spel.find((x) => x.kod === a.p_kod && x.status === 'fraga'); if (!s || s.fraga_nr !== a.p_fraga_nr) throw new Error('Frågan är redan slut');
    const d = S.delt.find((x) => x.spel_id === s.id && x.enhet === a.p_enhet && x.godkand); if (!d) throw new Error('Du är inte med i quizen');
    const ms = Date.now() - s.t0, r = a.p_svar === s.fragor[s.fraga_nr].ratt;
    if (!S.svar.some((x) => x.deltagare_id === d.id && x.fraga_nr === a.p_fraga_nr)) S.svar.push({ deltagare_id: d.id, fraga_nr: a.p_fraga_nr, svar: a.p_svar, ratt: r, ms, poang: r ? Math.round(1000 - 500 * ms / (s.tid_s * 1000)) : 0 });
    return { ok: true };
  },
  quiz_styr: (a) => { const s = S.spel.find((x) => x.id === a.p_spel_id); Object.assign(s, { status: a.p_status, fraga_nr: a.p_fraga_nr }); if (a.p_status === 'fraga') { s.t0 = Date.now(); s.fraga_start = new Date().toISOString(); } if (a.p_status === 'slut') s.avslutad = '2026-11-10'; return null; },
  quiz_godkann: (a) => { const d = S.delt.find((x) => x.id === a.p_deltagare_id); if (a.p_ja) { d.godkand = true; S.enhet[d.enhet].betrodd = true; } else S.delt = S.delt.filter((x) => x !== d); return null; },
  quiz_resultat: () => S.spel.filter((s) => s.status === 'slut').flatMap((s) => { const st = stall(s); return st.map(({ d, p }) => ({ spel_id: s.id, namn: s.namn, datum: '2026-11-10', antal_fragor: s.fragor.length, deltagare_id: d.id, person_id: d.person_id, gast_namn: d.gast_namn, fornamn: personer.find((x) => x.id === d.person_id)?.fornamn ?? null, poang: p, ratt: S.svar.filter((x) => x.deltagare_id === d.id && x.ratt).length, svarade: 0, placering: st.filter((x) => x.p > p).length + 1, antal_deltagare: st.length })); }),
};
const rutt = async (r) => {
  const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
  const t = u.pathname.replace('/rest/v1/', ''), m = r.request().method(), q = decodeURIComponent(u.search);
  const J = (x, s = 200) => r.fulfill({ status: s, body: JSON.stringify(x), contentType: 'application/json' });
  if (t.startsWith('rpc/')) { try { const x = rpcs[t.slice(4)]?.(JSON.parse(r.request().postData() || '{}')); return x === null ? r.fulfill({ status: 204, body: '' }) : J(x ?? []); } catch (e) { return fel(r, e.message); } }
  if (t === 'quiz') return J(q.includes('id=eq.1') ? quiz : quiz);
  if (t === 'quiz_spel') {
    if (m === 'POST') { const x = { id: S.spel.length + 1, status: 'lobby', fraga_nr: -1, ...JSON.parse(r.request().postData()) }; S.spel.push(x); return J([x], 201); }
    return J(q.includes('id=eq.') ? S.spel.filter((s) => s.id === Number(q.match(/id=eq\.(\d+)/)[1])) : S.spel);
  }
  if (t === 'quiz_deltagare') { const sid = Number(q.match(/spel_id=eq\.(\d+)/)?.[1]); return J(S.delt.filter((d) => !sid || d.spel_id === sid).filter((d) => !q.includes('person_id=is.null') || (!d.person_id && d.godkand)).map((d) => ({ ...d, person: d.person_id ? { fornamn: personer.find((x) => x.id === d.person_id).fornamn } : null, quiz_spel: { namn: 'Middagsquiz', avslutad: '2026-11-10' } }))); }
  if (t === 'quiz_svar') { const ids = (q.match(/in\.\(([^)]*)\)/)?.[1] ?? '').split(',').map(Number); return J(S.svar.filter((x) => ids.includes(x.deltagare_id))); }
  if (t === 'person') return J(personer);
  return J([]);
};
const b = await chromium.launch();
const ny = async (namn, w, admin = false) => {
  const c = await b.newContext({ viewport: { width: w, height: w > 600 ? 800 : 780 }, locale: 'en-US' });
  if (admin) await c.addInitScript((tk) => localStorage.setItem('tht-session', JSON.stringify({ access_token: tk, refresh_token: 'rt', expires_at: Date.now() / 1000 + 3600, roll: 'admin' })), ADMIN);
  const p = await c.newPage(); p.on('pageerror', (e) => console.log(namn, 'ERR', e.message)); await p.route('**/*', rutt); return p;
};
const tv = await ny('tv', 1280, true), m1 = await ny('martin', 390), g1 = await ny('gäst', 390);
await tv.goto('http://localhost:8765/#/admin/quiz/1'); await tv.waitForTimeout(800);
await tv.selectOption('#qp-tidval', '30'); await tv.click('#qp-starta'); await tv.waitForTimeout(1500);
const kod = S.spel[0]?.kod;
console.log('TV lobby:', tv.url().split('#')[1], '| kod på tv:', (await tv.textContent('.qp-kod').catch(() => '?')).replace(/\s/g, ''), '=', kod, '| frågor i omgången:', S.spel[0]?.fragor.length, '(flashcard bortsorterat)');
await tv.screenshot({ path: 'quizspel-tv-lobby.png' });
// Martin: skriver koden och väljer namn
await m1.goto('http://localhost:8765/#/spela'); await m1.waitForTimeout(500);
await m1.fill('#qt-kod', kod); await m1.click('#qt-kodform button'); await m1.waitForTimeout(800);
await m1.click('[data-pid="1"]'); await m1.waitForTimeout(1300);
console.log('Martin:', (await m1.textContent('.qt')).replace(/\s+/g, ' ').trim().slice(0, 60));
// Gäst
await g1.goto(`http://localhost:8765/#/spela/${kod}`); await g1.waitForTimeout(900);
await g1.fill('#qt-gastnamn', 'Kalle'); await g1.click('#qt-gast button'); await g1.waitForTimeout(1300);
await tv.waitForTimeout(1300);
console.log('TV väntande:', (await tv.locator('.qp-v').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim()).join(' | '));
await tv.screenshot({ path: 'quizspel-tv-vantar.png' });
await tv.click('[data-ja]'); await tv.waitForTimeout(600); await tv.click('[data-ja]'); await tv.waitForTimeout(1500);
console.log('TV med:', (await tv.textContent('.qp-med')).replace(/\s+/g, ' ').trim(), '| Martin:', (await m1.textContent('.qt-mitt')).replace(/\s+/g, ' ').trim());
await m1.screenshot({ path: 'quizspel-tel-med.png' });
// Fråga 1: Martin rätt, gästen fel → tv:n går vidare när alla svarat
await tv.keyboard.press('Space'); await tv.waitForTimeout(1600);
console.log('TV fråga:', await tv.textContent('.qs-text'), '| Martin ser:', await m1.textContent('.qt-fraga'), '| rätt svar dolt för telefonen:', !JSON.stringify(rpcs.quiz_lage({ p_kod: kod, p_enhet: Object.keys(S.enhet)[0] })).includes('"ratt":0') );
await m1.screenshot({ path: 'quizspel-tel-fraga.png' }); await tv.screenshot({ path: 'quizspel-tv-fraga.png' });
const rattIdx = S.spel[0].fragor[0].ratt;
await m1.click(`.qt-alt [data-k="${rattIdx}"]`); await g1.click(`.qt-alt [data-k="${(rattIdx + 1) % 4}"]`);
await tv.waitForTimeout(2500); await m1.waitForTimeout(1200); await g1.waitForTimeout(500);
console.log('TV efter alla svarat:', S.spel[0].status, '| Martin:', (await m1.textContent('.qt-res')).replace(/\s+/g, ' ').trim(), '| Gäst:', (await g1.textContent('.qt-res')).replace(/\s+/g, ' ').trim());
await tv.screenshot({ path: 'quizspel-tv-svar.png' }); await m1.screenshot({ path: 'quizspel-tel-svar.png' });
// Fråga 2: bara Martin svarar (gästen låter bli), admin trycker Visa svar, sedan slutresultat
await tv.click('#qp-fram'); await tv.waitForTimeout(1500);
await m1.click(`.qt-alt [data-k="${S.spel[0].fragor[1].ratt}"]`); await tv.waitForTimeout(1300);
await tv.click('#qp-fram'); await tv.waitForTimeout(1300); await tv.click('#qp-fram'); await tv.waitForTimeout(1500);
console.log('TV slut:', (await tv.textContent('.qs-start')).replace(/\s+/g, ' ').trim().slice(0, 120));
await m1.waitForTimeout(1200); console.log('Martin slut:', (await m1.textContent('.qt-mitt')).replace(/\s+/g, ' ').trim());
await tv.screenshot({ path: 'quizspel-tv-slut.png' });
// Samma telefon nästa gång: går med direkt (betrodd), ingen väntan
S.spel.push({ id: 2, namn: 'Omgång 2', kod: '222333', status: 'lobby', fraga_nr: -1, tid_s: 20, fragor: S.spel[0].fragor });
await m1.goto('http://localhost:8765/#/spela/222333'); await m1.waitForTimeout(1500);
console.log('Martin omgång 2 (betrodd):', (await m1.textContent('.qt-mitt')).replace(/\s+/g, ' ').trim());
// Någon annan telefon som väljer Martin måste vänta på godkännande
const fusk = await ny('fusk', 390); await fusk.goto('http://localhost:8765/#/spela/222333'); await fusk.waitForTimeout(900); await fusk.click('[data-pid="1"]'); await fusk.waitForTimeout(1300);
console.log('Annan telefon som Martin:', (await fusk.textContent('.qt-mitt')).replace(/\s+/g, ' ').trim());
S.spel[1].status = 'slut';
// Statistik
await tv.goto('http://localhost:8765/#/alltime/quiz'); await tv.waitForTimeout(1200);
console.log('All-time quiz:', (await tv.locator('table tbody tr').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim()).join(' | '), '| omgångar:', await tv.locator('.rounds .round').count());
await tv.screenshot({ path: 'quizspel-alltime.png', fullPage: true });
await tv.goto('http://localhost:8765/#/admin/quiz'); await tv.waitForTimeout(1200);
console.log('Admin gäster:', (await tv.locator('[data-gast]').count()), '| omgångar:', await tv.locator('a[href^="#/quizspel/"]').count());
await b.close();
