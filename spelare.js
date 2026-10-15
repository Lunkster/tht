// Personsida: en spelares nyckeltal, resultat per år, snittpoäng över tid och resultatfördelning.
import { api, allaRader, esc, fmt, nuNav, aktuell } from './lib.js?v=0.15.0';

const app = document.getElementById('app');
const BLA = '#3987e5';                       // seriefärg 1 (validerad mot mörk yta)
const CREAM = '#f2e8d5', CREAM3 = '#8f8676', GRID = 'rgba(242,232,213,0.08)';
const RESULTAT = ['hole in one', 'albatross', 'eagle', 'birdie', 'par', 'bogey', 'dubbelbogey', 'trippelbogey', 'kvadrupel+'];
const RES_NAMN = { 'hole in one': 'Hole in one', albatross: 'Albatross', eagle: 'Eagle', birdie: 'Birdie', par: 'Par', bogey: 'Bogey', dubbelbogey: 'Dubbelbogey', trippelbogey: 'Trippelbogey', 'kvadrupel+': 'Kvadrupel+' };
const mot = (v) => v === null ? '–' : v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '±0';

export async function renderSpelare(pid) {
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  const [[p], thts, res, rundor, priser, score, alla] = await Promise.all([
    api(`person?id=eq.${pid}&select=id,fornamn,efternamn,hcp,aktiv`),
    api('tht?select=nr,artal,ort,klar&order=artal'),
    api(`v_tht_resultat?person_id=eq.${pid}&select=tht_nr,artal,placering,poang,slag,puttar_per_hal,rundor`),
    api(`v_runda?person_id=eq.${pid}&select=tht_nr,artal,ordning,deltavling,poang,slag,antal_hal,puttar,hal_med_puttar,placering,spel_hcp&order=artal,ordning`),
    api(`pris?person_id=eq.${pid}&select=typ,deltavling(tht_nr,ordning)`),
    allaRader(`v_score?person_id=eq.${pid}&select=resultat,par,slag_tak,poang&order=runda_id,hal_nr`),
    api('person?select=id,fornamn&order=fornamn'),
  ]);
  if (!aktuell(myNav)) return;
  if (!p) { app.innerHTML = '<p class="err">Spelaren finns inte.</p>'; return; }

  const thtMap = Object.fromEntries(thts.map((t) => [t.nr, t]));
  const klar = (nr) => !!thtMap[nr]?.klar;
  const fulla = rundor.filter((r) => r.antal_hal > 0);
  const hela = fulla.filter((r) => r.antal_hal === 18);
  const sum = (xs, f) => xs.reduce((a, x) => a + (f(x) ?? 0), 0);
  const hal = sum(fulla, (r) => r.antal_hal);
  const puttN = sum(fulla, (r) => r.hal_med_puttar);
  const basta = fulla.slice().sort((a, b) => b.poang - a.poang)[0];
  const segrar = res.filter((r) => klar(r.tht_nr) && r.placering === 1);
  const nyckel = [
    { t: 'THT-segrar', v: segrar.length, d: segrar.map((r) => r.artal).join(', ') || '–' },
    { t: 'Pallplatser', v: res.filter((r) => klar(r.tht_nr) && r.placering <= 3).length, d: `av ${res.filter((r) => klar(r.tht_nr)).length} avslutade THT` },
    { t: 'Deltävlingssegrar', v: fulla.filter((r) => klar(r.tht_nr) && r.placering === 1).length, d: `av ${fulla.length} rundor` },
    { t: 'Poäng/runda', v: fmt(fulla.length ? sum(fulla, (r) => r.poang) / fulla.length : null, 1), d: `mot hcp ${mot(hal ? sum(fulla, (r) => r.poang) - 2 * hal : null)} totalt` },
    { t: 'Slag/runda', v: fmt(hela.length ? sum(hela, (r) => r.slag) / hela.length : null, 1), d: 'hela 18-hålsrundor, tak par + 5' },
    { t: 'Puttar/hål', v: fmt(puttN ? sum(fulla, (r) => r.puttar) / puttN : null, 2), d: `${puttN} hål med puttar` },
    { t: 'Bästa runda', v: basta ? `${basta.poang} p` : '–', d: basta ? `${basta.artal} R${basta.ordning}` : '' },
    { t: 'Närmast / longest', v: `${priser.filter((x) => x.typ === 'narmast').length} / ${priser.filter((x) => x.typ === 'longest').length}`, d: 'vunna priser' },
  ];

  // Resultat per år (nyaste först)
  const perAr = res.slice().sort((a, b) => b.artal - a.artal).map((r) => {
    const rs = fulla.filter((x) => x.tht_nr === r.tht_nr);
    const h = sum(rs, (x) => x.antal_hal);
    const senaste = rs.filter((x) => x.spel_hcp != null).sort((a, b) => b.ordning - a.ordning)[0];
    return { ...r, ort: thtMap[r.tht_nr]?.ort ?? '', klar: klar(r.tht_nr), rs, mot: h ? r.poang - 2 * h : null, hcp: senaste?.spel_hcp };
  });

  // Snitt poäng per runda per år, för diagrammet
  const serie = perAr.slice().reverse().filter((r) => r.rs.length).map((r) => ({ artal: r.artal, v: sum(r.rs, (x) => x.poang) / r.rs.length, placering: r.placering, klar: r.klar, ort: r.ort }));

  // Resultatfördelning och snitt per par-typ
  const fordelning = RESULTAT.map((k) => ({ k, n: score.filter((s) => s.resultat === k).length })).filter((x) => x.n || ['eagle', 'birdie', 'par', 'bogey', 'dubbelbogey', 'trippelbogey', 'kvadrupel+'].includes(x.k));
  const spelade = score.filter((s) => s.resultat);
  const parTyp = [3, 4, 5].map((par) => { const xs = spelade.filter((s) => s.par === par); return { par, n: xs.length, slag: xs.length ? sum(xs, (s) => s.slag_tak) / xs.length : null, poang: xs.length ? sum(xs, (s) => s.poang) / xs.length : null }; });

  const valj = alla.map((x) => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.fornamn)}</option>`).join('');
  app.innerHTML = `
    <div class="row-between sp-topp">
      <div><h1>${esc(p.fornamn)} <span class="dim">${esc(p.efternamn)}</span></h1>
      <p class="sub">${p.hcp != null ? `HCP ${fmt(Math.abs(p.hcp), 1)}${p.hcp < 0 ? ' (plus)' : ''} · ` : ''}${res.length} THT · ${fulla.length} rundor${p.aktiv ? '' : ' · vilande'}</p></div>
      <select id="bytspelare" aria-label="Byt spelare">${valj}</select>
    </div>

    <div class="sp-nyckel">${nyckel.map((n) => `<div class="sp-tile"><div class="sp-v">${n.v}</div><div class="sp-t">${n.t}</div><div class="sp-d">${esc(n.d)}</div></div>`).join('')}</div>

    <h2>Poäng per runda</h2>
    <div class="chartcard"><div class="chartbox sp-chart" id="sp-linje"><div class="tip" id="sp-tip" hidden></div></div>
      <p class="hint">Snitt per runda och år. Ring = vann THT:n. 36 p per runda = spelat på handicap.</p></div>

    <h2>År för år</h2>
    <div class="tablewrap"><table>
      <thead><tr><th class="l">År</th><th class="l hide-sm">Ort</th><th>Plac.</th><th>Poäng</th><th>Mot HCP</th><th class="hide-sm">Rundor</th><th class="hide-sm">Slag</th><th class="hide-sm">Puttar/hål</th><th class="hide-sm">Spel-HCP</th></tr></thead>
      <tbody>${perAr.map((r) => `<tr>
        <td class="l"><a href="#/ar/${r.artal}">${r.artal}</a></td>
        <td class="l hide-sm">${esc(r.ort)}</td>
        <td class="${r.klar && r.placering === 1 ? 'win' : ''}">${r.klar ? r.placering : `<span class="dim" title="Pågår">(${r.placering})</span>`}</td>
        <td><strong>${fmt(r.poang)}</strong></td>
        <td class="${r.mot > 0 ? 'plus' : ''}">${mot(r.mot)}</td>
        <td class="hide-sm">${r.rs.map((x) => fmt(x.poang)).join(' · ')}</td>
        <td class="hide-sm">${fmt(r.slag)}</td>
        <td class="hide-sm">${fmt(r.puttar_per_hal, 2)}</td>
        <td class="hide-sm">${fmt(r.hcp)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="hint">Placering inom parentes = THT:n pågår. Rundor = poäng i varje deltävling.</p>

    <h2>Resultat per hål</h2>
    <div class="chartcard"><div id="sp-staplar"></div>
      <p class="hint">${spelade.length} spelade hål. Slag räknas med tak par + 5.</p></div>
    <div class="tablewrap sp-partyp"><table>
      <thead><tr><th class="l">Hål</th><th>Antal</th><th>Slag i snitt</th><th>Poäng i snitt</th></tr></thead>
      <tbody>${parTyp.map((x) => `<tr><td class="l">Par ${x.par}</td><td>${x.n}</td><td>${fmt(x.slag, 2)}</td><td>${fmt(x.poang, 2)}</td></tr>`).join('')}</tbody>
    </table></div>`;

  document.getElementById('bytspelare').onchange = (e) => { location.hash = `#/spelare/${e.target.value}`; };
  ritaLinje(serie);
  ritaStaplar(fordelning, spelade.length);
  window.onresize = () => { if (document.getElementById('sp-linje')) { ritaLinje(serie); } };
}

function ritaLinje(serie) {
  const box = document.getElementById('sp-linje'), tip = document.getElementById('sp-tip');
  box.querySelector('svg')?.remove();
  if (!serie.length) { box.insertAdjacentHTML('afterbegin', '<p class="muted center">Inga rundor ännu.</p>'); return; }
  const W = box.clientWidth, H = box.clientHeight, m = { l: 34, r: 14, t: 14, b: 26 };
  const vs = serie.map((s) => s.v);
  let lo = Math.floor(Math.min(30, ...vs) / 2) * 2, hi = Math.ceil(Math.max(38, ...vs) / 2) * 2;
  const x = (i) => m.l + (serie.length === 1 ? (W - m.l - m.r) / 2 : (i / (serie.length - 1)) * (W - m.l - m.r));
  const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  const steg = hi - lo > 16 ? 4 : 2;
  let g = '';
  for (let v = lo; v <= hi; v += steg) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 36 ? 'rgba(242,232,213,0.25)' : GRID}"/><text x="${m.l - 6}" y="${y(v)}" fill="${CREAM3}" font-size="11" text-anchor="end" dominant-baseline="middle">${v}</text>`;
  const varje = Math.max(1, Math.ceil(serie.length / Math.floor((W - m.l - m.r) / 44)));
  serie.forEach((s, i) => { if (i % varje === 0 || i === serie.length - 1) g += `<text x="${x(i)}" y="${H - 8}" fill="${CREAM3}" font-size="11" text-anchor="middle">${s.artal}</text>`; });
  const d = serie.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.v).toFixed(1)}`).join('');
  const prickar = serie.map((s, i) => `<circle cx="${x(i)}" cy="${y(s.v)}" r="4" fill="${BLA}" stroke="#1c1a17" stroke-width="2"/>${s.klar && s.placering === 1 ? `<circle cx="${x(i)}" cy="${y(s.v)}" r="8" fill="none" stroke="#e3c278" stroke-width="2"/>` : ''}`).join('');
  box.insertAdjacentHTML('afterbegin', `<svg width="${W}" height="${H}" role="img" aria-label="Snittpoäng per runda och år">${g}<path d="${d}" fill="none" stroke="${BLA}" stroke-width="2" stroke-linejoin="round"/>${prickar}<line id="sp-kors" y1="${m.t}" y2="${H - m.b}" stroke="${CREAM3}" visibility="hidden"/></svg>`);
  const svg = box.querySelector('svg'), kors = svg.querySelector('#sp-kors');
  const flytta = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    const i = serie.length === 1 ? 0 : Math.max(0, Math.min(serie.length - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (serie.length - 1))));
    const s = serie[i];
    kors.setAttribute('x1', x(i)); kors.setAttribute('x2', x(i)); kors.setAttribute('visibility', 'visible');
    tip.innerHTML = `<div class="tt-title">${s.artal} · ${esc(s.ort)}</div><div class="tt-row on">Poäng/runda<b>${fmt(s.v, 1)}</b></div><div class="tt-row">Placering<b>${s.klar ? s.placering : '(' + s.placering + ')'}</b></div>`;
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.min(W - tw, Math.max(0, x(i) + (x(i) > W / 2 ? -tw - 12 : 12)))}px`; tip.style.top = `${m.t}px`;
  };
  svg.addEventListener('mousemove', flytta); svg.addEventListener('touchstart', flytta, { passive: true }); svg.addEventListener('touchmove', flytta, { passive: true });
  svg.addEventListener('mouseleave', () => { tip.hidden = true; kors.setAttribute('visibility', 'hidden'); });
}

function ritaStaplar(fordelning, totalt) {
  const max = Math.max(1, ...fordelning.map((f) => f.n));
  document.getElementById('sp-staplar').innerHTML = `<div class="sp-staplar">${fordelning.map((f) => `
    <div class="sp-rad" title="${RES_NAMN[f.k]}: ${f.n} hål (${totalt ? fmt(100 * f.n / totalt, 1) : 0} %)">
      <span class="sp-etikett">${RES_NAMN[f.k]}</span>
      <span class="sp-stapel"><span style="width:${(100 * f.n / max).toFixed(1)}%"></span></span>
      <span class="sp-antal">${f.n}<small>${totalt ? fmt(100 * f.n / totalt, 0) + ' %' : ''}</small></span>
    </div>`).join('')}</div>`;
}
