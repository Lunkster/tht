// Quiz och flashcards (admin, migrering 24): frågor skapas automatiskt ur databasen och kan kompletteras med egna.
// #/admin/quiz – lista och ny quiz · #/admin/quiz/<id> – redigera · #/quiz/<id> – visa på storskärm (quiz eller flashcards).
import { api, allaRader, write, esc, fmt, isLoggedIn, arAdmin } from './lib.js?v=0.35.0';
import { visaLogin } from './mata.js?v=0.35.0';
import { banTopplista } from './bana.js?v=0.35.0';

const app = document.getElementById('app');
export const AMNEN = [
  { id: 'vinnare', t: 'Vinnare', d: 'Vem vann THT, deltävlingar' },
  { id: 'platser', t: 'Banor och platser', d: 'Banor, orter, övernattningar' },
  { id: 'minnen', t: 'Minnen och krönikor', d: 'Minnesvärda moment, krönikor' },
  { id: 'statistik', t: 'Statistik och rekord', d: 'Flest rundor, birdies, hålvinster, priser, bästa runda' },
  { id: 'betyg', t: 'Banbetyg', d: 'Bästa och sämsta banan, mest spelad' },
];
const amnesNamn = Object.fromEntries(AMNEN.map((a) => [a.id, a.t]));

// ---------- slump ----------
const blanda = (xs) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const unika = (xs) => [...new Set(xs.filter((x) => x != null && String(x).trim() !== '').map(String))];
const felSvar = (ratt, pool, n = 3) => blanda(unika(pool).filter((x) => x !== String(ratt))).slice(0, n);
const citat = (t, max = 140) => { const s = String(t).replace(/\s+/g, ' ').trim(); return s.length > max ? s.slice(0, max).replace(/\s+\S*$/, '') + ' …' : s; };

// ---------- frågebanken: alla möjliga frågor ur databasen ----------
async function fragebank() {
  const [res, thts, delt, kom, tot, ford, hv, pris, rundor, over, betyg] = await Promise.all([
    api('v_tht_resultat?select=tht_nr,artal,person_id,fornamn,placering,poang'),
    api('tht?select=nr,artal,ort,klar,kronika&nr=gt.0&order=artal'),
    api('deltavling?select=id,tht_nr,ordning,banversion(bana(namn))&tht_nr=gt.0&order=tht_nr,ordning'),
    allaRader('kommentar?select=id,deltavling_id,text,fran_lank,runda(person(fornamn))&order=id'),
    api('v_stat_totalt?select=fornamn,rundor,poang,slag,meter,banor,tht'),
    api('v_stat_fordelning?select=fornamn,birdie,eagle,par'),
    api('v_stat_halvinst?select=fornamn,alla,ensamma'),
    api('pris?select=typ,deltavling(tht_nr),person(fornamn)'),
    api('v_runda?antal_hal=eq.18&select=fornamn,poang,artal,ordning&order=poang.desc&limit=8'),
    api('overnattning?select=tht_nr,platsnamn'),
    banTopplista().catch(() => []),
  ]);
  const F = [];
  const thtAv = Object.fromEntries(thts.map((t) => [t.nr, t]));
  const klar = new Set(thts.filter((t) => t.klar).map((t) => t.nr));
  const spelare = unika(res.map((r) => r.fornamn));
  const banNamn = (d) => d.banversion?.bana?.namn;
  const banor = unika(delt.map(banNamn));
  const ar = unika(thts.map((t) => t.artal));
  const orter = unika(thts.map((t) => t.ort));
  const fraga = (amne, f, svar, pool, info = '') => { if (svar == null || svar === '') return; F.push({ amne, fraga: f, svar: String(svar), fel: felSvar(svar, pool), info, egen: false }); };

  // Vinnare
  const vinnare = res.filter((r) => r.placering === 1 && klar.has(r.tht_nr));
  vinnare.forEach((v) => fraga('vinnare', `Vem vann THT ${v.artal} i ${thtAv[v.tht_nr]?.ort ?? ''}?`, v.fornamn, spelare, `${v.fornamn} vann på ${fmt(Number(v.poang))} poäng.`));
  const tvaor = res.filter((r) => r.placering === 2 && klar.has(r.tht_nr));
  tvaor.forEach((v) => fraga('vinnare', `Vem kom tvåa på THT ${v.artal}?`, v.fornamn, spelare, `${v.fornamn}, ${fmt(Number(v.poang))} poäng.`));

  // Banor och platser
  delt.forEach((d) => { const t = thtAv[d.tht_nr]; if (t && banNamn(d)) fraga('platser', `Vilken bana spelades i R${d.ordning} ${t.artal}?`, banNamn(d), banor, `${t.ort} ${t.artal}.`); });
  thts.forEach((t) => fraga('platser', `Var avgjordes THT ${t.artal}?`, t.ort, orter, `THT ${t.nr}.`));
  const platser = unika(over.map((o) => o.platsnamn));
  over.forEach((o) => { const t = thtAv[o.tht_nr]; if (t) fraga('platser', `Var bodde gänget under THT ${t.artal} (${t.ort})?`, o.platsnamn, platser); });

  // Minnen och krönikor
  const deltAv = Object.fromEntries(delt.map((d) => [d.id, d]));
  kom.filter((k) => k.text?.trim().length >= 8 && k.runda?.person?.fornamn).forEach((k) => {
    const d = deltAv[k.deltavling_id], t = d && thtAv[d.tht_nr];
    if (!t) return;
    const var_ = `${t.artal} R${d.ordning}`;
    if (k.fran_lank) fraga('minnen', `Vem skrev minnet ”${citat(k.text)}” (${var_})?`, k.runda.person.fornamn, spelare);
    else fraga('minnen', `Vem gäller minnet ”${citat(k.text)}” (${var_})?`, k.runda.person.fornamn, spelare, banNamn(d) ? `På ${banNamn(d)}.` : '');
  });
  thts.filter((t) => t.kronika?.trim().length > 40).forEach((t) => fraga('minnen', `Vilket år skrevs krönikan som börjar ”${citat(t.kronika, 160)}”?`, t.artal, ar, `${t.ort} ${t.artal}.`));

  // Statistik och rekord: flest X – felsvaren tas bland de närmast efter (svårare)
  const topp = (amne, f, lista, v, enhet) => {
    const s = lista.filter((x) => v(x) != null).sort((a, b) => v(b) - v(a));
    if (s.length < 2 || v(s[0]) === v(s[1])) return;   // delad etta – ingen fråga
    F.push({ amne, fraga: f, svar: s[0].fornamn, fel: blanda(s.slice(1, 6).map((x) => x.fornamn)).slice(0, 3), info: `${s[0].fornamn}: ${fmt(v(s[0]))} ${enhet}. Tvåa: ${s[1].fornamn} ${fmt(v(s[1]))}.`, egen: false });
  };
  const per = (rader, falt) => Object.values(rader.reduce((acc, r) => { const x = (acc[r.fornamn] ??= { fornamn: r.fornamn }); falt.forEach((f) => { x[f] = (x[f] ?? 0) + Number(r[f] ?? 0); }); return acc; }, {}));
  topp('statistik', 'Vem har spelat flest rundor på THT?', tot, (x) => Number(x.rundor), 'rundor');
  topp('statistik', 'Vem har samlat flest poäng totalt genom tiderna?', tot, (x) => Number(x.poang), 'poäng');
  topp('statistik', 'Vem har gått längst – flest kilometer golfhål på THT?', tot, (x) => Math.round(Number(x.meter) / 1000), 'km');
  topp('statistik', 'Vem har spelat flest olika banor på THT?', tot, (x) => Number(x.banor), 'banor');
  const f2 = per(ford, ['birdie', 'eagle', 'par']);
  topp('statistik', 'Vem har gjort flest birdies genom tiderna?', f2, (x) => x.birdie, 'birdies');
  topp('statistik', 'Vem har gjort flest par genom tiderna?', f2, (x) => x.par, 'par');
  const h2 = per(hv, ['alla', 'ensamma']);
  topp('statistik', 'Vem har vunnit flest hål (minst slag på hålet)?', h2, (x) => x.alla, 'hålvinster');
  topp('statistik', 'Vem har flest ensamma hålvinster?', h2, (x) => x.ensamma, 'ensamma hålvinster');
  const seg = per(vinnare.map((v) => ({ fornamn: v.fornamn, n: 1 })), ['n']);
  topp('statistik', 'Vem har vunnit flest THT?', seg, (x) => x.n, 'segrar');
  const pall = per(res.filter((r) => r.placering <= 3 && klar.has(r.tht_nr)).map((r) => ({ fornamn: r.fornamn, n: 1 })), ['n']);
  topp('statistik', 'Vem har flest pallplatser?', pall, (x) => x.n, 'pallplatser');
  ['narmast', 'longest'].forEach((typ) => {
    const p = per(pris.filter((x) => x.typ === typ && x.person).map((x) => ({ fornamn: x.person.fornamn, n: 1 })), ['n']);
    topp('statistik', typ === 'narmast' ? 'Vem har vunnit närmast hål flest gånger?' : 'Vem har vunnit longest drive flest gånger?', p, (x) => x.n, 'vinster');
  });
  if (rundor[0] && rundor[1] && rundor[0].poang !== rundor[1].poang) {
    const b = rundor[0];
    F.push({ amne: 'statistik', fraga: `Vem har THT:s bästa runda någonsin – ${b.poang} poäng?`, svar: b.fornamn, fel: felSvar(b.fornamn, rundor.slice(1).map((r) => r.fornamn).concat(spelare)), info: `${b.artal} R${b.ordning}.`, egen: false });
  }

  // Banbetyg
  if (betyg.length >= 2) {
    const b = betyg[0], s = betyg.at(-1);
    F.push({ amne: 'betyg', fraga: 'Vilken bana har högst snittbetyg av gänget?', svar: b.namn, fel: blanda(betyg.slice(1, 6).map((x) => x.namn)).slice(0, 3), info: `${fmt(b.snitt, 1)} av 5 (${b.n} betyg).`, egen: false });
    F.push({ amne: 'betyg', fraga: 'Vilken bana har lägst snittbetyg av gänget?', svar: s.namn, fel: blanda(betyg.slice(-6, -1).map((x) => x.namn)).slice(0, 3), info: `${fmt(s.snitt, 1)} av 5 (${s.n} betyg).`, egen: false });
  }
  const ggr = Object.values(delt.reduce((acc, d) => { const n = banNamn(d); if (n) (acc[n] ??= { fornamn: n, n: 0 }).n++; return acc; }, {}));
  topp('betyg', 'Vilken bana har THT spelat flest gånger?', ggr, (x) => x.n, 'gånger');
  return F;
}

export async function skapaFragor(amnen, antal, utom = []) {
  const ej = new Set(utom.map((f) => f.fraga));
  const bank = (await fragebank()).filter((f) => amnen.includes(f.amne) && !ej.has(f.fraga));
  // Jämnt mellan ämnena: ta en i taget från varje ämnes blandade lista
  const per = amnen.map((a) => blanda(bank.filter((f) => f.amne === a)));
  const ut = [];
  while (ut.length < antal && per.some((l) => l.length)) per.forEach((l) => { if (l.length && ut.length < antal) ut.push(l.shift()); });
  return blanda(ut);
}

// ---------- admin: lista och ny quiz ----------
export async function renderQuizAdmin([id] = []) {
  if (id) return renderQuizRedigera(Number(id));
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  const lista = await api('quiz?select=id,namn,fragor,andrad&order=andrad.desc', { fresh: true });
  app.innerHTML = `
    <a class="back" href="#/admin">‹ Admin</a>
    <h1>Quiz och flashcards</h1>
    <p class="sub">Frågor ur statistiken, resultaten, minnena och banbetygen. Visa dem på storskärm som quiz eller flashcards.</p>
    <div class="rounds">${lista.map((q) => `
      <div class="round quiz-rad"><div><div class="rn">${esc(q.namn)}</div><div class="meta">${q.fragor.length} frågor · ändrad ${String(q.andrad).slice(0, 10)}</div></div>
        <div class="quiz-knappar"><a class="btn small" href="#/admin/quiz/${q.id}">Redigera</a><a class="btn small primary" href="#/quiz/${q.id}">Visa</a></div></div>`).join('') || '<p class="muted">Inga sparade quiz ännu.</p>'}</div>
    <h2>Ny quiz</h2>
    <form class="card form quiz-form" id="nyquiz">
      <label>Namn<input type="text" name="namn" required maxlength="100" placeholder="t.ex. Middagsquiz 2027"></label>
      <fieldset class="quiz-amnen"><legend class="meta">Ämnen</legend>
        <label class="check quiz-blandat"><input type="checkbox" id="blandat" checked> <strong>Blandat</strong> <span class="dim small">frågor ur alla kategorier, huller om buller</span></label>
        ${AMNEN.map((a) => `<label class="check"><input type="checkbox" name="amne" value="${a.id}" checked> ${a.t} <span class="dim small">${a.d}</span></label>`).join('')}
      </fieldset>
      <label>Antal frågor<select name="antal">${[10, 15, 20, 25, 30, 40].map((n) => `<option ${n === 20 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <button class="btn primary" type="submit">Skapa quiz</button>
      <p class="hint" id="nymsg">Frågorna slumpas fram och kan sedan bytas, tas bort eller kompletteras med egna.</p>
    </form>`;
  const form = document.getElementById('nyquiz');
  // Blandat = alla ämnen ikryssade; ändras ett ämne följer Blandat med
  const blandat = document.getElementById('blandat'), amnesRutor = [...form.querySelectorAll('input[name=amne]')];
  blandat.onchange = () => amnesRutor.forEach((x) => { x.checked = blandat.checked; });
  amnesRutor.forEach((x) => x.onchange = () => { blandat.checked = amnesRutor.every((y) => y.checked); });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById('nymsg');
    const amnen = [...form.querySelectorAll('input[name=amne]:checked')].map((x) => x.value);
    if (!amnen.length) { msg.textContent = 'Välj minst ett ämne.'; return; }
    msg.textContent = 'Skapar frågor …';
    try {
      const fragor = await skapaFragor(amnen, Number(form.antal.value));
      const [q] = await write('POST', 'quiz', { namn: form.namn.value.trim(), fragor });
      location.hash = `#/admin/quiz/${q.id}`;
    } catch (err) { msg.textContent = `Kunde inte skapa: ${err.message}`; }
  };
}

// ---------- admin: redigera ----------
async function renderQuizRedigera(id) {
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  const [q] = await api(`quiz?id=eq.${id}&select=id,namn,fragor`, { fresh: true });
  if (!q) { app.innerHTML = '<p class="err">Quizen finns inte.</p>'; return; }
  let fragor = q.fragor;
  const spara = async (falt = {}) => {
    const st = document.getElementById('qstatus'); st.textContent = 'Sparar …';
    try { await write('PATCH', `quiz?id=eq.${id}`, { fragor, andrad: new Date().toISOString(), ...falt }, 'return=minimal'); st.textContent = 'Sparat ✓'; }
    catch (err) { st.textContent = `Kunde inte spara: ${err.message}`; }
  };
  const amnenI = () => unika(fragor.filter((f) => !f.egen).map((f) => f.amne)).concat().filter(Boolean);
  const rita = () => {
    app.innerHTML = `
      <a class="back" href="#/admin/quiz">‹ Alla quiz</a>
      <div class="row-between"><h1>Redigera quiz</h1><a class="btn primary" href="#/quiz/${id}">Visa på storskärm ›</a></div>
      <div class="card form quiz-form"><label>Namn<input type="text" id="qnamn" maxlength="100" value="${esc(q.namn)}"></label><p class="hint" id="qstatus" role="status"></p></div>
      <h2>${fragor.length} frågor</h2>
      <ol class="quiz-lista">${fragor.map((f, i) => `<li class="card">
        <div class="quiz-f"><span class="chip small">${f.egen ? 'Egen' : esc(amnesNamn[f.amne] ?? '')}</span> ${esc(f.fraga)}</div>
        <div class="quiz-s"><span class="ratt">✓ ${esc(f.svar)}</span>${(f.fel ?? []).map((x) => `<span class="fel">${esc(x)}</span>`).join('')}${f.fel?.length ? '' : '<span class="dim small">bara flashcard</span>'}</div>
        ${f.info ? `<div class="hint">${esc(f.info)}</div>` : ''}
        <div class="quiz-knappar">
          <button type="button" class="link" data-upp="${i}" ${i ? '' : 'disabled'}>↑</button><button type="button" class="link" data-ner="${i}" ${i < fragor.length - 1 ? '' : 'disabled'}>↓</button>
          ${f.egen ? '' : `<button type="button" class="link" data-byt="${i}">Byt fråga</button>`}
          <button type="button" class="link" data-bort="${i}">Ta bort</button></div>
      </li>`).join('')}</ol>
      <p><button type="button" class="btn" id="fler">+ 5 automatiska frågor</button> <span class="hint" id="flermsg"></span></p>
      <h2>Egen fråga</h2>
      <form class="card form quiz-form" id="egen">
        <label>Fråga<input type="text" name="fraga" required maxlength="300" placeholder="t.ex. Vem tappade bilnyckeln i sjön 2019?"></label>
        <label>Rätt svar<input type="text" name="svar" required maxlength="120"></label>
        <label>Fel svar <span class="dim small">(valfritt, 0–3 – utan fel svar blir det bara ett flashcard)</span>
          <input type="text" name="f1" maxlength="120"><input type="text" name="f2" maxlength="120"><input type="text" name="f3" maxlength="120"></label>
        <label>Förklaring <span class="dim small">(valfritt, visas efter svaret)</span><input type="text" name="info" maxlength="300"></label>
        <button class="btn primary" type="submit">Lägg till</button>
      </form>
      <h2>Ta bort</h2>
      <p><button type="button" class="btn fara" id="taBort">Ta bort quizen</button></p>`;
    document.getElementById('qnamn').onchange = (e) => { const n = e.target.value.trim(); if (n) { q.namn = n; spara({ namn: n }); } };
    app.querySelectorAll('[data-upp],[data-ner]').forEach((b) => b.onclick = () => {
      const i = Number(b.dataset.upp ?? b.dataset.ner), j = b.dataset.upp != null ? i - 1 : i + 1;
      [fragor[i], fragor[j]] = [fragor[j], fragor[i]]; rita(); spara();
    });
    app.querySelectorAll('[data-bort]').forEach((b) => b.onclick = () => { fragor.splice(Number(b.dataset.bort), 1); rita(); spara(); });
    app.querySelectorAll('[data-byt]').forEach((b) => b.onclick = async () => {
      const i = Number(b.dataset.byt); b.textContent = '…';
      const [ny] = await skapaFragor([fragor[i].amne], 1, fragor);
      if (ny) { fragor[i] = ny; rita(); spara(); } else b.textContent = 'Slut på frågor i ämnet';
    });
    document.getElementById('fler').onclick = async () => {
      const amnen = amnenI().length ? amnenI() : AMNEN.map((a) => a.id);
      const nya = await skapaFragor(amnen, 5, fragor);
      if (!nya.length) { document.getElementById('flermsg').textContent = 'Inga fler frågor att hämta.'; return; }
      fragor = fragor.concat(nya); rita(); spara();
    };
    document.getElementById('egen').onsubmit = (e) => {
      e.preventDefault(); const f = e.target;
      fragor.push({ amne: 'egen', egen: true, fraga: f.fraga.value.trim(), svar: f.svar.value.trim(), fel: unika([f.f1.value, f.f2.value, f.f3.value].map((x) => x.trim())).filter((x) => x !== f.svar.value.trim()), info: f.info.value.trim() });
      rita(); spara();
    };
    const tb = document.getElementById('taBort');
    tb.onclick = async () => {
      if (!tb.classList.contains('bekrafta')) { tb.classList.add('bekrafta'); tb.textContent = 'Säker? Ta bort för gott'; return; }
      await write('DELETE', `quiz?id=eq.${id}`, undefined, 'return=minimal'); location.hash = '#/admin/quiz';
    };
  };
  rita();
}

// ---------- storskärm: #/quiz/<id> ----------
let tangent = null;
export async function renderQuizVisa(id) {
  if (!isLoggedIn() || !arAdmin()) return visaLogin('Quiz', () => renderQuizVisa(id));
  const [q] = await api(`quiz?id=eq.${id}&select=id,namn,fragor`, { fresh: true });
  if (!q) { app.innerHTML = '<p class="err">Quizen finns inte.</p>'; return; }
  document.body.classList.add('storskarm');
  const fr = q.fragor.map((f) => ({ ...f, alt: f.fel?.length ? blanda([f.svar, ...f.fel]) : [] }));
  let lage = null, i = 0, visat = false;
  const BOKST = 'ABCD';
  const helskarm = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {});
  const topp = () => `<div class="qs-topp"><a href="#/admin/quiz/${id}" class="qs-ut">✕ Avsluta</a><span>${esc(q.namn)}</span><button type="button" class="qs-hel" title="Helskärm (F)">⛶</button></div>`;
  const rita = () => {
    if (!lage) {
      app.innerHTML = `${topp()}<div class="qs-start"><img src="logo.svg?v=0.35.0" alt="" class="qs-logo"><h1>${esc(q.namn)}</h1><p>${fr.length} frågor</p>
        <div class="qs-val"><button type="button" class="btn primary" data-lage="quiz">Quiz</button><button type="button" class="btn" data-lage="kort">Flashcards</button></div>
        <p class="hint">Mellanslag eller → = nästa steg · ← = tillbaka · F = helskärm</p></div>`;
    } else if (i >= fr.length) {
      app.innerHTML = `${topp()}<div class="qs-start"><h1>Slut!</h1><p>${fr.length} frågor</p><div class="qs-val"><button type="button" class="btn primary" id="igen">Börja om</button></div></div>`;
      document.getElementById('igen').onclick = () => { i = 0; visat = false; rita(); };
    } else {
      const f = fr[i];
      const kort = lage === 'kort' || !f.alt.length;
      app.innerHTML = `${topp()}<div class="qs-fraga ${visat ? 'visat' : ''}">
        <div class="qs-nr">${i + 1} / ${fr.length}${f.egen ? '' : ` · ${esc(amnesNamn[f.amne] ?? '')}`}</div>
        <h1 class="qs-text">${esc(f.fraga)}</h1>
        ${kort ? `<div class="qs-kort">${visat ? `<div class="qs-svar">${esc(f.svar)}</div>` : '<div class="dim">Tryck för svaret</div>'}</div>`
          : `<ol class="qs-alt">${f.alt.map((a, k) => `<li class="${visat ? (a === f.svar ? 'ratt' : 'fel') : ''}"><b>${BOKST[k]}</b> ${esc(a)}</li>`).join('')}</ol>`}
        ${visat && f.info ? `<p class="qs-info">${esc(f.info)}</p>` : ''}
      </div>
      <div class="qs-nav"><button type="button" class="btn" id="bak" ${i || visat ? '' : 'disabled'}>‹</button><button type="button" class="btn primary" id="fram">${visat ? (i + 1 < fr.length ? 'Nästa fråga ›' : 'Avsluta ›') : 'Visa svar'}</button></div>`;
      document.getElementById('fram').onclick = fram; document.getElementById('bak').onclick = bak;
      app.querySelector('.qs-kort')?.addEventListener('click', fram);
    }
    app.querySelector('.qs-hel').onclick = helskarm;
    app.querySelectorAll('[data-lage]').forEach((b) => b.onclick = () => { lage = b.dataset.lage; i = 0; visat = false; rita(); });
  };
  const fram = () => { if (!lage) return; if (i >= fr.length) return; if (!visat) visat = true; else { i++; visat = false; } rita(); };
  const bak = () => { if (!lage) return; if (visat) visat = false; else if (i > 0) { i--; visat = true; } rita(); };
  if (tangent) document.removeEventListener('keydown', tangent);
  tangent = (e) => {
    if (!document.body.classList.contains('storskarm')) { document.removeEventListener('keydown', tangent); tangent = null; return; }
    if ((e.key === ' ' || e.key === 'Enter') && e.target.closest?.('button, a, input')) return;   // knappen klickar själv
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); fram(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); bak(); }
    else if (e.key === 'f' || e.key === 'F') helskarm();
  };
  document.addEventListener('keydown', tangent);
  rita();
}
