// Karusell (#/karusell eller #/karusell/<år>) – storskärmsläge för tv:n vid middagen (önskemål Henrik 2026-10-27).
// Bläddrar automatiskt mellan leaderboard, dagens deltävling, dagens höjdpunkter, minnesvärda moment och foton.
// Ingen inloggning behövs. Data hämtas på nytt varje minut; fotona blandas in mellan statistikbilderna.
import { api, esc, fmt, aktuell } from './lib.js?v=0.35.0';
import { hamtaFoton, fotoUrl } from './foto.js?v=0.35.0';
import { hamtaMinnen, vem } from './minnen.js?v=0.35.0';

const app = document.getElementById('app');
const TID_STAT = 15_000, TID_FOTO = 8_000, HAMTA = 60_000, FOTON_PER_STAT = 2;
const isoDag = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const tecken = (v) => (v == null ? '–' : v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '±0');
const blanda = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

let tangent = null, wakeLock = null;

export async function renderKarusell(navId, artal = null) {
  app.innerHTML = '<p class="muted center">Laddar karusellen …</p>';
  // Vilken THT: angivet år, annars den senaste med deltävlingar (som leaderboarden)
  let tht;
  if (artal) [tht] = await api(`tht?artal=eq.${artal}&nr=gt.0&select=nr,artal,ort,klar`, { fresh: true });
  else {
    const [senaste] = await api('deltavling?select=tht_nr&tht_nr=gt.0&order=tht_nr.desc&limit=1', { fresh: true });
    if (senaste) [tht] = await api(`tht?nr=eq.${senaste.tht_nr}&select=nr,artal,ort,klar`, { fresh: true });
  }
  if (!aktuell(navId)) return;
  if (!tht) { app.innerHTML = '<p class="muted center">Ingen THT att visa.</p>'; return; }
  document.body.classList.add('storskarm');

  let data = null, bilder = [], kö = [], visad = null, historik = [], paus = false, timer = null, senastHamtad = null;
  let statIdx = 0, fotoIdx = 0;

  const hamta = async () => {
    data = await hamtaData(tht);
    senastHamtad = new Date();
    bilder = byggStatBilder(tht, data);
    if (statIdx >= bilder.length) statIdx = 0;
  };

  // Nästa bild: en statistikbild, sedan några foton, sedan nästa statistikbild …
  const nasta = () => {
    if (!kö.length) {
      if (bilder.length) kö.push(bilder[statIdx++ % bilder.length]);
      const f = data.foton;
      for (let k = 0; k < Math.min(FOTON_PER_STAT, f.length); k++) kö.push(fotoBild(f[fotoIdx++ % f.length], data));
      if (!bilder.length && !f.length) kö.push({ typ: 'tom', html: `<div class="ka-tom"><h1>${esc(tht.ort)} ${tht.artal}</h1><p>Inga resultat eller foton ännu.</p></div>` });
    }
    return kö.shift();
  };

  const visa = (b) => {
    if (!aktuell(navId)) return stopp();
    visad = b;
    const tid = b.typ === 'foto' ? TID_FOTO : TID_STAT;
    app.innerHTML = `<div class="ka ${b.typ === 'foto' ? 'ka-fotolage' : ''}">
      <div class="ka-topp">
        <span class="ka-titel"><img src="logo.svg?v=0.35.0" alt="" class="ka-logo"> THT ${tht.nr} · ${esc(tht.ort)} ${tht.artal}</span>
        <span class="ka-hoger"><span class="ka-klocka">${new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}</span>
          <button type="button" class="ka-knapp" id="ka-paus" title="Paus (mellanslag)">${paus ? '▶' : '❚❚'}</button>
          <button type="button" class="ka-knapp" id="ka-hel" title="Helskärm (F)">⛶</button>
          <a class="ka-knapp" href="#/${artalSida()}" title="Avsluta">✕</a></span>
      </div>
      <div class="ka-bild ka-${b.typ}">${b.html}</div>
      <div class="ka-progress"><span style="animation-duration:${tid}ms;${paus ? 'animation-play-state:paused' : ''}"></span></div>
    </div>`;
    document.getElementById('ka-paus').onclick = vaxlaPaus;
    document.getElementById('ka-hel').onclick = helskarm;
    clearTimeout(timer);
    if (!paus) timer = setTimeout(fram, tid);
  };
  const artalSida = () => (artal ? `ar/${artal}` : 'leaderboard');
  const fram = async () => {
    if (!aktuell(navId)) return stopp();
    if (Date.now() - senastHamtad > HAMTA) await hamta().catch((e) => console.warn('Karusell:', e));
    if (visad) { historik.push(visad); if (historik.length > 30) historik.shift(); }
    visa(nasta());
  };
  const bak = () => { const b = historik.pop(); if (!b) return; if (visad) kö.unshift(visad); visa(b); };
  const vaxlaPaus = () => { paus = !paus; visa(visad); };
  const helskarm = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {});
  const stopp = () => {
    clearTimeout(timer);
    if (tangent) { document.removeEventListener('keydown', tangent); tangent = null; }
    wakeLock?.release?.().catch(() => {}); wakeLock = null;
  };

  if (tangent) document.removeEventListener('keydown', tangent);
  tangent = (e) => {
    if (!aktuell(navId) || !document.body.classList.contains('storskarm')) { stopp(); return; }
    if (e.key === ' ') { e.preventDefault(); vaxlaPaus(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); clearTimeout(timer); fram(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); clearTimeout(timer); bak(); }
    else if (e.key === 'f' || e.key === 'F') helskarm();
  };
  document.addEventListener('keydown', tangent);
  // Håll skärmen vaken (där webbläsaren stöder det)
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* inte tillåtet */ }

  await hamta();
  if (!aktuell(navId)) return stopp();
  visa(nasta());
}

// ---------- data ----------
async function hamtaData(tht) {
  const f = { fresh: true }, nr = tht.nr;
  const [res, rundor, delt, foton] = await Promise.all([
    api(`v_tht_resultat?tht_nr=eq.${nr}&order=placering`, f),
    api(`v_runda?tht_nr=eq.${nr}&select=runda_id,deltavling_id,person_id,fornamn,ordning,poang,slag,antal_hal,spel_hcp,placering`, f),
    api(`deltavling?tht_nr=eq.${nr}&order=ordning&select=id,ordning,namn,datum,narmast_hal,longest_hal,banversion(bana(namn))`, f),
    hamtaFoton(`tht_nr=eq.${nr}`, true).catch(() => []),
  ]);
  // Dagens deltävling: den som spelas i dag, annars den senaste med resultat (eller den första)
  const idag = isoDag(new Date());
  const medRes = delt.filter((d) => rundor.some((r) => r.deltavling_id === d.id && r.antal_hal > 0));
  const dag = delt.find((d) => d.datum === idag) ?? medRes[medRes.length - 1] ?? null;
  let score = [], pris = [], minnen = { kom: [], rundor: [] };
  if (dag) {
    [score, pris, minnen] = await Promise.all([
      api(`v_score?deltavling_id=eq.${dag.id}&slag=not.is.null&select=runda_id,person_id,hal_nr,par,slag,slag_tak,poang&order=hal_nr`, f),
      api(`pris?deltavling_id=eq.${dag.id}&select=typ,person(fornamn)`, f),
      hamtaMinnen([dag.id], f).catch(() => ({ kom: [], rundor: [] })),
    ]);
  }
  // Inga moment från dagen: visa THT:ns senaste
  if (!minnen.kom.length && delt.length) minnen = await hamtaMinnen(delt.map((d) => d.id), f).catch(() => minnen);
  // Fotona: dagens först (i ordning), sedan resten blandat
  const dagens = dag ? foton.filter((x) => x.deltavling_id === dag.id) : [];
  const ovriga = blanda(foton.filter((x) => !dagens.includes(x)));
  return { res, rundor, delt, dag, score, pris, minnen, foton: [...dagens, ...ovriga], idag };
}

// ---------- bilderna ----------
function byggStatBilder(tht, d) {
  const b = [];
  if (d.res.length) b.push({ typ: 'lb', html: leaderboard(tht, d) });
  if (d.dag) {
    const dr = dagensRunda(tht, d); if (dr) b.push({ typ: 'dag', html: dr });
    const h = hojdpunkter(d); if (h) b.push({ typ: 'hojd', html: h });
  }
  const m = minnesBild(d); if (m) b.push({ typ: 'minnen', html: m });
  return b;
}

function leaderboard(tht, d) {
  const ordningar = d.delt.map((x) => x.ordning);
  const per = {}; d.rundor.forEach((r) => { (per[r.person_id] ??= {})[r.ordning] = r; });
  const hal = (pid) => Object.values(per[pid] ?? {}).reduce((a, r) => a + (r.antal_hal ?? 0), 0);
  const ledare = d.res.filter((r) => r.placering === 1).map((r) => esc(r.fornamn)).join(' & ');
  return `<h1 class="ka-rubrik">${tht.klar ? 'Slutresultat' : 'Leaderboard'}</h1>
    ${tht.klar ? '' : `<p class="ka-under">Leder just nu: <strong>${ledare}</strong></p>`}
    <table class="ka-tabell">
      <thead><tr><th>#</th><th class="l">Spelare</th><th>Poäng</th><th>Mot HCP</th>${ordningar.map((o) => `<th class="ka-r">R${o}</th>`).join('')}</tr></thead>
      <tbody>${d.res.map((r) => { const h = hal(r.person_id), mh = h ? r.poang - 2 * h : null; return `<tr class="${r.placering === 1 ? 'ka-forst' : ''}">
        <td>${r.placering}</td><td class="l">${esc(r.fornamn)}</td><td><strong>${fmt(r.poang)}</strong></td><td class="${mh > 0 ? 'plus' : ''}">${tecken(mh)}</td>
        ${ordningar.map((o) => { const x = per[r.person_id]?.[o]; return `<td class="ka-r ${x ? '' : 'dim'}">${x && x.antal_hal ? fmt(x.poang) + (x.antal_hal < 18 ? `<small>/${x.antal_hal}</small>` : '') : '–'}</td>`; }).join('')}</tr>`; }).join('')}</tbody>
    </table>`;
}

const dagRubrik = (d) => `${d.dag.datum === d.idag ? 'Dagens runda' : 'Senaste rundan'} · R${d.dag.ordning}${d.dag.banversion?.bana?.namn ? ' · ' + esc(d.dag.banversion.bana.namn) : ''}`;

function dagensRunda(tht, d) {
  const rs = d.rundor.filter((r) => r.deltavling_id === d.dag.id && r.antal_hal > 0).sort((a, b) => a.placering - b.placering);
  if (!rs.length) return null;
  const forst = rs[0];
  const lagst = rs.filter((r) => r.antal_hal === 18).sort((a, b) => a.slag - b.slag)[0];
  const pris = (typ) => d.pris.find((p) => p.typ === typ)?.person?.fornamn;
  const ruta = (v, t, u) => `<div class="ka-ruta"><div class="ka-v">${v}</div><div class="ka-t">${t}</div><div class="ka-u">${u}</div></div>`;
  return `<h1 class="ka-rubrik">${dagRubrik(d)}</h1>
    <div class="ka-rutor">
      ${ruta(esc(forst.fornamn), tht.klar ? 'Vann rundan' : 'Leder rundan', `${fmt(forst.poang)} poäng${forst.antal_hal < 18 ? ` efter ${forst.antal_hal} hål` : ''}`)}
      ${ruta(lagst ? esc(lagst.fornamn) : '–', 'Lägsta score', lagst ? `${fmt(lagst.slag)} slag` : 'ingen hel runda än')}
      ${ruta(pris('narmast') ? esc(pris('narmast')) : '–', 'Närmast hål', d.dag.narmast_hal ? `hål ${d.dag.narmast_hal}` : '')}
      ${ruta(pris('longest') ? esc(pris('longest')) : '–', 'Longest drive', d.dag.longest_hal ? `hål ${d.dag.longest_hal}` : '')}
    </div>
    <ol class="ka-topp5">${rs.slice(0, 6).map((r) => `<li><span>${esc(r.fornamn)}</span><b>${fmt(r.poang)} p</b>${r.antal_hal < 18 ? `<small>${r.antal_hal} hål</small>` : ''}</li>`).join('')}</ol>`;
}

function hojdpunkter(d) {
  if (!d.score.length) return null;
  const namn = Object.fromEntries(d.rundor.map((r) => [r.runda_id, r.fornamn]));
  // Birdies och bättre
  const fina = d.score.filter((s) => s.slag - s.par <= -1).map((s) => ({ ...s, typ: s.slag === 1 ? 'Hole in one' : s.slag - s.par <= -2 ? 'Eagle' : 'Birdie' }));
  const perSpelare = {};
  fina.forEach((s) => (perSpelare[s.runda_id] ??= []).push(s));
  // Ensamma hålvinster (minst slag på hålet, ingen delad)
  const hv = {};
  [...new Set(d.score.map((s) => s.hal_nr))].forEach((n) => {
    const pa = d.score.filter((s) => s.hal_nr === n);
    if (pa.length < 2) return;
    const min = Math.min(...pa.map((s) => s.slag_tak));
    const v = pa.filter((s) => s.slag_tak === min);
    if (v.length === 1) hv[v[0].runda_id] = (hv[v[0].runda_id] ?? 0) + 1;
  });
  const hvLista = Object.entries(hv).sort((a, b) => b[1] - a[1]).slice(0, 3);
  // Flest poäng på ett hål
  const bast = d.score.slice().sort((a, b) => b.poang - a.poang)[0];
  const bastaHal = d.score.filter((s) => s.poang === bast.poang);
  const delar = [];
  if (fina.length) delar.push(`<div class="ka-kort"><h3>${fina.some((s) => s.typ !== 'Birdie') ? 'Birdies och bättre' : 'Birdies'} <span class="muted">(${fina.length})</span></h3>
    <ul>${Object.entries(perSpelare).sort((a, b) => b[1].length - a[1].length).map(([rid, ss]) => `<li><span>${esc(namn[rid])}</span> ${ss.map((s) => `<span class="ka-hal ${s.typ === 'Birdie' ? '' : 'ka-eagle'}" title="${s.typ}">${s.hal_nr}</span>`).join('')}</li>`).join('')}</ul></div>`);
  if (hvLista.length) delar.push(`<div class="ka-kort"><h3>Flest egna hålvinster</h3><ul>${hvLista.map(([rid, n]) => `<li><span>${esc(namn[rid])}</span> <b>${n}</b></li>`).join('')}</ul></div>`);
  if (bast && bast.poang >= 4) delar.push(`<div class="ka-kort"><h3>Flest poäng på ett hål</h3><ul>${bastaHal.slice(0, 4).map((s) => `<li><span>${esc(namn[s.runda_id])}</span> <b>${s.poang} p</b> <small>hål ${s.hal_nr} · ${s.slag} slag på par ${s.par}</small></li>`).join('')}</ul></div>`);
  if (!delar.length) return null;
  return `<h1 class="ka-rubrik">Höjdpunkter · R${d.dag.ordning}</h1><div class="ka-kortrad">${delar.join('')}</div>`;
}

function minnesBild(d) {
  const kom = d.minnen.kom.slice(-4).reverse();
  if (!kom.length) return null;
  const ord = Object.fromEntries(d.delt.map((x) => [x.id, x.ordning]));
  return `<h1 class="ka-rubrik">Minnesvärt</h1>
    <ul class="ka-minnen">${kom.map((k) => `<li><q>${esc(k.text)}</q><span>${esc(vem(k, d.minnen.rundor))} · R${ord[k.deltavling_id] ?? '?'}</span></li>`).join('')}</ul>`;
}

function fotoBild(f, d) {
  const dl = d.delt.find((x) => x.id === f.deltavling_id);
  const under = [f.text ? esc(f.text) : '', dl ? `R${dl.ordning}${dl.banversion?.bana?.namn ? ' · ' + esc(dl.banversion.bana.namn) : ''}` : '', f.person?.fornamn ? `foto ${esc(f.person.fornamn)}` : ''].filter(Boolean);
  return { typ: 'foto', html: `<img src="${fotoUrl(f)}" alt="${esc(f.text ?? '')}">${under.length ? `<div class="ka-bildtext">${under.join(' · ')}</div>` : ''}` };
}
