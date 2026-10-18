// Årsrapport (#/rapport/<år>): allt om en THT på en sida i stil med 2016-rapporten – går att skriva ut eller spara som PDF.
import { api, esc, fmt, nuNav, aktuell } from './lib.js?v=0.29.0';
import { halvinstTabell, fordelningTabell, parTabell } from './statistik.js?v=0.29.0';
import { hamtaMinnen, vem } from './minnen.js?v=0.29.0';

const app = document.getElementById('app');
const FARGER = ['#3987e5', '#d95926', '#199e70', '#e3c278', '#a35cc8', '#d4417c', '#5bb7c9', '#8fa83a', '#c98a3e', '#7a86d6', '#b5b0a6', '#e07a5f'];
const kronikaHtml = (t) => t.trim().split(/\n\s*\n/).map((st) => `<p>${esc(st).replace(/\n/g, '<br>')}</p>`).join('');
const namnLank = (id, n) => `<a class="namn" href="#/spelare/${id}">${esc(n)}</a>`;

// THT-grafen som en enkel SVG (mot handicap, alla spelare) – fungerar även på papper
function graf(kurva, res, antalHal) {
  if (!kurva.length) return '';
  const W = 700, H = 300, m = { l: 36, r: 12, t: 12, b: 26 };
  const perP = {}; kurva.forEach((k) => (perP[k.person_id] ??= []).push(k));
  const vs = kurva.map((k) => Number(k.poang_ack_mot_hcp));
  let lo = Math.floor(Math.min(0, ...vs) / 5) * 5, hi = Math.ceil(Math.max(0, ...vs) / 5) * 5; if (hi - lo < 10) hi = lo + 10;
  const maxH = Math.max(antalHal, ...kurva.map((k) => k.hal_i_tht));
  const x = (h) => m.l + ((h - 1) / Math.max(1, maxH - 1)) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  const steg = hi - lo > 40 ? 10 : 5;
  let g = '';
  for (let v = lo; v <= hi; v += steg) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" class="rg-linje${v === 0 ? ' noll' : ''}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" class="rg-text">${v > 0 ? '+' : ''}${v}</text>`;
  for (let h = 18; h < maxH; h += 18) g += `<line x1="${x(h + 0.5)}" x2="${x(h + 0.5)}" y1="${m.t}" y2="${H - m.b}" class="rg-linje"/>`;
  for (let r = 1; r <= Math.ceil(maxH / 18); r++) g += `<text x="${x(Math.min(maxH, (r - 1) * 18 + 9.5))}" y="${H - 6}" text-anchor="middle" class="rg-text">R${r}</text>`;
  const ordning = res.map((r) => r.person_id).filter((p) => perP[p]);
  const linjer = ordning.map((pid, i) => `<polyline fill="none" stroke="${FARGER[i % FARGER.length]}" stroke-width="${i < 3 ? 2.6 : 1.4}" stroke-linejoin="round" points="${perP[pid].map((k) => `${x(k.hal_i_tht).toFixed(1)},${y(Number(k.poang_ack_mot_hcp)).toFixed(1)}`).join(' ')}"/>`).reverse().join('');
  const namn = Object.fromEntries(res.map((r) => [r.person_id, r.fornamn]));
  return `<figure class="rapport-graf"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="THT-grafen">${g}${linjer}</svg>
    <figcaption>${ordning.map((pid, i) => `<span><i style="background:${FARGER[i % FARGER.length]}"></i>${esc(namn[pid])}</span>`).join('')}</figcaption></figure>
    <p class="hint">Ackumulerade poäng mot handicap hål för hål (2 poäng per hål = 0).</p>`;
}

export async function renderRapport(artal) {
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Sammanställer årsrapporten …</p>';
  const [tht] = await api(`tht?artal=eq.${artal}&select=nr,artal,ort,kronika,klar`);
  if (!tht) { app.innerHTML = '<p class="err">Det finns ingen THT det året.</p>'; return; }
  const nr = tht.nr;
  const [res, rundor, kurva, delt, over, hv, ford, par, extra] = await Promise.all([
    api(`v_tht_resultat?tht_nr=eq.${nr}&order=placering&select=person_id,fornamn,placering,poang,slag,puttar_per_hal,rundor`),
    api(`v_runda?tht_nr=eq.${nr}&select=runda_id,deltavling_id,ordning,person_id,fornamn,poang,slag,puttar,hal_med_puttar,antal_hal,placering&order=ordning,placering`),
    api(`v_tht_kurva?tht_nr=eq.${nr}&order=hal_i_tht&select=person_id,hal_i_tht,poang_ack_mot_hcp`),
    api(`deltavling?tht_nr=eq.${nr}&order=ordning&select=id,ordning,namn,datum,narmast_hal,longest_hal,vinnare_utan_kort,banversion(bana(id,namn))`),
    api(`overnattning?tht_nr=eq.${nr}&select=platsnamn,antal_natter,organisator&order=id`),
    api(`v_stat_halvinst?tht_nr=eq.${nr}&select=tht_nr,person_id,fornamn,alla,ensamma`),
    api(`v_stat_fordelning?tht_nr=eq.${nr}&select=tht_nr,person_id,fornamn,rundor,hal,eagle,birdie,par,bogey,dubbel,trippel,quad,quint`),
    api(`v_stat_par?tht_nr=eq.${nr}&select=tht_nr,person_id,fornamn,par,hal,poang,slag`),
    api(`v_stat_runda?tht_nr=eq.${nr}&select=runda_id,person_id,fornamn,ordning,birdies,basta_svit`),
  ]);
  const [pris, minnen] = await Promise.all([
    delt.length ? api(`pris?deltavling_id=in.(${delt.map((d) => d.id).join(',')})&select=deltavling_id,typ,person(fornamn)`) : [],
    hamtaMinnen(delt.map((d) => d.id)),
  ]);
  if (!aktuell(myNav)) return;

  const harKort = rundor.length > 0;
  const datum = delt.map((d) => d.datum).filter(Boolean).sort();
  const period = datum.length ? (datum[0] === datum.at(-1) ? datum[0] : `${datum[0]} – ${datum.at(-1)}`) : '';
  const puttRad = (r) => (r.puttar_per_hal != null ? fmt(r.puttar_per_hal, 2) : '–');
  const perSlag = res.filter((r) => r.slag != null).slice().sort((a, b) => a.slag - b.slag);
  const hela = rundor.filter((r) => r.antal_hal === 18);
  const ext = Object.fromEntries(extra.map((e) => [e.runda_id, e]));
  const topp = (lista, f, stig = false) => lista.filter((r) => f(r) != null).sort((a, b) => (stig ? f(a) - f(b) : f(b) - f(a)))[0];
  const hojd = [
    ['Bästa runda', topp(hela, (r) => r.poang), (r) => `${r.poang} p`],
    ['Lägsta score', topp(hela, (r) => r.slag, true), (r) => `${r.slag} slag`],
    ['Flest birdies', topp(hela.filter((r) => ext[r.runda_id]?.birdies > 0), (r) => ext[r.runda_id].birdies), (r) => `${ext[r.runda_id].birdies} st`],
    ['Längsta svit par eller bättre', topp(hela.filter((r) => ext[r.runda_id]?.basta_svit > 0), (r) => ext[r.runda_id].basta_svit), (r) => `${ext[r.runda_id].basta_svit} hål`],
    ['Bästa puttrunda', topp(hela.filter((r) => r.hal_med_puttar === 18), (r) => r.puttar, true), (r) => `${r.puttar} puttar`],
  ].filter(([, r]) => r);
  const vinnare = res.find((r) => r.placering === 1);
  const prisFor = (d, typ) => pris.find((p) => p.deltavling_id === d.id && p.typ === typ)?.person?.fornamn;

  app.innerHTML = `
    <div class="rapport-knappar no-print"><a class="back" href="#/ar/${artal}">‹ ${artal}</a><button class="btn" type="button" id="skrivut">Skriv ut eller spara som PDF</button></div>
    <article class="rapport">
      <header class="rapport-huvud">
        <img src="logo.svg" alt="The Helkväll Tour" class="rapport-logo">
        <h1>THT ${nr} – ${esc(tht.ort)} ${artal}</h1>
        <p class="sub">${period}${delt.length ? ` · ${delt.length} deltävlingar` : ''}${res.length ? ` · ${res.length} spelare` : ''}</p>
        ${vinnare && tht.klar ? `<p class="rapport-vinnare">Vinnare: <strong>${esc(vinnare.fornamn)}</strong> med ${fmt(vinnare.poang)} poäng</p>` : tht.klar ? '' : '<p class="rapport-vinnare">THT:n pågår – ingen vinnare ännu</p>'}
      </header>

      ${tht.kronika ? `<section><h2>Krönika</h2><div class="kronika">${kronikaHtml(tht.kronika)}</div></section>` : ''}

      <section><h2>Tabellen</h2>
      <div class="tablewrap"><table class="stat-tabell"><thead><tr><th>#</th><th class="l">Namn</th><th>Poäng</th><th>Slag</th><th>Puttmedel</th></tr></thead>
        <tbody>${res.map((r) => `<tr><td>${r.placering}</td><td class="l">${namnLank(r.person_id, r.fornamn)}</td><td><strong>${fmt(r.poang)}</strong></td><td>${fmt(r.slag)}</td><td>${puttRad(r)}</td></tr>`).join('')}</tbody></table></div>
      ${!harKort ? `<p class="hint">Scorekorten från ${artal} saknas – bara totalresultatet finns.</p>` : ''}</section>

      ${perSlag.length ? `<section><h2>Tabellen på slag</h2>
      <div class="tablewrap"><table class="stat-tabell"><thead><tr><th>#</th><th class="l">Namn</th><th>Slag</th><th>Poäng</th><th>Puttmedel</th></tr></thead>
        <tbody>${perSlag.map((r, i) => `<tr><td>${i + 1}</td><td class="l">${esc(r.fornamn)}</td><td><strong>${fmt(r.slag)}</strong></td><td>${fmt(r.poang)}</td><td>${puttRad(r)}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint">Slag med tak par + 5 per hål.</p></section>` : ''}

      <section><h2>Deltävlingarna</h2>
      ${delt.map((d) => {
        const rs = rundor.filter((r) => r.deltavling_id === d.id);
        const uk = !rs.length && d.vinnare_utan_kort ? res.find((r) => r.person_id === d.vinnare_utan_kort)?.fornamn : null;
        const priser = [prisFor(d, 'narmast') && `Närmast hål${d.narmast_hal ? ` (${d.narmast_hal})` : ''}: ${esc(prisFor(d, 'narmast'))}`, prisFor(d, 'longest') && `Longest drive${d.longest_hal ? ` (${d.longest_hal})` : ''}: ${esc(prisFor(d, 'longest'))}`].filter(Boolean).join(' · ');
        return `<div class="rapport-delt"><h3>R${d.ordning} · ${esc(d.namn)}</h3>
          <p class="meta">${esc(d.banversion?.bana?.namn ?? '')}${d.datum ? ` · ${esc(d.datum)}` : ''}${priser ? ` · ${priser}` : ''}</p>
          ${rs.length ? `<div class="tablewrap"><table class="stat-tabell"><thead><tr><th>#</th><th class="l">Namn</th><th>Poäng</th><th>Slag</th><th>Puttmedel</th></tr></thead>
            <tbody>${rs.map((r) => `<tr><td>${r.placering}</td><td class="l"><a class="namn" href="#/runda/${r.runda_id}">${esc(r.fornamn)}</a></td><td><strong>${fmt(r.poang)}</strong></td><td>${fmt(r.slag)}</td><td>${r.hal_med_puttar ? fmt(r.puttar / r.hal_med_puttar, 1) : '–'}</td></tr>`).join('')}</tbody></table></div>`
            : uk ? `<p>Vinnare: <strong>${esc(uk)}</strong> (scorekort saknas)</p>` : '<p class="muted">Inga resultat.</p>'}</div>`;
      }).join('')}</section>

      ${harKort ? `<section><h2>THT-grafen</h2>${graf(kurva, res, delt.length * 18)}</section>` : ''}

      ${hojd.length ? `<section><h2>Årets höjdpunkter</h2>
      <ul class="rapport-hojd">${hojd.map(([t, r, v]) => `<li><span class="muted">${t}:</span> <strong>${v(r)}</strong> – ${esc(r.fornamn)}, R${r.ordning}</li>`).join('')}</ul></section>` : ''}

      ${minnen.kom.length ? `<section><h2>Minnesvärda moment</h2>${delt.filter((d) => minnen.kom.some((k) => k.deltavling_id === d.id)).map((d) => `<h3>R${d.ordning} · ${esc(d.banversion?.bana?.namn ?? d.namn ?? '')}</h3><ul class="rapport-hojd">${minnen.kom.filter((k) => k.deltavling_id === d.id).map((k) => `<li><span class="muted">${esc(vem(k, minnen.rundor))}:</span> ${esc(k.text)}</li>`).join('')}</ul>`).join('')}</section>` : ''}

      ${hv.length ? `<section><h2>Hålvinster</h2>${halvinstTabell(hv, { visaTht: false })}<p class="hint">Minst antal slag på hålet i deltävlingen. Ensamma = vunna utan att dela.</p></section>` : ''}
      ${ford.length ? `<section><h2>Birdies, par, bogeys …</h2>${fordelningTabell(ford, 'antal')}</section>` : ''}
      ${par.length ? `<section><h2>Medelpoäng per par</h2>${parTabell(par, 'poang')}</section>` : ''}

      ${over.length ? `<section><h2>Övernattning</h2><ul class="rapport-hojd">${over.map((o) => `<li><strong>${esc(o.platsnamn)}</strong>${o.antal_natter ? ` · ${o.antal_natter} ${o.antal_natter === 1 ? 'natt' : 'nätter'}` : ''}${o.organisator ? ` · ${esc(o.organisator)}` : ''}</li>`).join('')}</ul></section>` : ''}

      <footer class="rapport-fot">Sammanställt ur THT-appen ${new Date().toISOString().slice(0, 10)} · lunkster.github.io/tht</footer>
    </article>`;
  document.getElementById('skrivut').onclick = () => {
    document.querySelectorAll('.rapport .kollapsad').forEach((el) => el.classList.remove('kollapsad'));   // skriv ut allt
    window.print();
  };
}
