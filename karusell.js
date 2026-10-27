// Karusell – storskärmsläge för tv:n vid middagen (önskemål Henrik 2026-10-27).
//   #/karusell        senaste THT:n med inmatade poäng (förra årets tills årets har börjat)
//   #/karusell/<år>   ett visst år
//   #/karusell/alla   totalblandning av alla år: slutresultat, rundor, krönikor, minnen och foton
// Varje bild säger tydligt THT, ort, år och – där det passar – runda och bana. Fotona blandas in mellan
// statistikbilderna. Ingen inloggning behövs. Data hämtas på nytt varje minut (alla år: var tionde minut).
import { api, allaRader, esc, fmt, aktuell } from './lib.js?v=0.35.3';
import { hamtaFoton, fotoUrl } from './foto.js?v=0.35.3';
import { vem } from './minnen.js?v=0.35.3';

const app = document.getElementById('app');
const TID_STAT = 15_000, TID_FOTO = 8_000, FOTON_PER_STAT = 2;
const HAMTA = 60_000, HAMTA_ALLA = 600_000;
const isoDag = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const tecken = (v) => (v == null ? '–' : v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '±0');
const blanda = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const banNamn = (dl) => dl?.banversion?.bana?.namn ?? null;
const thtText = (t) => `THT ${t.nr} · ${esc(t.ort ?? '')} ${t.artal}`;
const rundText = (dl) => (dl ? `R${dl.ordning}${banNamn(dl) ? ' · ' + esc(banNamn(dl)) : ''}` : '');
// Rad överst på varje bild: THT, ort och år – och runda, bana och datum när bilden gäller en runda
const kicker = (t, dl = null, extra = '') => `<div class="ka-kicker"><span class="ka-kicker-tht">${thtText(t)}</span>${dl ? `<span>${rundText(dl)}${dl.datum ? ' · ' + dl.datum : ''}</span>` : ''}${extra ? `<span>${extra}</span>` : ''}</div>`;

let tangent = null, wakeLock = null;

export async function renderKarusell(navId, arg = null) {
  app.innerHTML = '<p class="muted center">Laddar karusellen …</p>';
  const alla = arg === 'alla';
  const artal = alla ? null : (arg ? Number(arg) : null);
  let tht = null;
  if (!alla) {
    if (artal) [tht] = await api(`tht?artal=eq.${artal}&nr=gt.0&select=nr,artal,ort,klar,kronika`, { fresh: true });
    else {
      const [medPoang] = await api('v_runda?select=tht_nr&antal_hal=gt.0&order=tht_nr.desc&limit=1', { fresh: true });
      const [senaste] = medPoang ? [medPoang] : await api('deltavling?select=tht_nr&tht_nr=gt.0&order=tht_nr.desc&limit=1', { fresh: true });
      if (senaste) [tht] = await api(`tht?nr=eq.${senaste.tht_nr}&select=nr,artal,ort,klar,kronika`, { fresh: true });
    }
    if (!aktuell(navId)) return;
    if (!tht) { app.innerHTML = '<p class="muted center">Ingen THT att visa.</p>'; return; }
  }
  document.body.classList.add('storskarm');

  let kalla = null, kö = [], visad = null, historik = [], paus = false, timer = null, senastHamtad = 0, fotoIdx = 0;
  const hamta = async () => {
    kalla = alla ? await allaAr() : await ettAr(tht);
    senastHamtad = Date.now();
  };
  // Nästa bild: en statistikbild, sedan några foton, sedan nästa statistikbild …
  const nasta = () => {
    if (!kö.length) {
      const b = kalla.nastaStat();
      if (b) kö.push(b);
      const f = kalla.foton;
      for (let k = 0; k < Math.min(FOTON_PER_STAT, f.length); k++) kö.push(kalla.fotoBild(f[fotoIdx++ % f.length]));
      if (!kö.length) kö.push({ typ: 'tom', html: `<div class="ka-tom">${tht ? kicker(tht) : ''}<h1 class="ka-rubrik">Inga resultat eller foton ännu</h1></div>` });
    }
    return kö.shift();
  };

  const titel = alla ? 'The Helkväll Tour · alla år' : thtText(tht);
  const visa = (b) => {
    if (!aktuell(navId)) return stopp();
    visad = b;
    const tid = b.typ === 'foto' ? TID_FOTO : TID_STAT;
    app.innerHTML = `<div class="ka ${b.typ === 'foto' ? 'ka-fotolage' : ''}">
      <div class="ka-topp">
        <span class="ka-titel"><img src="logo.svg?v=0.35.3" alt="" class="ka-logo"> ${titel}</span>
        <span class="ka-hoger"><span class="ka-klocka">${new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}</span>
          <button type="button" class="ka-knapp" id="ka-paus" title="Paus (mellanslag)">${paus ? '▶' : '❚❚'}</button>
          <button type="button" class="ka-knapp" id="ka-hel" title="Helskärm (F)">⛶</button>
          <a class="ka-knapp" href="#/${alla ? 'alltime/minnen' : artal ? `ar/${artal}` : 'leaderboard'}" title="Avsluta">✕</a></span>
      </div>
      <div class="ka-bild ka-${b.typ}">${b.html}</div>
      <div class="ka-progress"><span style="animation-duration:${tid}ms;${paus ? 'animation-play-state:paused' : ''}"></span></div>
    </div>`;
    document.getElementById('ka-paus').onclick = vaxlaPaus;
    document.getElementById('ka-hel').onclick = helskarm;
    clearTimeout(timer);
    if (!paus) timer = setTimeout(fram, tid);
  };
  const fram = async () => {
    if (!aktuell(navId)) return stopp();
    if (Date.now() - senastHamtad > (alla ? HAMTA_ALLA : HAMTA)) await hamta().catch((e) => console.warn('Karusell:', e));
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
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* inte tillåtet */ }   // håll skärmen vaken

  await hamta();
  if (!aktuell(navId)) return stopp();
  visa(nasta());
}

// ---------- ett år ----------
async function ettAr(tht) {
  const f = { fresh: true }, nr = tht.nr;
  const [res, rundor, delt, foton] = await Promise.all([
    api(`v_tht_resultat?tht_nr=eq.${nr}&order=placering`, f),
    api(`v_runda?tht_nr=eq.${nr}&select=runda_id,deltavling_id,person_id,fornamn,ordning,poang,slag,antal_hal,placering`, f),
    api(`deltavling?tht_nr=eq.${nr}&order=ordning&select=id,tht_nr,ordning,namn,datum,narmast_hal,longest_hal,banversion(bana(namn))`, f),
    hamtaFoton(`tht_nr=eq.${nr}`, true).catch(() => []),
  ]);
  const ids = delt.map((d) => d.id).join(',');
  const [pris, kom, rundNamn] = ids ? await Promise.all([
    api(`pris?deltavling_id=in.(${ids})&select=deltavling_id,typ,person(fornamn)`, f),
    api(`kommentar?deltavling_id=in.(${ids})&select=id,deltavling_id,runda_id,boll_nr,text,skapad,fran_lank&order=skapad,id`, f).catch(() => []),
    api(`runda?deltavling_id=in.(${ids})&select=id,person(fornamn)`, f).catch(() => []),
  ]) : [[], [], []];
  // Pågår = THT:n är inte avslutad. Rundan att visa: dagens, annars den senaste med resultat
  const pagar = !tht.klar;
  const idag = isoDag(new Date());
  const medRes = delt.filter((d) => rundor.some((r) => r.deltavling_id === d.id && r.antal_hal > 0));
  const dag = delt.find((d) => d.datum === idag && medRes.includes(d)) ?? medRes[medRes.length - 1] ?? null;
  const score = dag ? await api(`v_score?deltavling_id=eq.${dag.id}&slag=not.is.null&select=runda_id,person_id,hal_nr,par,slag,slag_tak,poang&order=hal_nr`, f) : [];
  const D = { tht, res, rundor, delt, pris };

  const bilder = [];
  if (res.length) bilder.push({ typ: 'lb', html: resultatBild(D) });
  if (dag) {
    const rubrik = pagar ? (dag.datum === idag ? 'Dagens runda' : 'Senaste rundan') : null;
    const r = rundBild(D, dag, rubrik); if (r) bilder.push({ typ: 'dag', html: r });
    const h = hojdpunkter(D, dag, score); if (h) bilder.push({ typ: 'hojd', html: h });
  }
  // Minnen: dagens rundas först, annars THT:ns senaste
  const dagKom = dag ? kom.filter((k) => k.deltavling_id === dag.id) : [];
  const m = minnesBild(D, (dagKom.length ? dagKom : kom).slice(-4).reverse(), rundNamn); if (m) bilder.push({ typ: 'minnen', html: m });
  let i = 0;
  const dagens = dag ? foton.filter((x) => x.deltavling_id === dag.id) : [];
  return {
    nastaStat: () => (bilder.length ? bilder[i++ % bilder.length] : null),
    foton: [...dagens, ...blanda(foton.filter((x) => !dagens.includes(x)))],
    fotoBild: (x) => fotoBild(x, tht, delt),
  };
}

// ---------- alla år: totalblandning ----------
async function allaAr() {
  const [thts, res, rundor, delt, pris, kom, foton] = await Promise.all([
    api('tht?select=nr,artal,ort,klar,kronika&nr=gt.0&order=artal', { fresh: true }),
    allaRader('v_tht_resultat?select=tht_nr,person_id,fornamn,placering,poang,slag,rundor&order=tht_nr,placering'),
    allaRader('v_runda?select=runda_id,tht_nr,deltavling_id,person_id,fornamn,ordning,poang,slag,antal_hal,placering&order=runda_id'),
    allaRader('deltavling?select=id,tht_nr,ordning,namn,datum,narmast_hal,longest_hal,vinnare_utan_kort,banversion(bana(namn))&tht_nr=gt.0&order=tht_nr,ordning'),
    allaRader('pris?select=deltavling_id,typ,person(fornamn)&order=deltavling_id'),
    allaRader('kommentar?select=id,deltavling_id,runda_id,boll_nr,text,skapad,fran_lank&order=id').catch(() => []),
    allaRader('foto?select=id,tht_nr,deltavling_id,fil,tagen,text,person(fornamn)&klar=is.true&borttagen=is.null&order=id').catch(() => []),
  ]);
  const rid = [...new Set(kom.map((k) => k.runda_id).filter(Boolean))];
  const rundNamn = rid.length ? await api(`runda?id=in.(${rid.join(',')})&select=id,person(fornamn)`).catch(() => []) : [];
  const perTht = Object.fromEntries(thts.map((t) => [t.nr, { tht: t, res: [], rundor: [], delt: [], pris: [] }]));
  res.forEach((r) => perTht[r.tht_nr]?.res.push(r));
  rundor.forEach((r) => perTht[r.tht_nr]?.rundor.push(r));
  delt.forEach((d) => perTht[d.tht_nr]?.delt.push(d));
  const dTht = Object.fromEntries(delt.map((d) => [d.id, d.tht_nr]));
  pris.forEach((p) => perTht[dTht[p.deltavling_id]]?.pris.push(p));

  // En kö per sorts bild; korna blandas om när de tar slut. Ordningen växlar mellan sorterna.
  const sorter = {
    slut: () => Object.values(perTht).filter((D) => D.res.length).map((D) => ({ typ: 'lb', html: resultatBild(D) })),
    runda: () => Object.values(perTht).flatMap((D) => D.delt.filter((dl) => D.rundor.some((r) => r.deltavling_id === dl.id && r.antal_hal > 0)).map((dl) => ({ D, dl })))
      .map(({ D, dl }) => ({ typ: 'dag', html: rundBild(D, dl, null) })).filter((b) => b.html),
    minnen: () => Object.values(perTht).flatMap((D) => {
      const k = kom.filter((x) => dTht[x.deltavling_id] === D.tht.nr);
      const grupper = []; for (let i = 0; i < k.length; i += 3) grupper.push(k.slice(i, i + 3));
      return grupper.map((g) => ({ typ: 'minnen', html: minnesBild(D, g, rundNamn) }));
    }),
    kronika: () => thts.filter((t) => t.kronika?.trim()).map((t) => ({ typ: 'kronika', html: kronikaBild(t) })),
  };
  const ordning = ['slut', 'runda', 'minnen', 'runda', 'kronika'];
  const koer = {};
  let s = 0;
  const nastaStat = () => {
    for (let forsok = 0; forsok < ordning.length; forsok++) {
      const sort = ordning[s++ % ordning.length];
      if (!koer[sort]?.length) koer[sort] = blanda(sorter[sort]());
      if (koer[sort].length) return koer[sort].shift();
    }
    return null;
  };
  const tht = Object.fromEntries(thts.map((t) => [t.nr, t]));
  return { nastaStat, foton: blanda(foton.filter((x) => tht[x.tht_nr])), fotoBild: (x) => fotoBild(x, tht[x.tht_nr], delt) };
}

// ---------- bilderna ----------
function resultatBild({ tht, res, rundor, delt }) {
  const ordningar = delt.map((x) => x.ordning);
  const per = {}; rundor.forEach((r) => { (per[r.person_id] ??= {})[r.ordning] = r; });
  const hal = (pid) => Object.values(per[pid] ?? {}).reduce((a, r) => a + (r.antal_hal ?? 0), 0);
  const ledare = res.filter((r) => r.placering === 1).map((r) => esc(r.fornamn)).join(' & ');
  const utanKort = !rundor.length;
  const lista = res.slice(0, 14);
  return `${kicker(tht)}
    <h1 class="ka-rubrik">${tht.klar ? 'Slutresultat' : 'Leaderboard'} ${esc(tht.ort ?? '')} ${tht.artal}</h1>
    <p class="ka-under">${tht.klar ? `Vinnare: <strong>${ledare}</strong>` : `Leder just nu: <strong>${ledare}</strong>`}${utanKort ? ' · scorekorten saknas' : ''}</p>
    <table class="ka-tabell ${lista.length > 10 ? 'ka-tat' : ''}">
      <thead><tr><th>#</th><th class="l">Spelare</th><th>Poäng</th>${utanKort ? '' : `<th>Mot HCP</th>${ordningar.map((o) => `<th class="ka-r">R${o}</th>`).join('')}`}</tr></thead>
      <tbody>${lista.map((r) => { const h = hal(r.person_id), mh = h ? r.poang - 2 * h : null; return `<tr class="${r.placering === 1 ? 'ka-forst' : ''}">
        <td>${r.placering}</td><td class="l">${esc(r.fornamn)}</td><td><strong>${fmt(r.poang)}</strong></td>
        ${utanKort ? '' : `<td class="${mh > 0 ? 'plus' : ''}">${tecken(mh)}</td>
        ${ordningar.map((o) => { const x = per[r.person_id]?.[o]; return `<td class="ka-r ${x ? '' : 'dim'}">${x && x.antal_hal ? fmt(x.poang) + (x.antal_hal < 18 ? `<small>/${x.antal_hal}</small>` : '') : '–'}</td>`; }).join('')}`}</tr>`; }).join('')}</tbody>
    </table>`;
}

// En runda. rubrik = "Dagens runda"/"Senaste rundan" medan THT:n pågår, annars bara rundan och banan
function rundBild({ tht, rundor, pris }, dl, rubrik) {
  const rs = rundor.filter((r) => r.deltavling_id === dl.id && r.antal_hal > 0).sort((a, b) => a.placering - b.placering);
  if (!rs.length) return null;
  const forst = rs[0];
  const lagst = rs.filter((r) => r.antal_hal === 18).sort((a, b) => a.slag - b.slag)[0];
  const p = (typ) => pris.find((x) => x.deltavling_id === dl.id && x.typ === typ)?.person?.fornamn;
  const ruta = (v, t, u) => `<div class="ka-ruta"><div class="ka-v">${v}</div><div class="ka-t">${t}</div><div class="ka-u">${u}</div></div>`;
  return `${kicker(tht, null, dl.datum ?? '')}
    <h1 class="ka-rubrik">${rubrik ? `${rubrik} · ` : ''}${rundText(dl)}</h1>
    <div class="ka-rutor">
      ${ruta(esc(forst.fornamn), tht.klar ? 'Vann rundan' : 'Leder rundan', `${fmt(forst.poang)} poäng${forst.antal_hal < 18 ? ` efter ${forst.antal_hal} hål` : ''}`)}
      ${ruta(lagst ? esc(lagst.fornamn) : '–', 'Lägsta score', lagst ? `${fmt(lagst.slag)} slag` : 'ingen hel runda')}
      ${ruta(p('narmast') ? esc(p('narmast')) : '–', 'Närmast hål', dl.narmast_hal ? `hål ${dl.narmast_hal}` : '')}
      ${ruta(p('longest') ? esc(p('longest')) : '–', 'Longest drive', dl.longest_hal ? `hål ${dl.longest_hal}` : '')}
    </div>
    <ol class="ka-topp5">${rs.slice(0, 6).map((r) => `<li><span>${esc(r.fornamn)}</span><b>${fmt(r.poang)} p</b>${r.antal_hal < 18 ? `<small>${r.antal_hal} hål</small>` : ''}</li>`).join('')}</ol>`;
}

function hojdpunkter({ tht, rundor }, dl, score) {
  if (!score.length) return null;
  const namn = Object.fromEntries(rundor.map((r) => [r.runda_id, r.fornamn]));
  const fina = score.filter((s) => s.slag - s.par <= -1).map((s) => ({ ...s, typ: s.slag === 1 ? 'Hole in one' : s.slag - s.par <= -2 ? 'Eagle' : 'Birdie' }));
  const perSpelare = {};
  fina.forEach((s) => (perSpelare[s.runda_id] ??= []).push(s));
  const hv = {};   // ensamma hålvinster
  [...new Set(score.map((s) => s.hal_nr))].forEach((n) => {
    const pa = score.filter((s) => s.hal_nr === n);
    if (pa.length < 2) return;
    const min = Math.min(...pa.map((s) => s.slag_tak));
    const v = pa.filter((s) => s.slag_tak === min);
    if (v.length === 1) hv[v[0].runda_id] = (hv[v[0].runda_id] ?? 0) + 1;
  });
  const hvLista = Object.entries(hv).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const bast = score.slice().sort((a, b) => b.poang - a.poang)[0];
  const bastaHal = score.filter((s) => s.poang === bast.poang);
  const delar = [];
  if (fina.length) delar.push(`<div class="ka-kort"><h3>${fina.some((s) => s.typ !== 'Birdie') ? 'Birdies och bättre' : 'Birdies'} <span class="muted">(${fina.length})</span></h3>
    <ul>${Object.entries(perSpelare).sort((a, b) => b[1].length - a[1].length).map(([rid, ss]) => `<li><span>${esc(namn[rid])}</span> ${ss.map((s) => `<span class="ka-hal ${s.typ === 'Birdie' ? '' : 'ka-eagle'}" title="${s.typ}">${s.hal_nr}</span>`).join('')}</li>`).join('')}</ul></div>`);
  if (hvLista.length) delar.push(`<div class="ka-kort"><h3>Flest egna hålvinster</h3><ul>${hvLista.map(([rid, n]) => `<li><span>${esc(namn[rid])}</span> <b>${n}</b></li>`).join('')}</ul></div>`);
  if (bast && bast.poang >= 4) delar.push(`<div class="ka-kort"><h3>Flest poäng på ett hål</h3><ul>${bastaHal.slice(0, 4).map((s) => `<li><span>${esc(namn[s.runda_id])}</span> <b>${s.poang} p</b> <small>hål ${s.hal_nr} · ${s.slag} slag på par ${s.par}</small></li>`).join('')}</ul></div>`);
  if (!delar.length) return null;
  return `${kicker(tht, dl)}<h1 class="ka-rubrik">Höjdpunkter · R${dl.ordning}</h1><div class="ka-kortrad">${delar.join('')}</div>`;
}

function minnesBild({ tht, delt }, kom, rundNamn) {
  if (!kom.length) return null;
  const dlAv = Object.fromEntries(delt.map((x) => [x.id, x]));
  const rundor = rundNamn.map((r) => ({ id: r.id, person: r.person }));
  return `${kicker(tht)}<h1 class="ka-rubrik">Minnesvärt ${tht.artal}</h1>
    <ul class="ka-minnen">${kom.map((k) => `<li><q>${esc(k.text)}</q><span>${esc(vem(k, rundor))} · ${rundText(dlAv[k.deltavling_id]) || '?'}</span></li>`).join('')}</ul>`;
}

function kronikaBild(t) {
  const st = t.kronika.trim().split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  let text = st[Math.floor(Math.random() * st.length)];
  if (text.length > 420) text = text.slice(0, 400).replace(/\s+\S*$/, '') + ' …';
  return `${kicker(t)}<h1 class="ka-rubrik">Ur krönikan ${t.artal}</h1><blockquote class="ka-citat">${esc(text).replace(/\n/g, '<br>')}</blockquote>`;
}

function fotoBild(f, tht, delt) {
  const dl = delt.find((x) => x.id === f.deltavling_id);
  const under = [f.text ? esc(f.text) : '', f.person?.fornamn ? `foto ${esc(f.person.fornamn)}` : ''].filter(Boolean);
  return { typ: 'foto', html: `${tht ? kicker(tht, dl) : ''}<img src="${fotoUrl(f)}" alt="${esc(f.text ?? '')}">${under.length ? `<div class="ka-bildtext">${under.join(' · ')}</div>` : ''}` };
}
