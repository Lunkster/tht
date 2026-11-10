// Spela quiz i telefonen (v0.39.0, migrering 30, punkt 41). Admin startar en omgång av en sparad quiz på tv:n
// (#/quizspel/<id>); alla går med i sin telefon (#/spela) och svarar där. Beslut Henrik 2026-11-10: spelare väljer
// sitt namn och admin godkänner första gången, sedan kommer telefonen ihåg dem; den personliga länken går med direkt;
// gäster skriver sitt namn och deras resultat sparas; bara admin startar.
// Telefonerna anropar bara databasfunktionerna quiz_* (som kontrollerar spelkod och telefonens hemliga nyckel);
// rätt svar och poäng räknas i databasen. Båda sidorna frågar efter läget varje sekund.
import { api, rpc, write, esc, fmt, isLoggedIn, arAdmin } from './lib.js?v=0.39.0';
import { visaLogin } from './mata.js?v=0.39.0';

const app = document.getElementById('app');
const BOKST = 'ABCD';
const LS = { enhet: 'tht-quiz-enhet', lank: 'tht-quiz-lank', vem: 'tht-quiz-vem', kod: 'tht-quiz-kod' };
const las = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const spara = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* privat läge */ } };
const blanda = (xs) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const APP_URL = 'lunkster.github.io/tht';

// Den personliga länken sparas i telefonen när den öppnas – då går man med i quizen direkt (reserv D)
export const sparaLank = (kod) => spara(LS.lank, kod);

// ---------- starta en omgång (admin) ----------
// Bara frågor med fel svar kan spelas; alternativen blandas en gång här och sparas i omgången.
export async function startaSpel(q, tid = 20) {
  const fragor = q.fragor.filter((f) => f.fel?.length).map((f) => {
    const alt = blanda([f.svar, ...f.fel.slice(0, 3)]);
    return { fraga: f.fraga, alt, ratt: alt.indexOf(f.svar), info: f.info || '' };
  });
  if (!fragor.length) throw new Error('Quizen har inga frågor med svarsalternativ');
  for (let forsok = 0; forsok < 5; forsok++) {
    const kod = String(Math.floor(100000 + Math.random() * 900000));
    try {
      const [s] = await write('POST', 'quiz_spel', { quiz_id: q.id, namn: q.namn, kod, tid_s: tid, fragor });
      return s;
    } catch (e) { if (e.code !== '23505') throw e; }   // koden upptagen – ny kod
  }
  throw new Error('Kunde inte skapa en spelkod');
}

const tecken = (n) => fmt(n);
const namnPa = (d) => d.person?.fornamn ?? `${d.gast_namn} (gäst)`;

// ---------- tv:n ----------
let tvTimer = null, tvTangent = null;
export async function renderQuizSpelTv(id) {
  if (!isLoggedIn() || !arAdmin()) return visaLogin('Quiz', () => renderQuizSpelTv(id));
  document.body.classList.add('storskarm');
  clearInterval(tvTimer);
  let senast = '', lokalStart = null, vantarPa = false;
  const helskarm = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {});

  const hamta = async () => {
    const [[s], delt] = await Promise.all([
      api(`quiz_spel?id=eq.${id}&select=*`, { fresh: true }),
      api(`quiz_deltagare?spel_id=eq.${id}&select=id,person_id,gast_namn,godkand,person(fornamn)&order=id`, { fresh: true }),
    ]);
    const ids = delt.filter((d) => d.godkand).map((d) => d.id);
    const svar = ids.length ? await api(`quiz_svar?deltagare_id=in.(${ids.join(',')})&select=deltagare_id,fraga_nr,svar,ratt,poang`, { fresh: true }) : [];
    return { s, delt, svar };
  };
  const styr = async (status, nr) => {
    vantarPa = true;
    try { await rpc_auth('quiz_styr', { p_spel_id: id, p_status: status, p_fraga_nr: nr }); if (status === 'fraga') lokalStart = Date.now(); }
    finally { vantarPa = false; }
    tick(true);
  };
  const stallning = (delt, svar) => delt.filter((d) => d.godkand).map((d) => {
    const mina = svar.filter((x) => x.deltagare_id === d.id);
    return { d, poang: mina.reduce((a, x) => a + x.poang, 0), ratt: mina.filter((x) => x.ratt).length };
  }).sort((a, b) => b.poang - a.poang);

  const rita = ({ s, delt, svar }) => {
    if (!s) { app.innerHTML = '<p class="err">Omgången finns inte.</p>'; return; }
    const godk = delt.filter((d) => d.godkand), vant = delt.filter((d) => !d.godkand);
    const antal = s.fragor.length, f = s.fragor[s.fraga_nr];
    const svarNu = svar.filter((x) => x.fraga_nr === s.fraga_nr);
    const topp = `<div class="qs-topp"><a href="#/admin/quiz${s.quiz_id ? '/' + s.quiz_id : ''}" class="qs-ut">✕ Avsluta</a><span>${esc(s.namn)}${s.fraga_nr >= 0 && s.status !== 'slut' ? ` · fråga ${s.fraga_nr + 1} av ${antal}` : ''}</span><button type="button" class="qs-hel" title="Helskärm (F)">⛶</button></div>`;
    const vantRuta = vant.length ? `<div class="qp-vant"><strong>Vill gå med:</strong> ${vant.map((d) => `<span class="qp-v">${esc(namnPa(d))} <button type="button" class="btn small primary" data-ja="${d.id}">Godkänn</button><button type="button" class="btn small" data-nej="${d.id}">Neka</button></span>`).join('')}</div>` : '';
    const lista = (rader, n = 99) => `<ol class="qp-stallning">${rader.slice(0, n).map((r, i) => `<li class="${i === 0 ? 'forst' : ''}"><span>${esc(namnPa(r.d))}</span><b>${tecken(r.poang)}</b><small>${r.ratt} rätt</small></li>`).join('')}</ol>`;
    let html = '';
    if (s.status === 'lobby') {
      html = `<div class="qs-start qp-lobby"><h1>${esc(s.namn)}</h1>
        <p class="qp-ga">Gå in på <strong>${APP_URL}</strong> → <strong>Spela quiz</strong> och skriv koden</p>
        <div class="qp-kod">${s.kod.slice(0, 3)} ${s.kod.slice(3)}</div>
        ${vantRuta}
        <p class="qp-med">${godk.length ? `Med: ${godk.map((d) => `<span class="chip">${esc(namnPa(d))}</span>`).join(' ')}` : 'Ingen har gått med än.'}</p>
        <div class="qs-val"><button type="button" class="btn primary" id="qp-fram" ${godk.length ? '' : 'disabled'}>Starta quizen ›</button></div>
        <p class="hint">${antal} frågor · ${s.tid_s} sekunder per fråga · mellanslag = nästa steg</p></div>`;
    } else if (s.status === 'fraga') {
      html = `<div class="qs-fraga"><div class="qs-nr">${s.fraga_nr + 1} / ${antal}</div>
        <h1 class="qs-text">${esc(f.fraga)}</h1>
        <ol class="qs-alt qp-alt">${f.alt.map((a, k) => `<li class="qa-${k}"><b>${BOKST[k]}</b> ${esc(a)}</li>`).join('')}</ol>
        <div class="qp-rad"><div class="qp-tid" id="qp-tid">–</div><div>${svarNu.length} av ${godk.length} har svarat</div></div>
        ${vantRuta}</div>
        <div class="qs-nav"><button type="button" class="btn primary" id="qp-fram">Visa svar ›</button></div>`;
    } else if (s.status === 'svar') {
      const per = f.alt.map((_, k) => svarNu.filter((x) => x.svar === k).length);
      html = `<div class="qs-fraga visat"><div class="qs-nr">${s.fraga_nr + 1} / ${antal}</div>
        <h1 class="qs-text">${esc(f.fraga)}</h1>
        <ol class="qs-alt qp-alt">${f.alt.map((a, k) => `<li class="qa-${k} ${k === f.ratt ? 'ratt' : 'fel'}"><b>${BOKST[k]}</b> ${esc(a)} <span class="qp-antal">${per[k]}</span></li>`).join('')}</ol>
        ${f.info ? `<p class="qs-info">${esc(f.info)}</p>` : ''}
        <h2 class="qp-h">Ställning</h2>${lista(stallning(delt, svar), 5)}${vantRuta}</div>
        <div class="qs-nav"><button type="button" class="btn primary" id="qp-fram">${s.fraga_nr + 1 < antal ? 'Nästa fråga ›' : 'Slutresultat ›'}</button></div>`;
    } else {
      const st = stallning(delt, svar);
      html = `<div class="qs-start"><h1>Slutresultat</h1><p>${esc(s.namn)} · ${antal} frågor</p>
        ${st.length ? `<p class="qp-vinnare">🏆 ${esc(namnPa(st[0].d))}</p>` : ''}${lista(st)}
        <div class="qs-val"><a class="btn" href="#/admin/quiz${s.quiz_id ? '/' + s.quiz_id : ''}">Tillbaka</a></div></div>`;
    }
    app.innerHTML = topp + html;
    app.querySelector('.qs-hel').onclick = helskarm;
    app.querySelectorAll('[data-ja],[data-nej]').forEach((b) => b.onclick = async () => {
      b.disabled = true; await rpc_auth('quiz_godkann', { p_deltagare_id: Number(b.dataset.ja ?? b.dataset.nej), p_ja: b.dataset.ja != null }).catch((e) => alertRad(e)); tick(true);
    });
    const fram = document.getElementById('qp-fram'); if (fram) fram.onclick = () => framSteg(s);
  };
  const framSteg = (s) => {
    if (vantarPa) return;
    if (s.status === 'lobby') styr('fraga', 0);
    else if (s.status === 'fraga') styr('svar', s.fraga_nr);
    else if (s.status === 'svar') (s.fraga_nr + 1 < s.fragor.length ? styr('fraga', s.fraga_nr + 1) : styr('slut', s.fraga_nr));
  };
  let data = null;
  const tick = async (tvinga = false) => {
    if (!document.body.classList.contains('storskarm') || !location.hash.startsWith(`#/quizspel/${id}`)) { clearInterval(tvTimer); return; }
    try { data = await hamta(); } catch (e) { console.warn('Quiz:', e); return; }
    const { s, delt, svar } = data;
    const sig = JSON.stringify([s?.status, s?.fraga_nr, delt.map((d) => [d.id, d.godkand]), svar.length]);
    if (tvinga || sig !== senast) { senast = sig; rita(data); }
    if (s?.status === 'fraga') {
      // Nedräkning: från när tv:n startade frågan (eller databasens tid efter en omladdning)
      const start = lokalStart ?? Date.parse(s.fraga_start);
      const kvar = Math.max(0, Math.ceil((start + s.tid_s * 1000 - Date.now()) / 1000));
      const el = document.getElementById('qp-tid'); if (el) el.textContent = kvar;
      const godk = delt.filter((d) => d.godkand).length, svarat = svar.filter((x) => x.fraga_nr === s.fraga_nr).length;
      if (!vantarPa && (kvar === 0 || (godk && svarat >= godk))) styr('svar', s.fraga_nr);   // tiden ute eller alla har svarat
    }
  };
  if (tvTangent) document.removeEventListener('keydown', tvTangent);
  tvTangent = (e) => {
    if (!location.hash.startsWith('#/quizspel/')) { document.removeEventListener('keydown', tvTangent); tvTangent = null; return; }
    if (e.key === 'f' || e.key === 'F') helskarm();
    if ((e.key === ' ' || e.key === 'ArrowRight') && !e.target.closest?.('button, a, input') && data?.s) { e.preventDefault(); framSteg(data.s); }
  };
  document.addEventListener('keydown', tvTangent);
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  await tick(true);
  tvTimer = setInterval(tick, 1000);
}
const alertRad = (e) => { const p = document.createElement('p'); p.className = 'err'; p.textContent = e.message; app.prepend(p); };

// rpc som inloggad admin (quiz_styr, quiz_godkann kontrollerar ar_admin())
async function rpc_auth(namn, args) {
  const r = await write('POST', `rpc/${namn}`, args, 'return=minimal');
  return r;
}

// ---------- telefonen ----------
let telTimer = null;
export async function renderSpela(kodIn) {
  clearInterval(telTimer);
  let kod = (kodIn || '').replace(/\D/g, '') || null;
  const visaKod = (fel = '') => {
    app.innerHTML = `<div class="qt"><h1>Spela quiz</h1>
      <form class="card form" id="qt-kodform"><label>Spelkoden på tv:n<input type="text" inputmode="numeric" autocomplete="off" maxlength="7" id="qt-kod" placeholder="123 456" value="${esc(las(LS.kod) ?? '')}" autofocus></label>
      <button class="btn primary" type="submit">Gå med ›</button>${fel ? `<p class="err">${esc(fel)}</p>` : ''}</form></div>`;
    document.getElementById('qt-kodform').onsubmit = (e) => { e.preventDefault(); const k = document.getElementById('qt-kod').value.replace(/\D/g, ''); if (k.length === 6) location.hash = `#/spela/${k}`; };
  };
  if (!kod || kod.length !== 6) return visaKod();
  spara(LS.kod, kod);

  const gaMed = async ({ person = null, gast = null, lank = null }) => {
    const r = await rpc('quiz_ga_med', { p_kod: kod, p_enhet: las(LS.enhet), p_person_id: person, p_gast_namn: gast, p_lank: lank });
    spara(LS.enhet, r.enhet);
    spara(LS.vem, JSON.stringify(person ? { person } : lank ? { lank: true } : { gast }));
    return r;
  };
  const valjNamn = async (fel = '') => {
    const spelare = await rpc('quiz_spelare', { p_kod: kod }).catch(() => null);
    if (!spelare) return visaKod('Ingen pågående quiz med den koden.');
    app.innerHTML = `<div class="qt"><h1>Vem är du?</h1>${fel ? `<p class="err">${esc(fel)}</p>` : ''}
      <div class="qt-namn">${spelare.map((p) => `<button type="button" class="btn" data-pid="${p.id}">${esc(p.fornamn)}</button>`).join('')}</div>
      <form class="card form" id="qt-gast"><label>Inte med i listan? Spela som gäst<input type="text" id="qt-gastnamn" maxlength="30" placeholder="Ditt namn"></label><button class="btn" type="submit">Gå med som gäst ›</button></form>
      <p class="hint">Första gången godkänner värden att det är du – sedan kommer telefonen ihåg dig.</p></div>`;
    const kor = async (arg) => { try { await gaMed(arg); folj(); } catch (e) { valjNamn(e.message); } };
    app.querySelectorAll('[data-pid]').forEach((b) => b.onclick = () => kor({ person: Number(b.dataset.pid) }));
    document.getElementById('qt-gast').onsubmit = (e) => { e.preventDefault(); const n = document.getElementById('qt-gastnamn').value.trim(); if (n) kor({ gast: n }); };
  };

  // Försök gå med direkt: personliga länken, eller telefonen som redan är godkänd för samma person/gäst
  app.innerHTML = '<p class="muted center">Ansluter …</p>';
  let vem = null; try { vem = JSON.parse(las(LS.vem) || 'null'); } catch { /* inget */ }
  try {
    if (las(LS.lank)) await gaMed({ lank: las(LS.lank) });
    else if (vem?.person || vem?.gast) await gaMed(vem);
    else return valjNamn();
  } catch (e) { if (/länken/.test(e.message)) spara(LS.lank, null); if (/koden/.test(e.message)) return visaKod(e.message); return valjNamn(); }
  folj();

  function folj() {
    clearInterval(telTimer);
    let senast = '', skickar = false;
    const tick = async () => {
      if (!location.hash.startsWith(`#/spela/${kod}`)) { clearInterval(telTimer); return; }
      let l; try { l = await rpc('quiz_lage', { p_kod: kod, p_enhet: las(LS.enhet) }); } catch (e) { return; }
      const sig = JSON.stringify([l.status, l.fraga_nr, l.mitt_svar, l.totalt]);
      if (sig !== senast) { senast = sig; ritaTel(l); }
      const t = document.getElementById('qt-tid'); if (t && l.kvar_ms != null) t.textContent = Math.ceil(l.kvar_ms / 1000);
    };
    const ritaTel = (l) => {
      const huvud = `<div class="qt-huvud"><span>${esc(l.namn ?? '')}</span>${l.totalt != null ? `<span>${tecken(l.totalt)} p${l.placering ? ` · ${l.placering}:a av ${l.deltagare}` : ''}</span>` : ''}</div>`;
      if (l.status === 'saknas') { clearInterval(telTimer); return visaKod('Quizen finns inte längre.'); }
      if (l.status === 'ej_med') { clearInterval(telTimer); return valjNamn(); }
      if (l.status === 'vantar') { app.innerHTML = `<div class="qt">${huvud}<div class="qt-mitt"><h1>Väntar …</h1><p>Värden behöver godkänna dig på tv:n.</p></div><button type="button" class="link" id="qt-byt">Fel namn? Välj igen</button></div>`; document.getElementById('qt-byt').onclick = () => { spara(LS.vem, null); spara(LS.lank, null); valjNamn(); }; return; }
      if (l.status === 'lobby') { app.innerHTML = `<div class="qt">${huvud}<div class="qt-mitt"><h1>Du är med!</h1><p>Quizen börjar snart – titta på tv:n.</p></div></div>`; return; }
      if (l.status === 'fraga') {
        const svarat = l.mitt_svar != null;
        app.innerHTML = `<div class="qt">${huvud}<div class="qt-nr">Fråga ${l.fraga_nr + 1} av ${l.antal_fragor} · <span id="qt-tid">${Math.ceil((l.kvar_ms ?? 0) / 1000)}</span> s</div>
          <p class="qt-fraga">${esc(l.fraga)}</p>
          <div class="qt-alt">${(l.alt ?? []).map((a, k) => `<button type="button" class="qa-${k} ${svarat ? (k === l.mitt_svar ? 'valt' : 'dim') : ''}" data-k="${k}" ${svarat ? 'disabled' : ''}><b>${BOKST[k]}</b> ${esc(a)}</button>`).join('')}</div>
          ${svarat ? '<p class="qt-mitt">Svar skickat – vänta på de andra.</p>' : ''}</div>`;
        app.querySelectorAll('.qt-alt button:not([disabled])').forEach((b) => b.onclick = async () => {
          if (skickar) return; skickar = true;
          app.querySelectorAll('.qt-alt button').forEach((x) => { x.disabled = true; x.classList.toggle('valt', x === b); x.classList.toggle('dim', x !== b); });
          try { await rpc('quiz_svara', { p_kod: kod, p_enhet: las(LS.enhet), p_fraga_nr: l.fraga_nr, p_svar: Number(b.dataset.k) }); }
          catch (e) { app.querySelector('.qt').insertAdjacentHTML('beforeend', `<p class="err">${esc(e.message)}</p>`); }
          finally { skickar = false; senast = ''; tick(); }
        });
        return;
      }
      if (l.status === 'svar') {
        const ratt = l.mitt_svar != null && l.mitt_svar === l.ratt;
        app.innerHTML = `<div class="qt">${huvud}<div class="qt-mitt qt-res ${ratt ? 'ratt' : 'fel'}"><h1>${l.mitt_svar == null ? 'Inget svar' : ratt ? 'Rätt!' : 'Fel'}</h1>
          <p>${ratt ? `+${tecken(l.poang)} poäng` : `Rätt svar: <strong>${BOKST[l.ratt]} ${esc(l.alt?.[l.ratt] ?? '')}</strong>`}</p>
          <p class="qt-plac">${l.placering}:a plats av ${l.deltagare}</p></div></div>`;
        return;
      }
      app.innerHTML = `<div class="qt">${huvud}<div class="qt-mitt"><h1>Slut!</h1><p class="qt-plac">Du kom ${l.placering}:a av ${l.deltagare} med ${tecken(l.totalt)} poäng.</p><a class="btn" href="#/">Till startsidan</a></div></div>`;
      clearInterval(telTimer);
    };
    tick(); telTimer = setInterval(tick, 1000);
  }
}

// ---------- statistik: quizresultat ----------
export const hamtaQuizResultat = () => rpc('quiz_resultat', {}).catch(() => []);
// Per spelare (bara personer i databasen): omgångar, vinster, rätt svar i procent, snittpoäng, bästa placering
export function quizPerSpelare(rader) {
  const p = {};
  rader.filter((r) => r.person_id).forEach((r) => {
    const x = (p[r.person_id] ??= { id: r.person_id, fornamn: r.fornamn, spel: 0, vinster: 0, ratt: 0, fragor: 0, poang: 0, basta: null });
    x.spel++; if (r.placering === 1) x.vinster++; x.ratt += r.ratt; x.fragor += r.antal_fragor; x.poang += r.poang;
    x.basta = x.basta == null ? r.placering : Math.min(x.basta, r.placering);
  });
  return Object.values(p).map((x) => ({ ...x, andel: x.fragor ? (100 * x.ratt) / x.fragor : null, snitt: x.spel ? x.poang / x.spel : null }))
    .sort((a, b) => b.vinster - a.vinster || (b.andel ?? 0) - (a.andel ?? 0));
}
// Omgångarna med vinnare, nyast först
export function quizOmgangar(rader) {
  const o = {};
  rader.forEach((r) => { const x = (o[r.spel_id] ??= { id: r.spel_id, namn: r.namn, datum: r.datum, n: r.antal_deltagare, fragor: r.antal_fragor, vinnare: [] }); if (r.placering === 1) x.vinnare.push(r.fornamn ?? `${r.gast_namn} (gäst)`); });
  return Object.values(o).sort((a, b) => String(b.datum).localeCompare(String(a.datum)) || b.id - a.id);
}
