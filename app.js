// THT golfapp (v0.30.0) – statistik och inmatning.
// Statistik läses direkt från Supabase-vyerna utan inloggning. Inmatning kräver THT-koden.

import { api, allaRader, esc, fmt, datum, nyNav, nuNav, aktuell, tolkaDatum, uppdateraRoll } from './lib.js?v=0.30.0';
import { renderMata } from './mata.js?v=0.30.0';
import { renderAdmin } from './admin.js?v=0.30.0';
import { renderSpelare } from './spelare.js?v=0.30.0';
import { renderKarta, miniKarta } from './karta.js?v=0.30.0';
import { renderBana, banTopplista, banLista, stjarnor } from './bana.js?v=0.30.0';
import { renderBetygLank } from './betyg.js?v=0.30.0';
import { renderNyheter } from './nyheter.js?v=0.30.0';
import { renderRunda } from './runda.js?v=0.30.0';
import './kollaps.js?v=0.30.0';
import { renderRapport } from './rapport.js?v=0.30.0';
import { renderDuell } from './inbordes.js?v=0.30.0';
import { hamtaMinnen, minnenWidget, kanSkriva } from './minnen.js?v=0.30.0';
import { STAT_FLIKAR, renderStatFlik, arsStatistik, renderHal } from './statistik.js?v=0.30.0';

const SERIES = ['#3987e5', '#d95926', '#199e70'];
const MUTED = 'rgba(242, 232, 213, 0.22)';
const CREAM = '#f2e8d5', CREAM2 = '#c9bfa9', CREAM3 = '#8f8676', LINE = '#3a3530';

const app = document.getElementById('app');

// ---------- routing ----------
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [page, arg, ...rest] = h.split('/');
  const tab = page || 'start';
  clearInterval(lbTimer); clearInterval(startTimer);
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.route === tab));
  window.onresize = null;
  window.scrollTo(0, 0);
  const id = nyNav();
  const fel = (e) => { if (aktuell(id)) showError(e); };
  if (page === 'alltime') return renderAlltime(arg).catch(fel);
  if (page === 'leaderboard') return renderLeaderboard(id).catch(fel);
  if (page === 'mata') return renderMata([arg, ...rest]).catch(fel);
  if (page === 'admin') return renderAdmin([arg, ...rest]).catch(fel);
  if (page === 'spelare' && arg) return renderSpelare(Number(arg)).catch(fel);
  if (page === 'karta') return renderKarta(arg ? Number(arg) : null).catch(fel);
  if (page === 'bana' && arg) return renderBana(Number(arg)).catch(fel);
  if (page === 'hal' && arg && rest[0]) return renderHal(Number(arg), Number(rest[0])).catch(fel);
  if (page === 'betyg' && arg) return renderBetygLank(arg).catch(fel);
  if (page === 'nyheter') return renderNyheter().catch(fel);
  if (page === 'runda' && arg) return renderRunda(Number(arg)).catch(fel);
  if (page === 'duell' && arg) return renderDuell(Number(arg), rest[0] ? Number(rest[0]) : null).catch(fel);
  if (page === 'rapport' && arg) return renderRapport(Number(arg)).catch(fel);
  if (page === 'ar') return renderYear(arg ? Number(arg) : null).catch(fel);
  return renderStart(id).catch(fel);
}
window.addEventListener('hashchange', route);

// Alla datumfält: skriv om till ÅÅÅÅ-MM-DD när man lämnar fältet (20260904 → 2026-09-04), markera ogiltiga.
document.addEventListener('focusout', (e) => {
  const el = e.target;
  if (!el.matches?.('input.datum')) return;
  const v = tolkaDatum(el.value);
  if (typeof v === 'string') el.value = v;
  el.classList.toggle('fel', Number.isNaN(v));
  if (typeof v === 'string' || v === null) el.dispatchEvent(new Event('change', { bubbles: true }));
});

function showError(e) {
  console.error(e);
  app.innerHTML = `<div class="err"><strong>Kunde inte hämta data.</strong><br><span class="muted">${esc(e.message)}</span></div>`;
}

// Krönikan: tomrad = nytt stycke, radbrytning behålls
export const kronikaHtml = (t) => t.trim().split(/\n\s*\n/).map((st) => `<p>${esc(st).replace(/\n/g, '<br>')}</p>`).join('');

// ---------- år ----------
async function renderYear(artal) {
  const myNav = nuNav();
  const thts = await api('tht?select=nr,artal,ort,klar,kronika&order=artal');
  const medData = await api('v_tht_resultat?select=artal');
  const arMedData = new Set(medData.map((r) => r.artal));
  const lista = thts.filter((t) => arMedData.has(t.artal));
  if (!artal) artal = lista[lista.length - 1].artal;
  const tht = thts.find((t) => t.artal === artal);
  if (!tht) { location.hash = '#/ar'; return; }
  const idx = lista.findIndex((t) => t.artal === artal);

  if (!aktuell(myNav)) return; app.innerHTML = `<p class="muted center">Laddar ${artal} …</p>`;
  const [res, rundor, kurva, delt, pris] = await Promise.all([
    api(`v_tht_resultat?tht_nr=eq.${tht.nr}&order=placering`),
    api(`v_runda?tht_nr=eq.${tht.nr}&select=runda_id,person_id,ordning,poang,slag,antal_hal,spel_hcp`),
    api(`v_tht_kurva?tht_nr=eq.${tht.nr}&order=hal_i_tht&select=person_id,hal_i_tht,poang_ack,poang_ack_mot_hcp`),
    api(`deltavling?tht_nr=eq.${tht.nr}&order=ordning&select=id,ordning,namn,datum,narmast_hal,longest_hal,vinnare_utan_kort,banversion(bana(id,namn))`),
    api(`pris?select=deltavling_id,typ,person(fornamn)`),
  ]);

  const ordningar = [...new Set(delt.map((d) => d.ordning))];
  const perRunda = {};
  rundor.forEach((r) => { (perRunda[r.person_id] ??= {})[r.ordning] = r; });
  const utanKort = !rundor.length && res.length > 0;   // t.ex. 1999: bara totalresultat och deltävlingsvinnare
  const topp = res.slice(0, 3);
  const tieNote = res.length > 1 && res[0].poang === res[1].poang ? `<p class="hint">Lika poäng – lägst spel-HCP vinner.</p>` : '';

  if (!aktuell(myNav)) return; app.innerHTML = `
    <div class="yearbar">
      <button id="prev" aria-label="Föregående år" ${idx <= 0 ? 'disabled' : ''}>‹</button>
      <select id="ar" aria-label="Välj år">
        ${lista.slice().reverse().map((t) => `<option value="${t.artal}" ${t.artal === artal ? 'selected' : ''}>THT ${t.nr} · ${t.artal}</option>`).join('')}
      </select>
      <button id="next" aria-label="Nästa år" ${idx >= lista.length - 1 ? 'disabled' : ''}>›</button>
    </div>
    <h1>${esc(tht.ort)} ${artal}</h1>
    <p class="sub">THT ${tht.nr} · ${delt.length} deltävlingar · ${res.length} spelare</p>
    <p class="rapport-lank"><a class="lank-pil" href="#/rapport/${artal}">Årsrapport ›</a></p>

    ${tht.kronika ? `<section class="kronika-sek"><h2>Krönika</h2><div class="card kronika">${kronikaHtml(tht.kronika)}</div></section>` : ''}
    ${tht.klar ? '' : pagarRuta(res)}
    <div class="podium" ${tht.klar ? '' : 'hidden'}>
      ${[1, 0, 2].map((i) => topp[i] ? `
        <div class="pod ${i === 0 ? 'first' : ''}">
          <div class="place">${i + 1}:a</div>
          <div class="name"><a class="namn" href="#/spelare/${topp[i].person_id}">${esc(topp[i].fornamn)}</a></div>
          <div class="pts">${fmt(topp[i].poang)} p</div>
        </div>` : '<div></div>').join('')}
    </div>
    ${tieNote}

    ${utanKort ? `<p class="hint">Scorekorten från ${artal} saknas – här finns bara totalresultatet och vem som vann varje deltävling.</p>` : ''}
    ${resultatOchGraf(res, ordningar, perRunda, tht.klar, utanKort)}

    <h2>Deltävlingar</h2>
    <div class="rounds">
      ${delt.map((d) => {
        const vinnare = rundor.filter((r) => r.ordning === d.ordning).sort((a, b) => (b.poang ?? -1) - (a.poang ?? -1))[0];
        const vNamn = vinnare ? res.find((r) => r.person_id === vinnare.person_id)?.fornamn : null;
        const kand = !vinnare && d.vinnare_utan_kort ? res.find((r) => r.person_id === d.vinnare_utan_kort) : null;   // vinnare utan scorekort
        const nh = pris.find((p) => p.deltavling_id === d.id && p.typ === 'narmast');
        const ld = pris.find((p) => p.deltavling_id === d.id && p.typ === 'longest');
        const extra = [nh && `Närmast hål${d.narmast_hal ? ' (' + d.narmast_hal + ')' : ''}: ${esc(nh.person.fornamn)}`,
                       ld && `Longest drive${d.longest_hal ? ' (' + d.longest_hal + ')' : ''}: ${esc(ld.person.fornamn)}`].filter(Boolean).join(' · ');
        return `<div class="round">
          <div><div class="rn">R${d.ordning} · ${esc(d.namn)}</div>
          <div class="meta">${d.banversion?.bana ? `<a class="namn" href="#/bana/${d.banversion.bana.id}">${esc(d.banversion.bana.namn)}</a>` : ''} · ${datum(d.datum)}</div></div>
          <div class="win">${vNamn ? `<div class="rn"><a class="namn" href="#/spelare/${vinnare.person_id}">${esc(vNamn)}</a></div><div class="meta">${fmt(vinnare.poang)} p${tht.klar ? '' : ' · leder'}</div>` : kand ? `<div class="rn"><a class="namn" href="#/spelare/${kand.person_id}">${esc(kand.fornamn)}</a></div><div class="meta">vann · poäng saknas</div>` : '<div class="meta">Inga resultat</div>'}</div>
          ${extra ? `<div class="extra">${extra}</div>` : ''}
          <div class="mm-plats" data-did="${d.id}"></div>
        </div>`;
      }).join('')}
    </div>

    <section id="arsstat"></section>

    <section class="minikarta">
      <div class="row-between"><h2>Karta</h2><a href="#/karta/${artal}" class="lank-pil">Större karta ›</a></div>
      <div class="karta mini" id="minikarta"></div>
    </section>`;

  miniKarta(document.getElementById('minikarta'), artal);
  document.getElementById('ar').onchange = (e) => { location.hash = `#/ar/${e.target.value}`; };
  document.getElementById('prev').onclick = () => { location.hash = `#/ar/${lista[idx - 1].artal}`; };
  document.getElementById('next').onclick = () => { location.hash = `#/ar/${lista[idx + 1].artal}`; };

  if (!utanKort) drawKurva(res, kurva, ordningar.length);
  if (!utanKort) arsStatistik(document.getElementById('arsstat'), tht.nr).catch(() => {});
  if (!utanKort) arsMinnen(delt.map((d) => d.id)).catch(() => {});
}

// Minnesvärda moment under varje deltävling (hopfällt, antal i rubriken). Admin/markör kan skriva även i avslutade THT.
async function arsMinnen(dids) {
  const data = await hamtaMinnen(dids);
  const skriv = kanSkriva();
  document.querySelectorAll('.mm-plats').forEach((plats) => {
    const did = Number(plats.dataset.did);
    const n = data.kom.filter((k) => k.deltavling_id === did).length;
    if (!n && !skriv) return;
    plats.innerHTML = `<details class="mm-ar"><summary>Minnesvärda moment <span class="mm-antal">${n ? `(${n})` : ''}</span></summary><div class="mm-inne"></div></details>`;
    const det = plats.querySelector('details');
    det.addEventListener('toggle', () => {
      if (!det.open || det.dataset.ritad) return;
      det.dataset.ritad = '1';
      minnenWidget(det.querySelector('.mm-inne'), did, data, { onAndrat: (k) => { det.querySelector('.mm-antal').textContent = k.length ? `(${k.length})` : ''; } });
    });
  });
}


// Resultattabell + THT-grafen, används av både årssidan och leaderboarden.
// Visas så länge THT:n inte är avslutad – då utses ingen vinnare.
function pagarRuta(res) {
  const ledare = res.filter((r) => r.placering === 1);
  return `<div class="pagar"><strong>Pågår</strong> – ingen vinnare utses förrän THT:n är avslutad.${ledare.length ? ` Leder just nu: ${ledare.map((r) => `<a class="namn" href="#/spelare/${r.person_id}">${esc(r.fornamn)}</a>`).join(', ')} (${fmt(ledare[0].poang)} p).` : ''}</div>`;
}

function resultatOchGraf(res, ordningar, perRunda, klar = true, utanGraf = false) {
  const rundorFor = (r) => Object.values(perRunda[r.person_id] ?? {});
  // Poäng mot handicap = poäng − 2 per spelat hål (samma mått som "Mot handicap" i grafen).
  const motHcp = (r) => { const hal = rundorFor(r).reduce((a, x) => a + (x.antal_hal ?? 0), 0); return hal ? r.poang - 2 * hal : null; };
  const motHcpText = (r) => { const v = motHcp(r); return v === null ? '–' : v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '±0'; };
  // Spel-HCP är alltid ett heltal – visa senaste rundans i stället för årets snitt.
  const senasteHcp = (r) => { const rs = rundorFor(r).filter((x) => x.spel_hcp != null).sort((a, b) => b.ordning - a.ordning); return rs[0]?.spel_hcp ?? (r.snitt_spel_hcp == null ? null : Math.round(r.snitt_spel_hcp)); };
  return `
    <h2>Resultat</h2>
    <div class="tablewrap"><table>
      <thead><tr>
        <th>#</th><th class="l">Spelare</th><th>Poäng</th><th title="Poäng mot handicap: poäng minus 2 per spelat hål">Mot HCP</th>
        ${ordningar.map((o) => `<th class="hide-sm">R${o}</th>`).join('')}
        <th>Slag</th><th class="hide-sm">Puttar/hål</th><th class="hide-sm">Spel-HCP</th>
      </tr></thead>
      <tbody>
        ${res.map((r) => `<tr>
          <td>${r.placering}</td>
          <td class="l ${klar && r.placering === 1 ? 'win' : ''}"><a class="namn" href="#/spelare/${r.person_id}">${esc(r.fornamn)}</a></td>
          <td><strong>${fmt(r.poang)}</strong></td>
          <td class="${motHcp(r) > 0 ? 'plus' : ''}">${motHcpText(r)}</td>
          ${ordningar.map((o) => { const x = perRunda[r.person_id]?.[o]; return `<td class="hide-sm ${x ? '' : 'dim'}">${x ? `<a class="namn" href="#/runda/${x.runda_id}" title="Scorekort">${fmt(x.poang)}</a>` : '–'}</td>`; }).join('')}
          <td>${fmt(r.slag)}</td>
          <td class="hide-sm">${fmt(r.puttar_per_hal, 2)}</td>
          <td class="hide-sm">${fmt(senasteHcp(r))}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>

    ${utanGraf ? '' : `    <h2>THT-grafen</h2>
    <div class="chartcard">
      <div class="seg" role="group" aria-label="Visa">
        <button data-mode="hcp" class="on">Mot handicap</button>
        <button data-mode="poang">Poäng</button>
      </div>
      <div class="chartbox" id="kurvabox"><div class="tip" id="kurvatip" hidden></div></div>
      <div class="chips" id="chips"></div>
      <p class="hint" id="charthint"></p>
    </div>`}`;
}

// ---------- THT-grafen (egen SVG, inga beroenden) ----------
function drawKurva(res, kurva, antalRundor, state = {}) {
  const namn = Object.fromEntries(res.map((r) => [r.person_id, r.fornamn]));
  const perP = {};
  kurva.forEach((k) => (perP[k.person_id] ??= []).push(k));
  const ordning = res.map((r) => r.person_id).filter((pid) => perP[pid]);
  const maxHal = Math.max(...kurva.map((k) => k.hal_i_tht));
  let mode = state.mode || 'hcp';
  let valda = state.valda ? state.valda.filter((p) => ordning.includes(p)) : ordning.slice(0, 3);
  const spara = () => { state.mode = mode; state.valda = valda; };
  document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x.dataset.mode === mode));
  const box = document.getElementById('kurvabox');
  const chipsEl = document.getElementById('chips');
  const tip = document.getElementById('kurvatip');
  const val = (k) => (mode === 'hcp' ? k.poang_ack_mot_hcp : k.poang_ack);

  function render() {
    const W = box.clientWidth, H = box.clientHeight;
    const m = { l: 40, r: 60, t: 12, b: 26 };
    const all = kurva.map(val);
    let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
    // Minst 8 poäng i höjd, så att få spelade hål inte ger en skala med bråktal.
    if (hi - lo < 8) { const mitt = (hi + lo) / 2; lo = Math.min(lo, Math.floor(mitt - 4)); hi = Math.max(hi, Math.ceil(mitt + 4)); }
    const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    const step = Math.max(1, Math.round(niceStep((hi - lo) / 5)));
    // x-axeln täcker hela påbörjade rundor (18 hål), så att en pågående runda inte sträcks ut.
    const xMax = Math.max(18, Math.ceil(maxHal / 18) * 18);
    const x = (h) => m.l + ((h - 1) / (xMax - 1)) * (W - m.l - m.r);
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
    let g = '';
    for (let i = Math.ceil(lo / step); i * step <= hi; i++) {
      const v = i * step;
      g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? 'rgba(242,232,213,0.25)' : 'rgba(242,232,213,0.06)'}"/>
            <text x="${m.l - 6}" y="${y(v)}" fill="${CREAM3}" font-size="11" text-anchor="end" dominant-baseline="middle">${v > 0 && mode === 'hcp' ? '+' : ''}${v}</text>`;
    }
    for (let r = 1; r <= Math.ceil(maxHal / 18); r++) {
      const start = (r - 1) * 18 + 1;
      if (r > 1) g += `<line x1="${x(start - 0.5)}" x2="${x(start - 0.5)}" y1="${m.t}" y2="${H - m.b}" stroke="${LINE}" stroke-dasharray="3 4"/>`;
      g += `<text x="${x(start + 8.5)}" y="${H - 8}" fill="${CREAM3}" font-size="11" text-anchor="middle">R${r}</text>`;
    }
    // En ensam punkt (bara ett hål spelat) ritas som en prick via runda linjeändar.
    const path = (pid) => perP[pid].map((k, i) => `${i ? 'L' : 'M'}${x(k.hal_i_tht).toFixed(1)},${y(val(k)).toFixed(1)}`).join('') + (perP[pid].length === 1 ? 'l0.01,0' : '');
    const muted = ordning.filter((p) => !valda.includes(p)).map((p) => `<path d="${path(p)}" fill="none" stroke="${MUTED}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
    // slutetiketter, med enkel krock-hantering
    const ends = valda.map((p, i) => { const s = perP[p]; const k = s[s.length - 1]; return { p, i, x: x(k.hal_i_tht), y: y(val(k)) }; }).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    const sel = valda.map((p, i) => `<path d="${path(p)}" fill="none" stroke="${SERIES[i]}" stroke-width="${perP[p].length === 1 ? 7 : 2}" stroke-linejoin="round" stroke-linecap="round"/>`).join('')
      + ends.map((e) => `<text x="${e.x + 6}" y="${e.y}" fill="${CREAM}" font-size="12" font-weight="600" dominant-baseline="middle">${esc(namn[e.p])}</text>`).join('');
    box.querySelector('svg')?.remove();
    box.insertAdjacentHTML('afterbegin', `<svg width="${W}" height="${H}" role="img" aria-label="THT-grafen">
      ${g}${muted}${sel}<line id="cross" y1="${m.t}" y2="${H - m.b}" stroke="${CREAM3}" visibility="hidden"/><g id="dots"></g></svg>`);
    const svg = box.querySelector('svg');
    const cross = svg.querySelector('#cross'), dots = svg.querySelector('#dots');
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      const h = Math.max(1, Math.min(maxHal, Math.round(1 + ((px - m.l) / (W - m.l - m.r)) * (xMax - 1))));
      cross.setAttribute('x1', x(h)); cross.setAttribute('x2', x(h)); cross.setAttribute('visibility', 'visible');
      const rows = ordning.map((p) => ({ p, k: perP[p].find((k) => k.hal_i_tht === h) })).filter((r) => r.k).sort((a, b) => val(b.k) - val(a.k));
      dots.innerHTML = rows.filter((r) => valda.includes(r.p)).map((r) => `<circle cx="${x(h)}" cy="${y(val(r.k))}" r="4" fill="${SERIES[valda.indexOf(r.p)]}" stroke="${'#1c1a17'}" stroke-width="2"/>`).join('');
      tip.innerHTML = `<div class="tt-title">Hål ${h} · R${Math.ceil(h / 18)} hål ${((h - 1) % 18) + 1}</div>` + rows.map((r) => {
        const vi = valda.indexOf(r.p); const v = val(r.k);
        return `<div class="tt-row ${vi >= 0 ? 'on' : ''}"><span class="dot" style="background:${vi >= 0 ? SERIES[vi] : MUTED}"></span>${esc(namn[r.p])}<b>${mode === 'hcp' && v > 0 ? '+' : ''}${v}</b></div>`;
      }).join('');
      tip.hidden = false;
      const tw = tip.offsetWidth;
      tip.style.left = `${Math.min(W - tw, Math.max(0, x(h) + (x(h) > W / 2 ? -tw - 12 : 12)))}px`;
      tip.style.top = `${m.t}px`;
    };
    const leave = () => { cross.setAttribute('visibility', 'hidden'); dots.innerHTML = ''; tip.hidden = true; };
    svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move); svg.addEventListener('pointerleave', leave);

    chipsEl.innerHTML = ordning.map((pid) => {
      const vi = valda.indexOf(pid);
      return `<button class="chip ${vi >= 0 ? 'on' : ''}" data-pid="${pid}" aria-pressed="${vi >= 0}">
        <span class="dot" style="${vi >= 0 ? `background:${SERIES[vi]}` : ''}"></span>${esc(namn[pid])}</button>`;
    }).join('');
    document.getElementById('charthint').textContent =
      (mode === 'hcp' ? 'Ackumulerat över/under 2 poäng per hål (spelat på handicap = 0). ' : 'Ackumulerade poäng. ')
      + 'Tryck på namn för att markera (max 3).';
  }
  function niceStep(raw) { const p = 10 ** Math.floor(Math.log10(raw)); const n = raw / p; return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p; }

  chipsEl.onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    const pid = Number(b.dataset.pid);
    if (valda.includes(pid)) valda = valda.filter((v) => v !== pid);
    else { valda.push(pid); if (valda.length > 3) valda.shift(); }
    spara(); render();
  };
  document.querySelectorAll('.seg button').forEach((b) => b.onclick = () => {
    mode = b.dataset.mode;
    document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
    spara(); render();
  });
  window.onresize = () => document.getElementById('kurvabox') && render();
  render();
}

// ---------- startsida ----------
let startTimer = null;
const isoDag = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusDagar = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDag(d); };
const datumLang = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });

async function renderStart(navId) {
  const [thts, delt] = await Promise.all([
    api('tht?select=nr,artal,ort,start,klar&nr=gt.0&order=nr', { fresh: true }),   // THT 0 = övningen
    api('deltavling?select=tht_nr,datum&tht_nr=gt.0', { fresh: true }),
  ]);
  if (!aktuell(navId)) return;

  // Första och sista dag per THT: planerat startdatum eller deltävlingarnas datum.
  const dagar = {};
  delt.forEach((d) => { if (d.datum) (dagar[d.tht_nr] ??= []).push(d.datum); });
  const idag = isoDag(new Date());
  const period = thts.map((t) => {
    const ds = (dagar[t.nr] || []).sort();
    const fran = t.start || ds[0] || null;
    const till = ds.length ? ds[ds.length - 1] : (fran ? plusDagar(fran, 2) : null);
    return { ...t, fran, till: till && till < fran ? fran : till };
  }).filter((t) => t.fran);
  const pagar = period.find((t) => t.fran <= idag && idag <= t.till);
  const nasta = period.filter((t) => t.fran > idag).sort((a, b) => a.fran.localeCompare(b.fran))[0];
  const senast = period.filter((t) => t.till < idag).sort((a, b) => b.till.localeCompare(a.till))[0];
  const ar1 = thts.length ? Math.min(...thts.map((t) => t.artal)) : 1998;
  // Regerande mästare = vinnaren i senast avslutade THT.
  const senastKlar = thts.filter((t) => t.klar).sort((a, b) => b.artal - a.artal)[0];
  const mastare = senastKlar ? await api(`v_tht_resultat?tht_nr=eq.${senastKlar.nr}&placering=eq.1&select=fornamn,poang`, { fresh: true }).catch(() => []) : [];
  if (!aktuell(navId)) return;

  const datumspann = (t) => {
    if (t.fran === t.till) return datumLang(t.fran);
    const [a, b] = [new Date(t.fran + 'T12:00:00'), new Date(t.till + 'T12:00:00')];
    const forsta = a.getMonth() === b.getMonth() ? a.getDate() : a.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' });
    return `${forsta}–${datumLang(t.till)}`;
  };

  let huvud;
  if (pagar) {
    const dag = Math.round((new Date(idag) - new Date(pagar.fran)) / 864e5) + 1;
    huvud = `<div class="nasta live">
      <div class="kicker"><span class="dot" aria-hidden="true"></span> Pågår nu · dag ${dag}</div>
      <div class="nasta-ort">${esc(pagar.ort || 'THT ' + pagar.nr)}</div>
      <div class="nasta-meta">THT ${pagar.nr} · ${datumspann(pagar)}</div>
      <div class="cta"><a class="btn" href="#/leaderboard">Leaderboard</a><a class="btn ghost" href="#/mata">Mata in</a></div>
    </div>`;
  } else if (nasta) {
    huvud = `<div class="nasta">
      <div class="kicker">Nästa THT</div>
      <div class="nasta-ort">${esc(nasta.ort || 'Ort ej bestämd')}</div>
      <div class="nasta-meta">THT ${nasta.nr} · ${datumspann(nasta)}</div>
      <div class="nedrakning" role="timer" aria-live="off">
        ${['dagar', 'tim', 'min', 'sek'].map((e) => `<div class="enhet"><span class="tal" data-e="${e}">–</span><span class="etikett">${e}</span></div>`).join('')}
      </div>
    </div>`;
  } else {
    huvud = `<div class="nasta tom">
      <div class="kicker">Nästa THT</div>
      <div class="nasta-ort">Inte bestämd ännu</div>
      <div class="nasta-meta">Nedräkningen startar när nästa THT har ett datum.</div>
    </div>`;
  }

  app.innerHTML = `
    <section class="hero">
      <img src="logo.svg" alt="" class="hero-logo" aria-hidden="true">
      <h1 class="sr-only">The Helkväll Tour</h1>
      <p class="hero-sub">Sedan ${ar1}${senast ? ` · ${senast.nr} upplagor` : ''}</p>
    </section>
    ${huvud}
    ${senastKlar && mastare.length ? `<a class="plakett" href="#/ar/${senastKlar.artal}">
      <span class="plakett-rubrik">Regerande mästare</span>
      <span class="plakett-namn">${mastare.map((m) => esc(m.fornamn)).join(' & ')} <span class="plakett-sep">·</span> ${esc(senastKlar.ort)} ${senastKlar.artal}</span>
    </a>` : (senast && !pagar ? `<p class="senast">Senast: <a href="#/ar/${senast.artal}">${esc(senast.ort)} ${senast.artal}</a></p>` : '')}`;

  if (nasta && !pagar) {
    const mal = new Date(nasta.fran + 'T00:00:00').getTime();
    const tick = () => {
      if (!aktuell(navId)) { clearInterval(startTimer); return; }
      let ms = mal - Date.now();
      if (ms <= 0) { clearInterval(startTimer); route(); return; }
      const v = { dagar: Math.floor(ms / 864e5), tim: Math.floor(ms / 36e5) % 24, min: Math.floor(ms / 6e4) % 60, sek: Math.floor(ms / 1e3) % 60 };
      app.querySelectorAll('.nedrakning .tal').forEach((el) => { el.textContent = el.dataset.e === 'dagar' ? v.dagar : String(v[el.dataset.e]).padStart(2, '0'); });
    };
    tick();
    startTimer = setInterval(tick, 1000);
  }
}

// ---------- leaderboard (senaste THT, uppdateras automatiskt) ----------
let lbTimer = null;
const lbState = {};
const LB_INTERVALL = 30_000;

async function renderLeaderboard(navId) {
  app.innerHTML = '<p class="muted center">Laddar leaderboard …</p>';
  const senaste = await api('deltavling?select=tht_nr&tht_nr=gt.0&order=tht_nr.desc&limit=1', { fresh: true });
  if (!aktuell(navId)) return;
  if (!senaste.length) { app.innerHTML = '<p class="muted center">Ingen THT inlagd ännu.</p>'; return; }
  const nr = senaste[0].tht_nr;
  const [tht] = await api(`tht?nr=eq.${nr}&select=nr,artal,ort,klar`, { fresh: true });
  if (!aktuell(navId)) return;
  app.innerHTML = `
    <h1>${esc(tht.ort)} ${tht.artal}</h1>
    <p class="sub">THT ${tht.nr} · ${tht.klar ? 'Avslutad' : 'Pågår'} · <span id="lbtid">–</span></p>
    <div id="lb"></div>`;

  let senastJson = null;
  async function hamta() {
    const f = { fresh: true };
    const [res, rundor, kurva, delt] = await Promise.all([
      api(`v_tht_resultat?tht_nr=eq.${nr}&order=placering`, f),
      api(`v_runda?tht_nr=eq.${nr}&select=runda_id,person_id,ordning,poang,slag,antal_hal,spel_hcp`, f),
      api(`v_tht_kurva?tht_nr=eq.${nr}&order=hal_i_tht&select=person_id,hal_i_tht,poang_ack,poang_ack_mot_hcp`, f),
      api(`deltavling?tht_nr=eq.${nr}&order=ordning&select=ordning`, f),
    ]);
    if (!aktuell(navId)) return;
    const tid = document.getElementById('lbtid');
    if (tid) tid.textContent = 'uppdaterad ' + new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    const json = JSON.stringify([res, rundor, kurva]);
    if (json === senastJson) return; // inget nytt – rita inte om
    senastJson = json;
    const lb = document.getElementById('lb');
    if (!res.length) { lb.innerHTML = '<p class="muted center">Inga resultat ännu – leaderboarden fylls på när första hålet är inmatat.</p>'; return; }
    const ordningar = delt.map((d) => d.ordning);
    const perRunda = {};
    rundor.forEach((r) => { (perRunda[r.person_id] ??= {})[r.ordning] = r; });
    const tieNote = res.length > 1 && res[0].poang === res[1].poang ? '<p class="hint">Lika poäng – lägst spel-HCP vinner.</p>' : '';
    lb.innerHTML = (tht.klar ? '' : pagarRuta(res)) + tieNote + resultatOchGraf(res, ordningar, perRunda, tht.klar);
    if (kurva.length) drawKurva(res, kurva, ordningar.length, lbState);
  }
  await hamta();
  lbTimer = setInterval(() => {
    if (!aktuell(navId)) { clearInterval(lbTimer); return; }
    if (document.visibilityState === 'visible') hamta().catch((e) => console.warn('Leaderboard:', e));
  }, LB_INTERVALL);
}

// ---------- all-time ----------
const KOLUMNER = [
  { k: 'fornamn', t: 'Spelare', l: true },
  { k: 'tht', t: 'THT' },
  { k: 'segrar', t: 'Segrar', title: 'Vunna THT' },
  { k: 'dSegrar', t: 'Del&shy;tävl.', title: 'Vunna deltävlingar' },
  { k: 'pall', t: 'Pall', sm: true },
  { k: 'rundor', t: 'Rundor', sm: true },
  { k: 'snittPoang', t: 'Poäng/​runda', d: 1 },
  { k: 'snittSlag', t: 'Slag/​runda', d: 1, asc: true },
  { k: 'puttarHal', t: 'Puttar/​hål', d: 2, asc: true, sm: true },
  { k: 'bastaRunda', t: 'Bästa runda', sm: true },
  { k: 'totalPoang', t: 'Poäng totalt', sm: true },
  { k: 'totalSlag', t: 'Slag totalt', sm: true, title: 'Alla slag i alla rundor (tak par + 5 per hål)' },
];
let sortKey = 'segrar', sortAsc = false;
const PRISKOL = [{ k: 'fornamn', t: 'Spelare', l: true }, { k: 'narmast', t: 'Närmast hål' }, { k: 'longest', t: 'Longest drive' }, { k: 'tot', t: 'Totalt' }];
const prisSort = { k: 'tot', asc: false };
let visaAllaBanor = false;   // All-time: topp 10 eller alla banor
const sorteraPris = (rows) => rows.slice().sort((a, b) => {
  const c = prisSort.k === 'fornamn' ? a.fornamn.localeCompare(b.fornamn, 'sv') : (a[prisSort.k] - b[prisSort.k]) || (a.tot - b.tot);
  return prisSort.asc ? c : -c;
});

// Underflikar i All-time – nya statistiktabeller läggs till här
const ALLTIME_FLIKAR = [
  { id: 'spelare', t: 'Spelare' },
  ...STAT_FLIKAR.filter((f) => f.id === 'totalt'),
  { id: 'vinnare', t: 'Vinnare' },
  { id: 'priser', t: 'Priser' },
  { id: 'banor', t: 'Banor' },
  ...STAT_FLIKAR.filter((f) => f.id !== 'totalt'),
];
const alltimeHuvud = (flik) => `
      <h1>All-time</h1>
      <nav class="underflikar" aria-label="Delar av All-time">${ALLTIME_FLIKAR.map((f) => `<a href="#/alltime/${f.id}" class="${f.id === flik ? 'on' : ''}"${f.id === flik ? ' aria-current="page"' : ''}>${f.t}</a>`).join('')}</nav>`;
async function renderAlltime(flik) {
  if (!ALLTIME_FLIKAR.some((f) => f.id === flik)) flik = 'spelare';
  const myNav = nuNav();
  if (STAT_FLIKAR.some((f) => f.id === flik)) {   // statistikflikarna hämtar sin egen data
    app.innerHTML = `${alltimeHuvud(flik)}<div id="statflik"><p class="muted center">Laddar …</p></div>`;
    const el = document.getElementById('statflik');
    await renderStatFlik(flik, el);
    return;
  }
  if (!aktuell(myNav)) return; app.innerHTML = `<p class="muted center">Laddar …</p>`;
  const [res, rundor, thtKlar, priser, utanKort] = await Promise.all([
    api('v_tht_resultat?select=person_id,fornamn,artal,placering,poang,slag,rundor,puttar_per_hal'),
    allaRader('v_runda?select=person_id,fornamn,artal,poang,slag,antal_hal,puttar,hal_med_puttar,placering&order=runda_id'),
    api('tht?select=artal,klar'),
    api('pris?select=typ,person_id,person(fornamn)'),
    api('deltavling?vinnare_utan_kort=not.is.null&select=vinnare_utan_kort,tht(artal)'),
  ]);
  const [banTopp, allaBanor] = await Promise.all([banTopplista().catch(() => []), banLista().catch(() => [])]);
  // Topplista närmast hål / longest drive
  const prisTopp = Object.values(priser.reduce((acc, x) => {
    const r = (acc[x.person_id] ??= { id: x.person_id, fornamn: x.person?.fornamn ?? '?', narmast: 0, longest: 0 });
    r[x.typ]++; return acc;
  }, {})).map((r) => ({ ...r, tot: r.narmast + r.longest })).sort((a, b) => b.tot - a.tot || b.longest - a.longest || a.fornamn.localeCompare(b.fornamn, 'sv'));
  // Vinnare utses först när THT:n är avslutad (Admin → THT → Avsluta).
  const klarAr = new Set(thtKlar.filter((t) => t.klar).map((t) => t.artal));
  const p = {};
  const get = (r) => (p[r.person_id] ??= { id: r.person_id, fornamn: r.fornamn, tht: 0, segrar: 0, dSegrar: 0, pall: 0, rundor: 0, pSum: 0, sSum: 0, sN: 0, putt: 0, puttN: 0, bastaRunda: null, totalPoang: 0, totalSlag: 0, vinstAr: [] });
  res.forEach((r) => {
    const x = get(r); x.tht++;
    if (klarAr.has(r.artal) && r.placering === 1) { x.segrar++; x.vinstAr.push(r.artal); }
    if (klarAr.has(r.artal) && r.placering <= 3) x.pall++;
  });
  rundor.filter((r) => r.antal_hal > 0).forEach((r) => {
    const x = get(r); x.rundor++; x.pSum += r.poang; x.totalPoang += r.poang; x.totalSlag += r.slag ?? 0;
    if (klarAr.has(r.artal) && r.placering === 1) x.dSegrar++;
    if (r.antal_hal === 18) { x.sSum += r.slag; x.sN++; }
    x.putt += r.puttar ?? 0; x.puttN += r.hal_med_puttar ?? 0;
    if (x.bastaRunda === null || r.poang > x.bastaRunda) x.bastaRunda = r.poang;
  });
  // Deltävlingar där scorekorten saknas men vinnaren är känd (t.ex. 1999)
  utanKort.forEach((d) => { if (klarAr.has(d.tht?.artal) && p[d.vinnare_utan_kort]) p[d.vinnare_utan_kort].dSegrar++; });
  const rows = Object.values(p).filter((x) => x.rundor > 0).map((x) => ({
    ...x, snittPoang: x.pSum / x.rundor, snittSlag: x.sN ? x.sSum / x.sN : null, puttarHal: x.puttN ? x.putt / x.puttN : null,
  }));
  const tvaan = {};
  res.forEach((r) => { if (r.placering === 2) tvaan[r.artal] = Math.max(tvaan[r.artal] ?? 0, Number(r.poang)); });
  const vinnare = res.filter((r) => r.placering === 1 && klarAr.has(r.artal)).sort((a, b) => b.artal - a.artal).map((v) => ({
    ...v,
    prRunda: v.slag != null && v.rundor ? v.poang / v.rundor : null,
    slRunda: v.slag != null && v.rundor ? v.slag / v.rundor : null,
    marginal: tvaan[v.artal] != null ? v.poang - tvaan[v.artal] : null,
  }));
  // Segerstatistik per spelare (F-37)
  const segerSpelare = Object.values(vinnare.reduce((acc, v) => {
    const x = (acc[v.person_id] ??= { id: v.person_id, fornamn: v.fornamn, n: 0, bastaP: null, bastaS: null, bastaPutt: null });
    x.n++;
    if (v.prRunda != null) x.bastaP = Math.max(x.bastaP ?? -1, v.prRunda);
    if (v.slRunda != null) x.bastaS = Math.min(x.bastaS ?? 999, v.slRunda);
    if (v.puttar_per_hal != null) x.bastaPutt = Math.min(x.bastaPutt ?? 99, Number(v.puttar_per_hal));
    return acc;
  }, {})).sort((a, b) => b.n - a.n || (b.bastaP ?? 0) - (a.bastaP ?? 0));
  const pagar = [...new Set(res.map((r) => r.artal))].filter((a) => !klarAr.has(a)).sort();

  const draw = () => {
    rows.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (va === null) return 1; if (vb === null) return -1;
      let c = typeof va === 'string' ? va.localeCompare(vb, 'sv') : va - vb;
      if (c === 0 && sortKey === 'segrar') c = a.dSegrar - b.dSegrar;   // lika THT-segrar → deltävlingssegrar avgör
      return sortAsc ? c : -c;
    });
    if (!aktuell(myNav)) return; app.innerHTML = `
${alltimeHuvud(flik)}
      <p class="sub">${new Set(res.map((r) => r.artal)).size} THT med resultat · ${rundor.filter((r) => r.antal_hal > 0).length} rundor</p>
`
      + (flik === 'spelare' ? `      <div class="tablewrap"><table class="radbryt">
        <thead><tr>${KOLUMNER.map((c) => `<th class="sortable ${c.l ? 'l' : ''} ${c.sm ? 'hide-sm' : ''} ${sortKey === c.k ? 'sorted' : ''}" data-k="${c.k}" ${c.title ? `title="${c.title}"` : ''} aria-sort="${sortKey === c.k ? (sortAsc ? 'ascending' : 'descending') : 'none'}">${c.t}${sortKey === c.k ? (sortAsc ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${KOLUMNER.map((c) => `<td class="${c.l ? 'l' : ''} ${c.sm ? 'hide-sm' : ''}">${c.k === 'fornamn' ? `<a class="namn" href="#/spelare/${r.id}">${esc(r.fornamn)}</a>` : c.l ? esc(r[c.k]) : fmt(r[c.k], c.d || 0)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <p class="hint">Tryck på en rubrik för att sortera. Segrar = vunna THT, Deltävl. = vunna deltävlingar (lika poäng → lägst spel-HCP). Slag/runda räknas bara på rundor med alla 18 hål, med tak par + 5. Puttar/hål är snittet av alla ifyllda puttar – tomma hål räknas inte.${pagar.length ? ` Segrar och pall räknas inte för ${pagar.join(', ')} förrän THT:n är avslutad.` : ''}</p>

` : '')
      + (flik === 'vinnare' ? `      <h2>Vinnare</h2>
      <div class="tablewrap"><table class="radbryt">
        <thead><tr><th class="l">År</th><th class="l">Vinnare</th><th>Poäng</th><th>Poäng/​runda</th><th>Slag/​runda</th><th class="hide-sm">Puttar/​hål</th><th title="Poäng före tvåan">Mar&shy;ginal</th></tr></thead>
        <tbody>${vinnare.map((v) => `<tr><td class="l"><a href="#/ar/${v.artal}">${v.artal}</a></td><td class="l win"><a class="namn" href="#/spelare/${v.person_id}">${esc(v.fornamn)}</a></td><td>${fmt(v.poang)}</td><td>${fmt(v.prRunda, 1)}</td><td>${fmt(v.slRunda, 1)}</td><td class="hide-sm">${fmt(v.puttar_per_hal, 2)}</td><td>${v.marginal == null ? '–' : '+' + fmt(v.marginal)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="hint">Poäng och slag per runda under det vinnande året (slag med tak par + 5). Marginal = poäng före tvåan.</p>

      <h2>Segrar per spelare</h2>
      <div class="tablewrap"><table class="radbryt">
        <thead><tr><th class="l">Spelare</th><th>Segrar</th><th>Bästa poäng/​runda</th><th>Bästa slag/​runda</th><th class="hide-sm">Bästa puttar/​hål</th></tr></thead>
        <tbody>${segerSpelare.map((x) => `<tr><td class="l"><a class="namn" href="#/spelare/${x.id}">${esc(x.fornamn)}</a></td><td><strong>${x.n}</strong></td><td>${fmt(x.bastaP, 1)}</td><td>${fmt(x.bastaS, 1)}</td><td class="hide-sm">${fmt(x.bastaPutt, 2)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="hint">Bästa värdet under något av de vunna åren. År utan scorekort (1999) räknas bara i antalet segrar.</p>

` : '')
      + (flik === 'priser' ? `      <h2>Närmast hål och longest drive</h2>
      <div class="tablewrap"><table>
        <thead><tr>${PRISKOL.map((c) => `<th class="sortable ${c.l ? 'l' : ''} ${prisSort.k === c.k ? 'sorted' : ''}" data-pk="${c.k}" aria-sort="${prisSort.k === c.k ? (prisSort.asc ? 'ascending' : 'descending') : 'none'}">${c.t}${prisSort.k === c.k ? (prisSort.asc ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
        <tbody>${sorteraPris(prisTopp).map((r) => `<tr><td class="l"><a class="namn" href="#/spelare/${r.id}">${esc(r.fornamn)}</a></td><td>${r.narmast}</td><td>${r.longest}</td><td><strong>${r.tot}</strong></td></tr>`).join('')}</tbody>
      </table></div>
      <p class="hint">Vunna priser alla år – tryck på en rubrik för att sortera. Vissa år saknas uppgifter om priserna.</p>

` : '')
      + (flik === 'banor' ? `      ${banTopp.length || allaBanor.length ? `<h2>${visaAllaBanor ? 'Alla banor' : 'Bästa banorna'}</h2>
      <div class="tablewrap"><table class="bantabell radbryt">
        <thead><tr><th>#</th><th class="l">Bana</th><th>Betyg</th><th class="hide-sm">Antal betyg</th>${visaAllaBanor ? '<th class="hide-sm">Spelade gånger</th>' : ''}</tr></thead>
        <tbody>${(visaAllaBanor ? allaBanor : banTopp.slice(0, 10)).map((b, i) => `<tr><td>${b.n >= 3 ? i + 1 : ''}</td><td class="l"><a class="namn" href="#/bana/${b.id}">${esc(b.namn)}</a></td><td class="${b.n >= 3 ? '' : 'dim'}">${b.snitt == null ? '–' : `<span class="bt-siffra">${fmt(b.snitt, 1)} </span>${stjarnor(b.snitt)}`}</td><td class="hide-sm">${b.n}</td>${visaAllaBanor ? `<td class="hide-sm">${b.spelad}</td>` : ''}</tr>`).join('')}</tbody>
      </table></div>
      <button class="link visa-alla" type="button" id="allabanor" aria-expanded="${visaAllaBanor}">${visaAllaBanor ? 'Visa bara de tio bästa ▴' : `Visa alla banor (${allaBanor.length}) ▾`}</button>
      <p class="hint">Deltagarnas betyg 1–5, snitt över alla år. Placering bara för banor med minst 3 betyg${visaAllaBanor ? ' – övriga visas dämpade, utan placering' : ''}. Tryck på en bana för mer.</p>` : ''}` : '');
    const knappAlla = document.getElementById('allabanor');
    if (knappAlla) knappAlla.onclick = () => { visaAllaBanor = !visaAllaBanor; draw(); };
    app.querySelectorAll('th[data-pk]').forEach((th) => th.onclick = () => {
      const k = th.dataset.pk;
      if (prisSort.k === k) prisSort.asc = !prisSort.asc; else { prisSort.k = k; prisSort.asc = k === 'fornamn'; }
      draw();
    });
    app.querySelectorAll('th.sortable[data-k]').forEach((th) => th.onclick = () => {
      const c = KOLUMNER.find((x) => x.k === th.dataset.k);
      if (sortKey === c.k) sortAsc = !sortAsc; else { sortKey = c.k; sortAsc = !!(c.asc || c.l); }
      draw();
    });
  };
  draw();
}

// Sparad inloggning från före rollerna: hämta rollen först (tyst om nätet saknas).
uppdateraRoll().catch(() => {}).then(route);
