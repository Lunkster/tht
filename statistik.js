// Statistik från 2016-rapporten: hålvinster, resultatfördelning, par 3/4/5, rekord och svåraste hålen.
// Beräknas i databasvyerna v_stat_* (migrering 17) – här bara sammanställning och tabeller.
import { api, allaRader, esc, fmt } from './lib.js?v=0.23.1';

const namnLank = (id, namn) => `<a class="namn" href="#/spelare/${id}">${esc(namn)}</a>`;
const summa = (xs, f) => xs.reduce((a, x) => a + (Number(f(x)) || 0), 0);
// Guldton efter andel av kolumnens största värde (som färgkodningen i rapporten)
const ton = (v, max) => (v && max ? ` style="background: rgba(227, 194, 120, ${(0.08 + 0.42 * (v / max)).toFixed(2)})"` : '');

// Läge (antal/per runda osv.) per flik, sparas mellan omritningar
const lage = { fordelning: 'snitt', par: 'poang' };
const knappar = (id, val) => `<div class="seg stat-seg" role="group">${val.map(([k, t]) => `<button type="button" data-lage="${id}:${k}" class="${lage[id] === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;

// Summera per spelare över flera THT
function perSpelare(rader, falt) {
  const per = {};
  rader.forEach((r) => {
    const x = (per[r.person_id] ??= { id: r.person_id, fornamn: r.fornamn, tht: new Set() });
    x.tht.add(r.tht_nr);
    falt.forEach((f) => { x[f] = (x[f] ?? 0) + Number(r[f] ?? 0); });
  });
  return Object.values(per);
}

// ---------- Hålvinster ----------
export function halvinstTabell(rader, { visaTht = true } = {}) {
  const lista = perSpelare(rader, ['alla', 'ensamma']).sort((a, b) => b.alla - a.alla || b.ensamma - a.ensamma);
  if (!lista.length) return '<p class="muted">Inga hålresultat.</p>';
  const maxA = Math.max(...lista.map((x) => x.alla)), maxE = Math.max(...lista.map((x) => x.ensamma));
  return `<div class="tablewrap"><table class="stat-tabell">
    <thead><tr><th class="l">Spelare</th><th>Alla</th><th>Ensamma</th>${visaTht ? '<th class="hide-sm">THT</th>' : ''}</tr></thead>
    <tbody>${lista.map((x) => `<tr><td class="l">${namnLank(x.id, x.fornamn)}</td><td${ton(x.alla, maxA)}>${x.alla}</td><td${ton(x.ensamma, maxE)}><strong>${x.ensamma}</strong></td>${visaTht ? `<td class="hide-sm">${x.tht.size}</td>` : ''}</tr>`).join('')}</tbody>
  </table></div>`;
}

// ---------- Resultatfördelning ----------
const KAT = [['eagle', 'Eagle', 'Eag'], ['birdie', 'Birdie', 'Bir'], ['par', 'Par', 'Par'], ['bogey', 'Bogey', 'Bog'], ['dubbel', 'Dubbel', 'Dbl'], ['trippel', 'Trippel', 'Tri'], ['quad', 'Quad', 'Qua'], ['quint', 'Quint+', 'Q+']];
export function fordelningTabell(rader, satt = lage.fordelning) {
  const lista = perSpelare(rader, ['rundor', 'hal', ...KAT.map(([k]) => k)]);
  if (!lista.length) return '<p class="muted">Inga hålresultat.</p>';
  const v = (x, k) => (satt === 'snitt' ? (x.hal ? (x[k] / x.hal) * 18 : 0) : x[k]);
  lista.sort((a, b) => v(b, 'birdie') + v(b, 'par') - (v(a, 'birdie') + v(a, 'par')));
  const max = Object.fromEntries(KAT.map(([k]) => [k, Math.max(...lista.map((x) => v(x, k)))]));
  const d = satt === 'snitt' ? 2 : 0;
  return `<div class="tablewrap"><table class="stat-tabell fordelning">
    <thead><tr><th class="l">Spelare</th>${KAT.map(([, t, k]) => `<th title="${t}"><span class="lang">${t}</span><span class="kort">${k}</span></th>`).join('')}<th class="hide-sm">Rundor</th></tr></thead>
    <tbody>${lista.map((x) => `<tr><td class="l">${namnLank(x.id, x.fornamn)}</td>${KAT.map(([k]) => `<td${ton(v(x, k), max[k])}>${v(x, k) ? fmt(v(x, k), d) : '–'}</td>`).join('')}<td class="hide-sm">${fmt(x.hal / 18, 0)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

// ---------- Par 3/4/5 ----------
// Sortering i par-tabellerna: klick på en rubrik (delad mellan All-time och årssidan)
const parSort = { k: null, asc: false };   // k: null = snitt av par 3/4/5 (standard)
const parTabeller = new Map();             // tabell-id → { rader, satt }
let parNr = 0;
document.addEventListener('click', (e) => {
  const th = e.target.closest('th[data-ps]');
  if (!th) return;
  const wrap = th.closest('.tablewrap'), data = parTabeller.get(wrap?.dataset.par);
  if (!data) return;
  const k = th.dataset.ps;
  if (parSort.k === k) parSort.asc = !parSort.asc;
  else { parSort.k = k; parSort.asc = k === 'fornamn' || (k !== 'hal' && data.satt === 'slag'); }   // bäst först
  wrap.outerHTML = parTabell(data.rader, data.satt);
});

export function parTabell(rader, satt = lage.par) {
  const per = {};
  rader.forEach((r) => {
    const x = (per[r.person_id] ??= { id: r.person_id, fornamn: r.fornamn, hal: 0 });
    const p = (x[r.par] ??= { hal: 0, poang: 0, slag: 0 });
    p.hal += Number(r.hal); p.poang += Number(r.poang); p.slag += Number(r.slag); x.hal += Number(r.hal);
  });
  const lista = Object.values(per);
  if (!lista.length) return '<p class="muted">Inga hålresultat.</p>';
  const v = (x, par) => (x[par]?.hal ? x[par][satt] / x[par].hal : null);
  const basta = (par) => (satt === 'poang' ? Math.max : Math.min)(...lista.map((x) => v(x, par)).filter((y) => y != null));
  const snitt = (x) => { const h = [3, 4, 5].filter((p) => x[p]?.hal); return h.reduce((a, p) => a + v(x, p), 0) / (h.length || 1); };
  const varde = (x, k) => (k === 'fornamn' ? x.fornamn : k === 'hal' ? x.hal : v(x, Number(k)));
  if (parSort.k) {
    lista.sort((a, b) => {
      const va = varde(a, parSort.k), vb = varde(b, parSort.k);
      if (va == null) return 1; if (vb == null) return -1;   // saknade värden sist
      const c = typeof va === 'string' ? va.localeCompare(vb, 'sv') : va - vb;
      return parSort.asc ? c : -c;
    });
  } else lista.sort((a, b) => (satt === 'poang' ? snitt(b) - snitt(a) : snitt(a) - snitt(b)));
  const id = `par-${++parNr}`;
  parTabeller.set(id, { rader, satt });
  const KOL = [['fornamn', 'Spelare', 'l'], ['3', 'Par 3', ''], ['4', 'Par 4', ''], ['5', 'Par 5', ''], ['hal', 'Hål', 'hide-sm']];
  const th = ([k, t, c]) => `<th class="sortable ${c} ${parSort.k === k ? 'sorted' : ''}" data-ps="${k}" aria-sort="${parSort.k === k ? (parSort.asc ? 'ascending' : 'descending') : 'none'}">${t}${parSort.k === k ? (parSort.asc ? ' ▲' : ' ▼') : ''}</th>`;
  return `<div class="tablewrap" data-par="${id}"><table class="stat-tabell">
    <thead><tr>${KOL.map(th).join('')}</tr></thead>
    <tbody>${lista.map((x) => `<tr><td class="l">${namnLank(x.id, x.fornamn)}</td>${[3, 4, 5].map((p) => { const y = v(x, p); return `<td class="${y != null && y === basta(p) ? 'win' : ''}">${y == null ? '–' : fmt(y, 2)}</td>`; }).join('')}<td class="hide-sm">${x.hal}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

// ---------- Rekord ----------
async function rekordHtml() {
  const [rundor, extra, delt, res, thts, halPoang] = await Promise.all([
    allaRader('v_runda?select=runda_id,deltavling_id,person_id,fornamn,artal,ordning,poang,slag,antal_hal,puttar,hal_med_puttar&antal_hal=gt.0&order=runda_id'),
    allaRader('v_stat_runda?select=runda_id,birdies,basta_svit&order=runda_id'),
    api('deltavling?select=id,banversion(bana(namn))'),
    api('v_tht_resultat?select=artal,person_id,fornamn,placering,poang&placering=lte.2'),
    api('tht?select=artal,klar'),
    api('v_score?select=person_id,artal,ordning,deltavling_id,hal_nr,par,slag,poang&slag=not.is.null&order=poang.desc,artal.desc&limit=5'),
  ]);
  const bana = Object.fromEntries(delt.map((d) => [d.id, d.banversion?.bana?.namn ?? '']));
  const ext = Object.fromEntries(extra.map((e) => [e.runda_id, e]));
  const namn = Object.fromEntries(rundor.map((r) => [r.person_id, r.fornamn]));
  const hela = rundor.filter((r) => r.antal_hal === 18).map((r) => ({ ...r, ...ext[r.runda_id] }));
  const var_ = (r) => `${r.artal} R${r.ordning} · ${esc(bana[r.deltavling_id] ?? '')}`;
  const topp = (lista, f, stigande = false) => lista.filter((r) => f(r) != null).sort((a, b) => (stigande ? f(a) - f(b) : f(b) - f(a)) || b.artal - a.artal).slice(0, 5);
  const kort = (rubrik, beskr, rader, varde) => `
    <div class="card rekord"><h3>${rubrik}</h3><p class="hint">${beskr}</p>
      <ol>${rader.map((r) => `<li><span class="rek-v">${varde(r)}</span> ${namnLank(r.person_id, r.fornamn ?? namn[r.person_id] ?? '?')} <span class="muted">${var_(r)}</span></li>`).join('')}</ol></div>`;
  // Största segermarginal (bara avslutade THT)
  const klar = new Set(thts.filter((t) => t.klar).map((t) => t.artal));
  const marg = Object.values(res.reduce((acc, r) => { if (!klar.has(r.artal)) return acc; const a = (acc[r.artal] ??= { artal: r.artal }); if (r.placering === 1) Object.assign(a, { person_id: r.person_id, fornamn: r.fornamn, p1: Number(r.poang) }); else a.p2 = Math.max(a.p2 ?? 0, Number(r.poang)); return acc; }, {}))
    .filter((m) => m.p1 != null && m.p2 != null).map((m) => ({ ...m, marginal: m.p1 - m.p2 })).sort((a, b) => b.marginal - a.marginal || b.artal - a.artal).slice(0, 5);
  const puttRundor = hela.filter((r) => r.hal_med_puttar === 18);
  return `<div class="rekordgrid">
    ${kort('Bästa runda', 'Flest poäng på en hel runda', topp(hela, (r) => r.poang), (r) => `${r.poang} p`)}
    ${kort('Lägsta score', 'Minst antal slag på 18 hål (tak par + 5)', topp(hela, (r) => r.slag, true), (r) => `${r.slag} slag`)}
    ${kort('Flest birdies', 'Birdies eller bättre på en runda', topp(hela.filter((r) => r.birdies > 0), (r) => r.birdies), (r) => `${r.birdies} st`)}
    ${kort('Längsta svit', 'Flest hål i rad på par eller bättre', topp(hela.filter((r) => r.basta_svit > 0), (r) => r.basta_svit), (r) => `${r.basta_svit} hål`)}
    ${kort('Bästa puttrunda', 'Minst antal puttar på 18 hål', topp(puttRundor, (r) => r.puttar, true), (r) => `${r.puttar} puttar`)}
    ${kort('Flest poäng på ett hål', 'Poäng på ett enskilt hål', halPoang.map((h) => ({ ...h, fornamn: namn[h.person_id] })), (h) => `${h.poang} p <span class="muted">hål ${h.hal_nr}, par ${h.par}, ${h.slag} slag</span>`)}
    <div class="card rekord"><h3>Största segermarginal</h3><p class="hint">Poäng före tvåan i en THT</p>
      <ol>${marg.map((m) => `<li><span class="rek-v">+${m.marginal} p</span> ${namnLank(m.person_id, m.fornamn)} <span class="muted"><a href="#/ar/${m.artal}">${m.artal}</a></span></li>`).join('')}</ol></div>
    ${kort('Sämsta runda', 'Minst poäng på en hel runda – alla har dåliga dagar', topp(hela, (r) => r.poang, true), (r) => `${r.poang} p`)}
  </div>`;
}

// ---------- Svåraste hålen ----------
async function halHtml() {
  const rader = (await allaRader('v_stat_hal?select=bana_id,bana,hal_nr,par,spelade,over_par,poang&order=bana_id,hal_nr')).filter((h) => h.spelade >= 8);
  const tab = (lista) => `<div class="tablewrap"><table class="stat-tabell">
    <thead><tr><th class="l">Bana</th><th>Hål</th><th>Par</th><th title="Snitt slag över par">Över par</th><th class="hide-sm">Poäng</th><th class="hide-sm">Spelat</th></tr></thead>
    <tbody>${lista.map((h) => `<tr><td class="l"><a class="namn" href="#/bana/${h.bana_id}">${esc(h.bana)}</a></td><td>${h.hal_nr}</td><td>${h.par}</td><td><strong>${h.over_par > 0 ? '+' : ''}${fmt(h.over_par, 2)}</strong></td><td class="hide-sm">${fmt(h.poang, 2)}</td><td class="hide-sm">${h.spelade}</td></tr>`).join('')}</tbody>
  </table></div>`;
  const svar = rader.slice().sort((a, b) => b.over_par - a.over_par).slice(0, 10);
  const latt = rader.slice().sort((a, b) => a.over_par - b.over_par).slice(0, 10);
  return `<h2>Svåraste hålen</h2>${tab(svar)}
    <h2>Lättaste hålen</h2>${tab(latt)}
    <p class="hint">Snitt antal slag över par (tak par + 5) för alla som spelat hålet. Bara hål som spelats minst 8 gånger. Varje banas alla hål finns på bansidan.</p>`;
}

// ---------- Flikarna i All-time ----------
export const STAT_FLIKAR = [
  { id: 'halvinster', t: 'Hålvinster' },
  { id: 'fordelning', t: 'Fördelning' },
  { id: 'par', t: 'Par 3/4/5' },
  { id: 'rekord', t: 'Rekord' },
  { id: 'hal', t: 'Hål' },
];

export async function renderStatFlik(flik, el) {
  if (flik === 'halvinster') {
    const rader = await api('v_stat_halvinst?select=tht_nr,person_id,fornamn,alla,ensamma');
    el.innerHTML = `${halvinstTabell(rader)}
      <p class="hint">Den som gör minst antal slag på ett hål i en deltävling vinner hålet. <strong>Alla</strong> räknar även delade hålvinster (flera på samma antal slag), <strong>Ensamma</strong> bara dem man vunnit ensam. Poängen räknas inte – bara slagen.</p>`;
    return;
  }
  if (flik === 'fordelning') {
    const rader = await api('v_stat_fordelning?select=tht_nr,person_id,fornamn,rundor,hal,eagle,birdie,par,bogey,dubbel,trippel,quad,quint');
    const rita = () => {
      el.innerHTML = `${knappar('fordelning', [['snitt', 'Per runda'], ['antal', 'Antal']])}${fordelningTabell(rader)}
        <p class="hint">Resultat på varje hål räknat mot banans par. Quint+ = par + 5 eller mer (strukna hål). ${lage.fordelning === 'snitt' ? 'Snitt per 18 hål.' : 'Totalt antal hål.'} Ju guldigare, desto fler jämfört med de andra.</p>`;
      kopplaLage(el, rita);
    };
    rita();
    return;
  }
  if (flik === 'par') {
    const rader = await api('v_stat_par?select=tht_nr,person_id,fornamn,par,hal,poang,slag');
    const rita = () => {
      el.innerHTML = `${knappar('par', [['poang', 'Poäng'], ['slag', 'Slag']])}${parTabell(rader)}
        <p class="hint">Snitt ${lage.par === 'poang' ? 'poäng' : 'slag (tak par + 5)'} per hål på par 3-, par 4- och par 5-hål, alla år. Bäst i varje kolumn är markerad. Tryck på en rubrik för att sortera.</p>`;
      kopplaLage(el, rita);
    };
    rita();
    return;
  }
  if (flik === 'rekord') { el.innerHTML = await rekordHtml(); return; }
  if (flik === 'hal') { el.innerHTML = await halHtml(); }
}

function kopplaLage(el, rita) {
  el.querySelectorAll('[data-lage]').forEach((b) => b.onclick = () => { const [id, k] = b.dataset.lage.split(':'); lage[id] = k; rita(); });
}

// ---------- Årssidan: statistik för en THT ----------
export async function arsStatistik(el, thtNr) {
  const [hv, ford, par] = await Promise.all([
    api(`v_stat_halvinst?tht_nr=eq.${thtNr}&select=tht_nr,person_id,fornamn,alla,ensamma`),
    api(`v_stat_fordelning?tht_nr=eq.${thtNr}&select=tht_nr,person_id,fornamn,rundor,hal,eagle,birdie,par,bogey,dubbel,trippel,quad,quint`),
    api(`v_stat_par?tht_nr=eq.${thtNr}&select=tht_nr,person_id,fornamn,par,hal,poang,slag`),
  ]);
  if (!ford.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <h2>Statistik för året</h2>
    <details class="card stat-ar"><summary><strong>Hålvinster</strong> <span class="muted">– minst slag på hålet</span></summary>${halvinstTabell(hv, { visaTht: false })}</details>
    <details class="card stat-ar"><summary><strong>Resultatfördelning</strong> <span class="muted">– birdies, par, bogeys …</span></summary>${fordelningTabell(ford, 'antal')}</details>
    <details class="card stat-ar"><summary><strong>Par 3/4/5</strong> <span class="muted">– snittpoäng per hålpar</span></summary>${parTabell(par, 'poang')}</details>`;
}

// ---------- Bansidan: snitt per hål ----------
export async function halStatistik(banaId) {
  const rader = await api(`v_stat_hal?bana_id=eq.${banaId}&select=hal_nr,par,spelade,over_par,poang`);
  return Object.fromEntries(rader.map((h) => [`${h.hal_nr}-${h.par}`, h]));
}
