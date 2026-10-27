// Deltävlingssida (#/deltavling/<id>): topplista för rundan, priser, bollar, hål för hål, hålvinster och minnesvärda moment.
import { api, esc, fmt, datum, nuNav, aktuell } from './lib.js?v=0.35.3';
import { minnenWidget } from './minnen.js?v=0.35.3';
import { fotoSektion } from './foto.js?v=0.35.3';

const app = document.getElementById('app');
const namnLank = (id, n) => `<a class="namn" href="#/spelare/${id}">${esc(n)}</a>`;
const motHcp = (r) => (r.antal_hal ? r.poang - 2 * r.antal_hal : null);
const tecken = (v) => (v == null ? '–' : v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '±0');
const resKlass = (s) => { if (s.slag == null) return ''; const d = s.slag_tak - s.par; return s.slag === 1 || d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : d === 2 ? 'dubbel' : 'trippel'; };

export async function renderDeltavling(did) {
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Laddar deltävling …</p>';
  const [[d]] = await Promise.all([
    api(`deltavling?id=eq.${did}&select=id,tht_nr,ordning,namn,datum,narmast_hal,longest_hal,vinnare_utan_kort,banversion_id,tee(namn),banversion(bana(id,namn)),tht(nr,artal,ort,klar)`),
  ]);
  if (!aktuell(myNav)) return;
  if (!d || d.tht_nr === 0) { app.innerHTML = '<p class="err">Deltävlingen finns inte.</p>'; return; }
  const [rundor, score, hal, pris, syskon, vinnareUtan] = await Promise.all([
    api(`v_runda?deltavling_id=eq.${did}&select=runda_id,person_id,fornamn,spel_hcp,boll_nr,antal_hal,slag,poang,puttar,hal_med_puttar,placering&order=placering,fornamn`),
    api(`v_score?deltavling_id=eq.${did}&slag=not.is.null&select=runda_id,person_id,hal_nr,par,slag,slag_tak,poang&order=hal_nr`),
    d.banversion_id ? api(`hal?banversion_id=eq.${d.banversion_id}&select=nr,par,hcp_index&order=nr`) : [],
    api(`pris?deltavling_id=eq.${did}&select=typ,person(id,fornamn)`),
    api(`deltavling?tht_nr=eq.${d.tht_nr}&select=id,ordning,namn&order=ordning`),
    d.vinnare_utan_kort ? api(`person?id=eq.${d.vinnare_utan_kort}&select=id,fornamn`) : [],
  ]);
  if (!aktuell(myNav)) return;
  const t = d.tht, bana = d.banversion?.bana, klar = !!t?.klar;
  const idx = syskon.findIndex((x) => x.id === d.id), forra = syskon[idx - 1], nasta = syskon[idx + 1];
  const hela = rundor.filter((r) => r.antal_hal > 0);
  const vinnare = hela.find((r) => r.placering === 1);
  const bastSlag = hela.filter((r) => r.antal_hal === 18).sort((a, b) => a.slag - b.slag)[0];
  const prisAv = (typ) => pris.find((p) => p.typ === typ)?.person;
  const nh = prisAv('narmast'), ld = prisAv('longest');
  const tile = (v, rubrik, under) => `<div class="sp-tile"><div class="sp-v">${v}</div><div class="sp-t">${rubrik}</div><div class="sp-d">${under}</div></div>`;

  // Hål för hål: per runda och hål, och vem som vann hålet (minst slag, ensam eller delad)
  const S = {}; score.forEach((s) => { (S[s.runda_id] ??= {})[s.hal_nr] = s; });
  const halNr = hal.length ? hal.map((h) => h.nr) : [...new Set(score.map((s) => s.hal_nr))].sort((a, b) => a - b);
  const hv = {}; const vinst = {};   // hv[person] = { alla, ensamma }, vinst[hål] = Set(runda_id)
  halNr.forEach((n) => {
    const pa = hela.map((r) => S[r.runda_id]?.[n]).filter(Boolean);
    if (pa.length < 2) return;
    const min = Math.min(...pa.map((s) => s.slag_tak));
    const vinnarna = pa.filter((s) => s.slag_tak === min);
    vinst[n] = new Set(vinnarna.map((s) => s.runda_id));
    vinnarna.forEach((s) => { const x = (hv[s.person_id] ??= { alla: 0, ensamma: 0 }); x.alla++; if (vinnarna.length === 1) x.ensamma++; });
  });
  const hvLista = hela.map((r) => ({ ...r, ...(hv[r.person_id] ?? { alla: 0, ensamma: 0 }) })).filter((r) => r.alla).sort((a, b) => b.alla - a.alla || b.ensamma - a.ensamma);

  // Bollar
  const bollar = {}; rundor.forEach((r) => (bollar[r.boll_nr ?? 0] ??= []).push(r));
  const bollNr = Object.keys(bollar).map(Number).sort((a, b) => (a || 99) - (b || 99));

  app.innerHTML = `
    <div class="row-between"><a class="back" href="#/ar/${t?.artal}">‹ ${esc(t?.ort ?? '')} ${t?.artal ?? ''}</a>
      <span class="dt-nav">${forra ? `<a class="btn small" href="#/deltavling/${forra.id}" title="Föregående deltävling">‹ R${forra.ordning}</a>` : ''}${nasta ? `<a class="btn small" href="#/deltavling/${nasta.id}" title="Nästa deltävling">R${nasta.ordning} ›</a>` : ''}</span></div>
    <h1>R${d.ordning} · ${esc(d.namn ?? '')}</h1>
    <p class="sub">${bana ? `<a class="namn" href="#/bana/${bana.id}">${esc(bana.namn)}</a> · ` : ''}${datum(d.datum)}${d.tee?.namn ? ` · tee ${esc(d.tee.namn)}` : ''} · THT ${t?.nr}</p>
    ${klar ? '' : '<div class="pagar"><strong>Pågår</strong> – THT:n är inte avslutad, så ingen vinnare är utsedd än.</div>'}

    <div class="sp-nyckel">
      ${tile(vinnare ? namnLank(vinnare.person_id, vinnare.fornamn) : vinnareUtan[0] ? namnLank(vinnareUtan[0].id, vinnareUtan[0].fornamn) : '–', klar ? 'Vinnare' : 'Leder', vinnare ? `${fmt(vinnare.poang)} poäng · ${tecken(motHcp(vinnare))} mot hcp` : vinnareUtan[0] ? 'scorekort saknas' : '')}
      ${tile(bastSlag ? namnLank(bastSlag.person_id, bastSlag.fornamn) : '–', 'Lägsta score', bastSlag ? `${fmt(bastSlag.slag)} slag (tak par + 5)` : '')}
      ${tile(nh ? namnLank(nh.id, nh.fornamn) : '–', 'Närmast hål', d.narmast_hal ? `hål ${d.narmast_hal}` : '')}
      ${tile(ld ? namnLank(ld.id, ld.fornamn) : '–', 'Longest drive', d.longest_hal ? `hål ${d.longest_hal}` : '')}
    </div>

    ${hela.length ? `<h2>Topplista</h2>
    <div class="tablewrap"><table class="stat-tabell">
      <thead><tr><th>#</th><th class="l">Spelare</th><th>Poäng</th><th>Mot HCP</th><th>Slag</th><th class="hide-sm">Puttar</th><th class="hide-sm">Spel-HCP</th><th class="hide-sm">Boll</th></tr></thead>
      <tbody>${hela.map((r) => `<tr>
        <td>${r.placering}</td>
        <td class="l ${klar && r.placering === 1 ? 'win' : ''}">${namnLank(r.person_id, r.fornamn)}</td>
        <td><a class="namn" href="#/runda/${r.runda_id}" title="Scorekort"><strong>${fmt(r.poang)}</strong></a>${r.antal_hal < 18 ? ` <span class="muted small">(${r.antal_hal} hål)</span>` : ''}</td>
        <td class="${motHcp(r) > 0 ? 'plus' : ''}">${tecken(motHcp(r))}</td>
        <td>${fmt(r.slag)}</td>
        <td class="hide-sm">${r.hal_med_puttar ? fmt(r.puttar) : '–'}</td>
        <td class="hide-sm">${r.spel_hcp ?? '–'}</td>
        <td class="hide-sm">${r.boll_nr ?? '–'}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="hint">Lika poäng – lägst spel-HCP placeras före. Tryck på poängen för scorekortet.</p>` : '<p class="muted">Inga scorekort för deltävlingen.</p>'}

    ${bollNr.length && rundor.some((r) => r.boll_nr != null) ? `<h2>Bollar</h2>
    <div class="dt-bollar">${bollNr.map((b) => { const rs = bollar[b].slice().sort((x, y) => (y.poang ?? -1) - (x.poang ?? -1)); return `<div class="card dt-boll">
      <div class="rn">${b ? `Boll ${b}` : 'Utan boll'}</div>
      <ul>${rs.map((r, i) => `<li class="${i === 0 && r.poang != null ? 'basta' : ''}">${namnLank(r.person_id, r.fornamn)} <span class="muted">${r.antal_hal ? `${fmt(r.poang)} p` : ''}</span></li>`).join('')}</ul></div>`; }).join('')}</div>` : ''}

    ${score.length ? `<h2>Hål för hål</h2>
    <div class="tablewrap"><table class="dt-hal">
      <thead><tr><th class="l">Hål</th>${halNr.map((n) => `<th>${bana ? `<a class="namn" href="#/hal/${bana.id}/${n}">${n}</a>` : n}</th>`).join('')}<th>Slag</th><th>Poäng</th></tr>
        ${hal.length ? `<tr class="dt-par"><th class="l">Par</th>${hal.map((h) => `<th>${h.par}</th>`).join('')}<th>${hal.reduce((a, h) => a + h.par, 0)}</th><th></th></tr>` : ''}</thead>
      <tbody>${hela.map((r) => `<tr><td class="l">${namnLank(r.person_id, r.fornamn)}</td>${halNr.map((n) => { const s = S[r.runda_id]?.[n]; return `<td class="${vinst[n]?.has(r.runda_id) ? 'hv' : ''}">${s ? `<span class="sk-slag res-${resKlass(s)}" title="${s.poang} p">${s.slag}</span>` : '<span class="dim">·</span>'}</td>`; }).join('')}<td><strong>${fmt(r.slag)}</strong></td><td>${fmt(r.poang)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="hint">Ring = birdie eller bättre, ruta = bogey eller sämre. Guldbakgrund = vann hålet (minst slag, även delat). Håll över ett slag för poängen. Tryck på ett hålnummer för allas resultat på hålet genom åren.</p>` : ''}

    ${hvLista.length ? `<h2>Hålvinster</h2>
    <div class="tablewrap"><table class="stat-tabell"><thead><tr><th class="l">Spelare</th><th>Alla</th><th>Ensamma</th></tr></thead>
      <tbody>${hvLista.map((r) => `<tr><td class="l">${namnLank(r.person_id, r.fornamn)}</td><td>${r.alla}</td><td><strong>${r.ensamma}</strong></td></tr>`).join('')}</tbody></table></div>` : ''}

    <section id="dt-foton" class="foto-sek"></section>

    <h2>Minnesvärda moment</h2>
    <div id="dt-minnen"><p class="muted">Laddar …</p></div>`;
  fotoSektion(document.getElementById('dt-foton'), { thtNr: d.tht_nr, did: d.id }).catch((e) => console.warn('Foton:', e));
  minnenWidget(document.getElementById('dt-minnen'), d.id).catch(() => { document.getElementById('dt-minnen').innerHTML = ''; });
}
