// Bansida: en banas betyg, när den spelats, bästa rundor och hålen.
import { api, esc, fmt, nuNav, aktuell } from './lib.js?v=0.31.0';
import { punktKarta } from './karta.js?v=0.31.0';
import { halStatistik } from './statistik.js?v=0.31.0';

const app = document.getElementById('app');
const stjarnor = (v) => v == null ? '' : `<span class="stjarnor" aria-hidden="true" style="--v:${(v / 5) * 100}%">★★★★★</span>`;

export async function renderBana(bid) {
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Laddar bana …</p>';
  const [[b], versioner, betyg, thts] = await Promise.all([
    api(`bana?id=eq.${bid}&select=id,namn,lat,lon,restaurang,rattigheter`),
    api(`banversion?bana_id=eq.${bid}&select=id,giltig_fran,kommentar,deltavling(id,tht_nr,ordning,namn,datum)&order=giltig_fran.desc`),
    api(`ban_betyg?bana_id=eq.${bid}&select=tht_nr,betyg,person_id`),
    api('tht?select=nr,artal,ort'),
  ]);
  if (!aktuell(myNav)) return;
  if (!b) { app.innerHTML = '<p class="err">Banan finns inte.</p>'; return; }
  const thtMap = Object.fromEntries(thts.map((t) => [t.nr, t]));
  const delt = versioner.flatMap((v) => v.deltavling.filter((d) => d.tht_nr !== 0).map((d) => ({ ...d, artal: thtMap[d.tht_nr]?.artal, ort: thtMap[d.tht_nr]?.ort }))).sort((a, c) => a.datum.localeCompare(c.datum));
  const senaste = versioner[0];
  const [hal, tees, rundor] = await Promise.all([
    senaste ? api(`hal?banversion_id=eq.${senaste.id}&select=nr,par,hcp_index,hal_langd(tee_id,langd)&order=nr`) : [],
    senaste ? api(`tee?banversion_id=eq.${senaste.id}&select=id,namn&order=id`) : [],
    delt.length ? api(`v_runda?deltavling_id=in.(${delt.map((d) => d.id).join(',')})&select=runda_id,person_id,fornamn,artal,ordning,poang,slag,antal_hal&order=poang.desc`) : [],
  ]);
  const halStat = hal.length ? await halStatistik(bid).catch(() => ({})) : {};
  if (!aktuell(myNav)) return;
  const hs = (h) => halStat[`${h.nr}-${h.par}`];
  const svarast = Object.values(halStat).filter((x) => x.spelade >= 4).sort((a, c) => c.over_par - a.over_par)[0];

  const snitt = betyg.length ? betyg.reduce((a, x) => a + x.betyg, 0) / betyg.length : null;
  const perAr = Object.values(betyg.reduce((acc, x) => { const r = (acc[x.tht_nr] ??= { tht_nr: x.tht_nr, n: 0, s: 0 }); r.n++; r.s += x.betyg; return acc; }, {}))
    .map((r) => ({ ...r, artal: thtMap[r.tht_nr]?.artal, snitt: r.s / r.n })).sort((a, c) => c.artal - a.artal);
  const fulla = rundor.filter((r) => r.antal_hal === 18);
  const basta = fulla.slice(0, 5);
  const parTot = hal.reduce((a, h) => a + h.par, 0);
  const egenskaper = [b.restaurang && 'restaurang', b.rattigheter && 'fullständiga rättigheter'].filter(Boolean).join(' · ');

  app.innerHTML = `
    <h1>${esc(b.namn)}</h1>
    <p class="sub">Spelad ${delt.length} ${delt.length === 1 ? 'gång' : 'gånger'}${hal.length === 18 ? ` · par ${parTot}` : ''}${egenskaper ? ' · ' + egenskaper : ''}</p>

    <div class="sp-nyckel">
      <div class="sp-tile"><div class="sp-v">${snitt == null ? '–' : fmt(snitt, 1)}</div><div class="sp-t">Banbetyg ${stjarnor(snitt)}</div><div class="sp-d">${betyg.length ? `${betyg.length} betyg, skala 1–5` : 'inga betyg ännu'}</div></div>
      <div class="sp-tile"><div class="sp-v">${fulla.length ? fmt(fulla.reduce((a, r) => a + r.poang, 0) / fulla.length, 1) : '–'}</div><div class="sp-t">Poäng/runda</div><div class="sp-d">${fulla.length} hela rundor</div></div>
      <div class="sp-tile"><div class="sp-v">${basta[0] ? basta[0].poang + ' p' : '–'}</div><div class="sp-t">Bästa runda</div><div class="sp-d">${basta[0] ? `${esc(basta[0].fornamn)} ${basta[0].artal}` : ''}</div></div>
      <div class="sp-tile"><div class="sp-v">${fulla.length ? fmt(fulla.reduce((a, r) => a + r.slag, 0) / fulla.length, 1) : '–'}</div><div class="sp-t">Slag/runda</div><div class="sp-d">tak par + 5</div></div>
    </div>

    <h2>Spelad</h2>
    <div class="rounds">${delt.map((d) => `<a class="round link-card" href="#/ar/${d.artal}"><div><div class="rn">${d.artal} · R${d.ordning} · ${esc(d.namn)}</div><div class="meta">${esc(d.datum)} · ${esc(d.ort ?? '')}</div></div><div class="win"><span class="arrow">›</span></div></a>`).join('') || '<p class="muted">Inte spelad i THT.</p>'}</div>

    ${perAr.length ? `<h2>Betyg per år</h2>
    <div class="tablewrap"><table><thead><tr><th class="l">År</th><th>Snitt</th><th>Antal</th></tr></thead>
      <tbody>${perAr.map((r) => `<tr><td class="l">${r.artal}</td><td>${fmt(r.snitt, 1)} ${stjarnor(r.snitt)}</td><td>${r.n}</td></tr>`).join('')}</tbody></table></div>` : ''}

    ${basta.length ? `<h2>Bästa rundor</h2>
    <div class="tablewrap"><table><thead><tr><th class="l">Spelare</th><th class="l">År</th><th>Poäng</th><th>Slag</th></tr></thead>
      <tbody>${basta.map((r) => `<tr><td class="l"><a class="namn" href="#/spelare/${r.person_id}">${esc(r.fornamn)}</a></td><td class="l"><a class="namn" href="#/runda/${r.runda_id}">${r.artal} R${r.ordning}</a></td><td><strong>${r.poang}</strong></td><td>${r.slag}</td></tr>`).join('')}</tbody></table></div>` : ''}

    ${hal.length ? `<details class="card bana-hal"><summary><strong>Hålen</strong> <span class="muted">– version från ${esc(senaste.giltig_fran)}</span></summary>
      <div class="tablewrap"><table><thead><tr><th>Hål</th><th>Par</th><th>Index</th>${tees.map((t) => `<th>${esc(t.namn)}</th>`).join('')}<th title="Snitt slag över par, alla som spelat hålet">Över par</th><th class="hide-sm">Poäng</th></tr></thead>
        <tbody>${hal.map((h) => `<tr><td><a class="namn" href="#/hal/${bid}/${h.nr}">${h.nr}</a></td><td>${h.par}</td><td>${h.hcp_index}</td>${tees.map((t) => `<td>${h.hal_langd.find((l) => l.tee_id === t.id)?.langd ?? '–'}</td>`).join('')}<td class="${svarast && hs(h) === svarast ? 'win' : ''}">${hs(h) ? `${hs(h).over_par > 0 ? '+' : ''}${fmt(hs(h).over_par, 1)}` : '–'}</td><td class="hide-sm">${hs(h) ? fmt(hs(h).poang, 1) : '–'}</td></tr>`).join('')}</tbody></table></div>
        ${Object.keys(halStat).length ? `<p class="hint">Över par = snitt slag över par (tak par + 5) för alla som spelat hålet i THT.${svarast ? ` Svåraste: hål ${svarast.hal_nr}.` : ''}</p>` : ''}</details>` : ''}

    ${b.lat != null ? `<section class="minikarta"><div class="row-between"><h2>Karta</h2><a class="lank-pil" href="https://www.openstreetmap.org/?mlat=${b.lat}&mlon=${b.lon}#map=15/${b.lat}/${b.lon}" target="_blank" rel="noopener">OpenStreetMap ›</a></div><div class="karta mini" id="bankarta"></div></section>` : ''}`;
  if (b.lat != null) punktKarta(document.getElementById('bankarta'), b.lat, b.lon);
}

// Topplista över banor efter deltagarnas betyg (minst 3 betyg)
export async function banTopplista() {
  const betyg = await api('ban_betyg?select=bana_id,betyg,bana(namn)');
  const per = Object.values(betyg.reduce((acc, x) => { const r = (acc[x.bana_id] ??= { id: x.bana_id, namn: x.bana?.namn ?? '?', n: 0, s: 0 }); r.n++; r.s += x.betyg; return acc; }, {}))
    .filter((r) => r.n >= 3).map((r) => ({ ...r, snitt: r.s / r.n })).sort((a, c) => c.snitt - a.snitt || c.n - a.n);
  return per;
}
// Alla spelade banor med betyg (även färre än 3) och antal gånger spelad – för "Visa alla banor"
export async function banLista() {
  const [banor, betyg] = await Promise.all([
    api('bana?select=id,namn,banversion(deltavling(id))'),
    api('ban_betyg?select=bana_id,betyg'),
  ]);
  const per = {};
  betyg.forEach((x) => { const r = (per[x.bana_id] ??= { n: 0, s: 0 }); r.n++; r.s += Number(x.betyg); });
  return banor.map((b) => ({ id: b.id, namn: b.namn, spelad: b.banversion.reduce((a, v) => a + v.deltavling.length, 0), n: per[b.id]?.n ?? 0, snitt: per[b.id] ? per[b.id].s / per[b.id].n : null }))
    .filter((b) => b.spelad > 0)
    .sort((a, c) => (c.n >= 3) - (a.n >= 3) || (c.snitt ?? -1) - (a.snitt ?? -1) || c.n - a.n || a.namn.localeCompare(c.namn, 'sv'));
}
export { stjarnor };
