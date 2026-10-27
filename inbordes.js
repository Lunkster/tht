// Inbördes möten (F-39): vem fick flest poäng när två spelare spelade samma deltävling.
// Ett möte = en deltävling där båda har en hel runda. Lika poäng = oavgjort. Beräknas i vyerna
// v_inbordes och v_inbordes_summa (migrering 20). Tre vyer i appen: rutan på spelarsidan,
// matrisen i All-time (#/alltime/inbordes) och duellsidan (#/duell/<a>/<b>).
import { api, allaRader, esc, fmt, nuNav, aktuell } from './lib.js?v=0.35.2';

const RAD = 'person_id,fornamn,mot_id,mot_fornamn,moten,vinster,oavgjort,forluster,vinster_slag,oavgjort_slag,forluster_slag,poang_diff,senast';
const lage = { satt: 'poang', alla: false };            // Poäng/Slag och Alla spelare, delas mellan vyerna
const vof = (x, satt = lage.satt) => (satt === 'slag'
  ? { v: x.vinster_slag, o: x.oavgjort_slag, f: x.forluster_slag }
  : { v: x.vinster, o: x.oavgjort, f: x.forluster });
const andel = ({ v, o, f }) => (v + o + f ? (v + o / 2) / (v + o + f) : null);
const pct = (a) => (a == null ? '–' : `${Math.round(a * 100)}\u00a0%`);
// Guld när man leder, rost när man ligger under – starkare ju större skillnad
const ton = (a) => {
  if (a == null || Math.abs(a - 0.5) < 0.005) return '';
  const s = Math.min(1, Math.abs(a - 0.5) * 2.5);
  return a > 0.5 ? ` style="background: rgba(227, 194, 120, ${(0.10 + 0.45 * s).toFixed(2)})"` : ` style="background: rgba(217, 89, 38, ${(0.10 + 0.40 * s).toFixed(2)})"`;
};
const segKnappar = () => `<div class="seg ib-seg" role="group" aria-label="Räkna på"><button type="button" data-satt="poang" class="${lage.satt === 'poang' ? 'on' : ''}">Poäng</button><button type="button" data-satt="slag" class="${lage.satt === 'slag' ? 'on' : ''}">Slag</button></div>`;
const kopplaSeg = (el, rita) => el.querySelectorAll('[data-satt]').forEach((b) => b.onclick = () => { lage.satt = b.dataset.satt; rita(); });
const forklaring = () => (lage.satt === 'slag'
  ? 'Ett möte = en deltävling där båda spelade en hel runda. Den med minst antal slag (tak par + 5) vinner, lika = oavgjort.'
  : 'Ett möte = en deltävling där båda spelade en hel runda. Den med flest poäng vinner, lika poäng = oavgjort.');

// ---------- Spelarsidan ----------
export async function inbordesSpelare(el, pid) {
  const rader = await api(`v_inbordes_summa?person_id=eq.${pid}&select=${RAD}`);
  if (!rader.length) { el.innerHTML = ''; return; }
  const rita = () => {
    const lista = rader.map((x) => ({ ...x, r: vof(x), a: andel(vof(x)) })).sort((a, b) => b.moten - a.moten || b.a - a.a);
    const total = lista.reduce((t, x) => ({ v: t.v + x.r.v, o: t.o + x.r.o, f: t.f + x.r.f }), { v: 0, o: 0, f: 0 });
    const manga = lista.filter((x) => x.moten >= 10);
    const bast = manga.slice().sort((a, b) => b.a - a.a)[0], svar = manga.slice().sort((a, b) => a.a - b.a)[0];
    el.innerHTML = `<h2>Inbördes möten</h2>
      ${segKnappar()}
      <p class="ib-summa">Totalt <strong>${total.v}–${total.o}–${total.f}</strong> <span class="muted">(vinster–oavgjort–förluster, ${pct(andel(total))})</span>${bast && svar && bast !== svar ? `<br><span class="muted">Bäst mot</span> ${esc(bast.mot_fornamn)} ${pct(bast.a)} · <span class="muted">tuffast mot</span> ${esc(svar.mot_fornamn)} ${pct(svar.a)}` : ''}</p>
      <div class="tablewrap"><table class="stat-tabell ib-tabell">
        <thead><tr><th class="l">Mot</th><th>Möten</th><th>V</th><th>O</th><th>F</th><th title="Vinster + halva oavgjorda, av alla möten">Andel</th><th class="hide-sm" title="Poäng mer (+) eller mindre (−) än motståndaren, sammanlagt">± poäng</th><th class="hide-sm">Senast</th></tr></thead>
        <tbody>${lista.map((x) => `<tr><td class="l"><a class="namn" href="#/duell/${pid}/${x.mot_id}">${esc(x.mot_fornamn)}</a></td><td>${x.moten}</td><td>${x.r.v}</td><td>${x.r.o}</td><td>${x.r.f}</td><td${ton(x.a)}><strong>${pct(x.a)}</strong></td><td class="hide-sm">${Number(x.poang_diff) > 0 ? '+' : ''}${fmt(Number(x.poang_diff))}</td><td class="hide-sm">${x.senast}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="hint">${forklaring()} Andel = vinster + halva oavgjorda. Tryck på ett namn för hela duellen.</p>`;
    kopplaSeg(el, rita);
  };
  rita();
}

// ---------- All-time: matris ----------
export async function inbordesMatris(el) {
  const rader = await api(`v_inbordes_summa?select=${RAD}`);
  const rita = () => {
    const per = {};
    rader.forEach((x) => {
      const p = (per[x.person_id] ??= { id: x.person_id, fornamn: x.fornamn, moten: 0, v: 0, o: 0, f: 0, mot: {} });
      const r = vof(x); p.moten += x.moten; p.v += r.v; p.o += r.o; p.f += r.f; p.mot[x.mot_id] = { ...r, n: x.moten };
    });
    let spelare = Object.values(per);
    const alla = spelare.length;
    if (!lage.alla) spelare = spelare.filter((p) => p.moten >= 30);
    spelare.forEach((p) => { p.a = andel(p); });
    spelare.sort((a, b) => b.a - a.a);
    // Kortnamn i rubriken: tre bokstäver, fler om två namn börjar lika (Marcus/Martin → Marc/Mart)
    const kort = (n) => { let k = 3; while (k < n.length && spelare.some((q) => q.fornamn !== n && q.fornamn.slice(0, k) === n.slice(0, k))) k++; return esc(n.slice(0, k)); };
    el.innerHTML = `${segKnappar()}
      <div class="tablewrap"><table class="stat-tabell ib-matris">
        <thead><tr><th class="l">Spelare</th>${spelare.map((p) => `<th title="Mot ${esc(p.fornamn)}"><span class="lang">${esc(p.fornamn)}</span><span class="kort">${kort(p.fornamn)}</span></th>`).join('')}<th title="Andel mot alla">Totalt</th></tr></thead>
        <tbody>${spelare.map((p) => `<tr><td class="l">${`<a class="namn" href="#/spelare/${p.id}">${esc(p.fornamn)}</a>`}</td>${spelare.map((q) => {
          if (q.id === p.id) return '<td class="ib-sjalv">·</td>';
          const m = p.mot[q.id];
          if (!m) return '<td class="dim">–</td>';
          return `<td${ton(andel(m))} title="${esc(p.fornamn)} mot ${esc(q.fornamn)}: ${m.v} vinster, ${m.o} oavgjorda, ${m.f} förluster"><a class="ib-cell" href="#/duell/${p.id}/${q.id}">${m.v}–${m.f}</a></td>`;
        }).join('')}<td${ton(p.a)}><strong>${pct(p.a)}</strong></td></tr>`).join('')}</tbody>
      </table></div>
      ${alla > spelare.length || lage.alla ? `<p><button type="button" class="btn ghost small" id="ib-alla">${lage.alla ? 'Bara spelare med minst 30 möten' : `Visa alla spelare (${alla})`}</button></p>` : ''}
      <p class="hint">Läs raden: vinster–förluster för spelaren till vänster mot spelaren i kolumnen (oavgjorda syns när du håller över eller trycker på rutan). Guld = leder duellen, rost = ligger under. Totalt = vinster + halva oavgjorda av alla möten. ${forklaring()} Tryck på en ruta för duellen.</p>`;
    kopplaSeg(el, rita);
    const b = el.querySelector('#ib-alla'); if (b) b.onclick = () => { lage.alla = !lage.alla; rita(); };
  };
  rita();
}

// ---------- Duellsida #/duell/<a>/<b> ----------
export async function renderDuell(a, b) {
  const app = document.getElementById('app');
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Laddar duell …</p>';
  const [personer, summa] = await Promise.all([
    api('person?select=id,fornamn&order=fornamn'),
    api(`v_inbordes_summa?select=person_id,mot_id,moten`),
  ]);
  const namn = Object.fromEntries(personer.map((p) => [p.id, p.fornamn]));
  const medMoten = new Set(summa.map((x) => x.person_id));
  // Saknas motståndare: ta den man mött flest gånger
  if (!b || !namn[b]) b = summa.filter((x) => x.person_id === a).sort((x, y) => y.moten - x.moten)[0]?.mot_id;
  if (!namn[a] || !b) { app.innerHTML = '<p class="err">Hittar inga inbördes möten för spelaren.</p>'; return; }
  const [moten, delt, res, thts, score] = await Promise.all([
    api(`v_inbordes?person_id=eq.${a}&mot_id=eq.${b}&select=deltavling_id,tht_nr,artal,ordning,runda_id,mot_runda_id,poang,mot_poang,slag,mot_slag,res_poang,res_slag&order=artal,ordning`),
    api('deltavling?select=id,banversion(bana(namn))'),
    api(`v_tht_resultat?person_id=in.(${a},${b})&select=tht_nr,artal,person_id,placering`),
    api('tht?select=nr,artal,klar'),
    allaRader(`v_score?person_id=in.(${a},${b})&slag=not.is.null&select=deltavling_id,person_id,hal_nr,poang,slag_tak&order=deltavling_id,hal_nr,person_id`),
  ]);
  if (!aktuell(myNav)) return;
  const A = namn[a], B = namn[b];
  const bana = Object.fromEntries(delt.map((d) => [d.id, d.banversion?.bana?.namn ?? '']));
  const rk = lage.satt === 'slag' ? 'res_slag' : 'res_poang';
  const r = { v: 0, o: 0, f: 0 }; moten.forEach((m) => { r[m[rk] > 0 ? 'v' : m[rk] < 0 ? 'f' : 'o']++; });
  const n = moten.length;
  const snitt = (f) => (n ? moten.reduce((s, m) => s + Number(m[f]), 0) / n : null);
  // Största seger och längsta svit åt båda håll (räknat på poäng)
  const storst = (tecken) => moten.filter((m) => tecken * (m.poang - m.mot_poang) > 0).sort((x, y) => tecken * ((y.poang - y.mot_poang) - (x.poang - x.mot_poang)) || y.artal - x.artal)[0];
  const svit = (tecken) => { let b0 = 0, c = 0, slut = null; moten.forEach((m) => { if (Math.sign(m[rk]) === tecken) { c++; if (c > b0) { b0 = c; slut = m; } } else c = 0; }); return { n: b0, slut }; };
  const sA = storst(1), sB = storst(-1), svA = svit(1), svB = svit(-1);
  // THT-placering: vem kom före i avslutade THT där båda var med
  const klar = new Set(thts.filter((t) => t.klar).map((t) => t.nr));
  const plac = {}; res.forEach((x) => { if (klar.has(x.tht_nr)) (plac[x.tht_nr] ??= {})[x.person_id] = x.placering; });
  const thtM = Object.values(plac).filter((p) => p[a] != null && p[b] != null);
  const thtA = thtM.filter((p) => p[a] < p[b]).length, thtB = thtM.filter((p) => p[b] < p[a]).length;
  // Hål för hål i de gemensamma deltävlingarna (poäng)
  const gem = new Set(moten.map((m) => m.deltavling_id));
  const hal = {}; score.forEach((s) => { if (gem.has(s.deltavling_id)) (hal[`${s.deltavling_id}-${s.hal_nr}`] ??= {})[s.person_id] = s; });
  const hh = { v: 0, o: 0, f: 0 };
  Object.values(hal).forEach((h) => { if (!h[a] || !h[b]) return; const d = lage.satt === 'slag' ? h[b].slag_tak - h[a].slag_tak : h[a].poang - h[b].poang; hh[d > 0 ? 'v' : d < 0 ? 'f' : 'o']++; });
  const form = moten.slice(-10);
  const valj = (sel, ej) => personer.filter((p) => p.id === sel || (p.id !== ej && medMoten.has(p.id))).map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.fornamn)}</option>`).join('');
  const var_ = (m) => `${m.artal} R${m.ordning}`;
  const tile = (v, t, d) => `<div class="sp-tile"><div class="sp-v">${v}</div><div class="sp-t">${t}</div><div class="sp-d">${d}</div></div>`;

  app.innerHTML = `
    <a class="back" href="#/alltime/inbordes">‹ Inbördes möten</a>
    <h1>Duell</h1>
    <div class="duell-val">
      <select id="du-a" aria-label="Spelare">${valj(a, b)}</select>
      <button type="button" class="btn ghost small" id="du-byt" title="Byt plats" aria-label="Byt plats">⇄</button>
      <select id="du-b" aria-label="Motståndare">${valj(b, a)}</select>
    </div>
    ${segKnappar()}
    ${n ? `
    <div class="duell-score">
      <div class="du-namn"><a class="namn" href="#/spelare/${a}">${esc(A)}</a></div>
      <div class="du-siffror"><span class="${r.v > r.f ? 'leder' : ''}">${r.v}</span><span class="du-o">${r.o}</span><span class="${r.f > r.v ? 'leder' : ''}">${r.f}</span></div>
      <div class="du-namn"><a class="namn" href="#/spelare/${b}">${esc(B)}</a></div>
    </div>
    <p class="center muted du-under">vinster – oavgjort – vinster · ${n} möten ${moten[0].artal}–${moten[n - 1].artal}</p>
    <div class="du-form" aria-label="Senaste ${form.length} mötena">${form.map((m) => { const x = Math.sign(m[rk]); return `<a href="#/runda/${m.runda_id}" class="du-prick ${x > 0 ? 'v' : x < 0 ? 'f' : 'o'}" title="${var_(m)}: ${m.poang}–${m.mot_poang} p">${x > 0 ? esc(A[0]) : x < 0 ? esc(B[0]) : '='}</a>`; }).join('')}</div>
    <p class="center hint">Senaste ${form.length} mötena, äldst till vänster – bokstaven visar vem som vann.</p>

    <div class="chartcard"><div class="chartbox du-chart" id="du-graf"></div>
      <p class="hint">Ledningen i duellen möte för möte: över mittlinjen leder ${esc(A)}, under leder ${esc(B)}.</p></div>

    <div class="sp-nyckel">
      ${tile(`${fmt(snitt('poang'), 1)} – ${fmt(snitt('mot_poang'), 1)}`, 'Poäng i snitt', `${esc(A)} – ${esc(B)} per runda`)}
      ${tile(`${fmt(snitt('slag'), 1)} – ${fmt(snitt('mot_slag'), 1)}`, 'Slag i snitt', 'tak par + 5')}
      ${tile(`${thtA} – ${thtB}`, 'THT-placering', `kom före i ${thtM.length} avslutade THT`)}
      ${tile(`${hh.v} – ${hh.f}`, 'Hål för hål', `${hh.o} delade av ${hh.v + hh.o + hh.f} hål`)}
      ${tile(sA ? `+${sA.poang - sA.mot_poang}` : '–', `Största seger ${esc(A)}`, sA ? `<a href="#/runda/${sA.runda_id}">${var_(sA)} · ${sA.poang}–${sA.mot_poang}</a>` : '')}
      ${tile(sB ? `+${sB.mot_poang - sB.poang}` : '–', `Största seger ${esc(B)}`, sB ? `<a href="#/runda/${sB.mot_runda_id}">${var_(sB)} · ${sB.mot_poang}–${sB.poang}</a>` : '')}
      ${tile(svA.n || '–', `Längsta svit ${esc(A)}`, svA.slut ? `vinster i rad, t.o.m. ${var_(svA.slut)}` : '')}
      ${tile(svB.n || '–', `Längsta svit ${esc(B)}`, svB.slut ? `vinster i rad, t.o.m. ${var_(svB.slut)}` : '')}
    </div>

    <h2>Alla möten</h2>
    <div class="tablewrap"><table class="stat-tabell du-tabell">
      <thead><tr><th class="l">Runda</th><th class="l hide-sm">Bana</th><th>${esc(A)}</th><th>${esc(B)}</th><th class="hide-sm">Slag ${esc(A)}</th><th class="hide-sm">Slag ${esc(B)}</th><th class="l">Vann</th></tr></thead>
      <tbody>${moten.slice().reverse().map((m) => { const x = Math.sign(m[rk]); return `<tr>
        <td class="l"><a href="#/ar/${m.artal}">${m.artal}</a> <span class="muted">R${m.ordning}</span></td>
        <td class="l hide-sm bana-kort">${esc(bana[m.deltavling_id] ?? '')}</td>
        <td class="${x > 0 ? 'win' : ''}"><a class="namn" href="#/runda/${m.runda_id}">${m.poang}</a></td>
        <td class="${x < 0 ? 'win' : ''}"><a class="namn" href="#/runda/${m.mot_runda_id}">${m.mot_poang}</a></td>
        <td class="hide-sm">${m.slag}</td><td class="hide-sm">${m.mot_slag}</td>
        <td class="l">${x > 0 ? esc(A) : x < 0 ? esc(B) : '<span class="muted">Oavgjort</span>'}</td></tr>`; }).join('')}</tbody>
    </table></div>
    <p class="hint">${forklaring()} Nyast först. Poängen länkar till scorekortet.</p>`
    : `<p class="muted">${esc(A)} och ${esc(B)} har aldrig spelat en hel runda i samma deltävling.</p>`}`;

  const gaTill = (x, y) => { location.hash = `#/duell/${x}/${y}`; };
  document.getElementById('du-a').onchange = (e) => gaTill(e.target.value, b);
  document.getElementById('du-b').onchange = (e) => gaTill(a, e.target.value);
  document.getElementById('du-byt').onclick = () => gaTill(b, a);
  app.querySelectorAll('[data-satt]').forEach((k) => k.onclick = () => { lage.satt = k.dataset.satt; renderDuell(a, b); });
  if (n) {
    const rita = () => ritaLedning(moten.map((m) => Math.sign(m[rk])), moten, A, B);
    rita(); window.onresize = () => { if (document.getElementById('du-graf')) rita(); };
  }
}

// Ledningen (vinster − förluster) möte för möte som en trappa kring nollinjen
function ritaLedning(utfall, moten, A, B) {
  const box = document.getElementById('du-graf');
  const W = box.clientWidth, H = box.clientHeight, m = { l: 30, r: 10, t: 12, b: 22 };
  let s = 0; const v = [0, ...utfall.map((u) => (s += u))];
  const max = Math.max(2, ...v.map(Math.abs));
  const x = (i) => m.l + (i / (v.length - 1)) * (W - m.l - m.r);
  const y = (t) => m.t + (1 - (t + max) / (2 * max)) * (H - m.t - m.b);
  let d = `M${x(0)},${y(0)}`;
  for (let i = 1; i < v.length; i++) d += `H${x(i).toFixed(1)}V${y(v[i]).toFixed(1)}`;
  const C3 = '#8f8676';
  let etik = ''; let senast = -Infinity;
  moten.forEach((mm, i) => { if ((i === 0 || moten[i - 1].artal !== mm.artal) && x(i + 1) - senast > 40) { etik += `<text x="${x(i + 1)}" y="${H - 6}" fill="${C3}" font-size="11" text-anchor="middle">${mm.artal}</text>`; senast = x(i + 1); } });
  box.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="Ledningen i duellen">
    <rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${y(0) - m.t}" fill="rgba(227,194,120,0.06)"/>
    <rect x="${m.l}" y="${y(0)}" width="${W - m.l - m.r}" height="${H - m.b - y(0)}" fill="rgba(217,89,38,0.06)"/>
    <line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="rgba(242,232,213,0.3)"/>
    <text x="${m.l - 6}" y="${y(max)}" fill="${C3}" font-size="11" text-anchor="end" dominant-baseline="middle">+${max}</text>
    <text x="${m.l - 6}" y="${y(0)}" fill="${C3}" font-size="11" text-anchor="end" dominant-baseline="middle">0</text>
    <text x="${m.l - 6}" y="${y(-max)}" fill="${C3}" font-size="11" text-anchor="end" dominant-baseline="middle">+${max}</text>
    <text x="${m.l + 6}" y="${m.t + 12}" fill="#e3c278" font-size="11">${esc(A)} leder</text>
    <text x="${m.l + 6}" y="${H - m.b - 6}" fill="#e98a62" font-size="11">${esc(B)} leder</text>
    <path d="${d}" fill="none" stroke="#3987e5" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${x(v.length - 1)}" cy="${y(v.at(-1))}" r="4" fill="#3987e5" stroke="#1c1a17" stroke-width="2"/>
    ${etik}</svg>`;
}
