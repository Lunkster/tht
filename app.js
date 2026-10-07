// THT golfapp – statistik (v0.1.0)
// Läser direkt från Supabase-vyerna. Ingen inloggning behövs för att läsa.

const SUPABASE_URL = 'https://nlvgisjssbjethumvgdz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3wzcVvDgcoupfWSqAis4eg_bz2e6jiG'; // publik nyckel, skyddet är RLS

const SERIES = ['#3987e5', '#d95926', '#199e70'];
const MUTED = 'rgba(242, 232, 213, 0.22)';
const CREAM = '#f2e8d5', CREAM2 = '#c9bfa9', CREAM3 = '#8f8676', LINE = '#3a3530';

const app = document.getElementById('app');
const cache = new Map();

// ---------- data ----------
async function api(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Accept: 'application/json' },
  }).then(async (r) => {
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return r.json();
  });
  cache.set(path, p);
  try { return await p; } catch (e) { cache.delete(path); throw e; }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v)) ? '–' : Number(v).toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d });
const datum = (d) => new Date(d + 'T12:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });

// ---------- routing ----------
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [page, arg] = h.split('/');
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.route === (page === 'alltime' ? 'alltime' : 'ar')));
  window.onresize = null;
  if (page === 'alltime') return renderAlltime().catch(showError);
  return renderYear(arg ? Number(arg) : null).catch(showError);
}
window.addEventListener('hashchange', route);

function showError(e) {
  console.error(e);
  app.innerHTML = `<div class="err"><strong>Kunde inte hämta data.</strong><br><span class="muted">${esc(e.message)}</span></div>`;
}

// ---------- år ----------
async function renderYear(artal) {
  const thts = await api('tht?select=nr,artal,ort&order=artal');
  const medData = await api('v_tht_resultat?select=artal');
  const arMedData = new Set(medData.map((r) => r.artal));
  const lista = thts.filter((t) => arMedData.has(t.artal));
  if (!artal) artal = lista[lista.length - 1].artal;
  const tht = thts.find((t) => t.artal === artal);
  if (!tht) { location.hash = '#/'; return; }
  const idx = lista.findIndex((t) => t.artal === artal);

  app.innerHTML = `<p class="muted center">Laddar ${artal} …</p>`;
  const [res, rundor, kurva, delt, pris] = await Promise.all([
    api(`v_tht_resultat?tht_nr=eq.${tht.nr}&order=placering`),
    api(`v_runda?tht_nr=eq.${tht.nr}&select=person_id,ordning,poang,slag,antal_hal`),
    api(`v_tht_kurva?tht_nr=eq.${tht.nr}&order=hal_i_tht&select=person_id,hal_i_tht,poang_ack,poang_ack_mot_hcp`),
    api(`deltavling?tht_nr=eq.${tht.nr}&order=ordning&select=id,ordning,namn,datum,narmast_hal,longest_hal,banversion(bana(namn))`),
    api(`pris?select=deltavling_id,typ,person(fornamn)`),
  ]);

  const ordningar = [...new Set(delt.map((d) => d.ordning))];
  const perRunda = {};
  rundor.forEach((r) => { (perRunda[r.person_id] ??= {})[r.ordning] = r; });
  const topp = res.slice(0, 3);
  const tieNote = res.length > 1 && res[0].poang === res[1].poang ? `<p class="hint">Lika poäng – lägst spel-HCP vinner.</p>` : '';

  app.innerHTML = `
    <div class="yearbar">
      <button id="prev" aria-label="Föregående år" ${idx <= 0 ? 'disabled' : ''}>‹</button>
      <select id="ar" aria-label="Välj år">
        ${lista.slice().reverse().map((t) => `<option value="${t.artal}" ${t.artal === artal ? 'selected' : ''}>THT ${t.nr} · ${t.artal}</option>`).join('')}
      </select>
      <button id="next" aria-label="Nästa år" ${idx >= lista.length - 1 ? 'disabled' : ''}>›</button>
    </div>
    <h1>${esc(tht.ort)} ${artal}</h1>
    <p class="sub">THT ${tht.nr} · ${delt.length} deltävlingar · ${res.length} spelare</p>

    <div class="podium">
      ${[1, 0, 2].map((i) => topp[i] ? `
        <div class="pod ${i === 0 ? 'first' : ''}">
          <div class="place">${i + 1}:a</div>
          <div class="name">${esc(topp[i].fornamn)}</div>
          <div class="pts">${fmt(topp[i].poang)} p</div>
        </div>` : '<div></div>').join('')}
    </div>
    ${tieNote}

    <h2>Resultat</h2>
    <div class="tablewrap"><table>
      <thead><tr>
        <th>#</th><th class="l">Spelare</th><th>Poäng</th>
        ${ordningar.map((o) => `<th class="hide-sm">R${o}</th>`).join('')}
        <th>Slag</th><th class="hide-sm">Puttar/r</th><th class="hide-sm">Spel-HCP</th>
      </tr></thead>
      <tbody>
        ${res.map((r) => `<tr>
          <td>${r.placering}</td>
          <td class="l ${r.placering === 1 ? 'win' : ''}">${esc(r.fornamn)}</td>
          <td><strong>${fmt(r.poang)}</strong></td>
          ${ordningar.map((o) => { const x = perRunda[r.person_id]?.[o]; return `<td class="hide-sm ${x ? '' : 'dim'}">${x ? fmt(x.poang) : '–'}</td>`; }).join('')}
          <td>${fmt(r.slag)}</td>
          <td class="hide-sm">${fmt(r.puttar_per_runda, 1)}</td>
          <td class="hide-sm">${fmt(r.snitt_spel_hcp, 1)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>

    <h2>THT-grafen</h2>
    <div class="chartcard">
      <div class="seg" role="group" aria-label="Visa">
        <button data-mode="hcp" class="on">Mot handicap</button>
        <button data-mode="poang">Poäng</button>
      </div>
      <div class="chartbox" id="kurvabox"><div class="tip" id="kurvatip" hidden></div></div>
      <div class="chips" id="chips"></div>
      <p class="hint" id="charthint"></p>
    </div>

    <h2>Deltävlingar</h2>
    <div class="rounds">
      ${delt.map((d) => {
        const vinnare = rundor.filter((r) => r.ordning === d.ordning).sort((a, b) => (b.poang ?? -1) - (a.poang ?? -1))[0];
        const vNamn = vinnare ? res.find((r) => r.person_id === vinnare.person_id)?.fornamn : null;
        const nh = pris.find((p) => p.deltavling_id === d.id && p.typ === 'narmast');
        const ld = pris.find((p) => p.deltavling_id === d.id && p.typ === 'longest');
        const extra = [nh && `Närmast hål${d.narmast_hal ? ' (' + d.narmast_hal + ')' : ''}: ${esc(nh.person.fornamn)}`,
                       ld && `Longest drive${d.longest_hal ? ' (' + d.longest_hal + ')' : ''}: ${esc(ld.person.fornamn)}`].filter(Boolean).join(' · ');
        return `<div class="round">
          <div><div class="rn">R${d.ordning} · ${esc(d.namn)}</div>
          <div class="meta">${esc(d.banversion?.bana?.namn ?? '')} · ${datum(d.datum)}</div></div>
          <div class="win">${vNamn ? `<div class="rn">${esc(vNamn)}</div><div class="meta">${fmt(vinnare.poang)} p</div>` : '<div class="meta">Inga resultat</div>'}</div>
          ${extra ? `<div class="extra">${extra}</div>` : ''}
        </div>`;
      }).join('')}
    </div>`;

  document.getElementById('ar').onchange = (e) => { location.hash = `#/ar/${e.target.value}`; };
  document.getElementById('prev').onclick = () => { location.hash = `#/ar/${lista[idx - 1].artal}`; };
  document.getElementById('next').onclick = () => { location.hash = `#/ar/${lista[idx + 1].artal}`; };

  drawKurva(res, kurva, ordningar.length);
}

// ---------- THT-grafen (egen SVG, inga beroenden) ----------
function drawKurva(res, kurva, antalRundor) {
  const namn = Object.fromEntries(res.map((r) => [r.person_id, r.fornamn]));
  const perP = {};
  kurva.forEach((k) => (perP[k.person_id] ??= []).push(k));
  const ordning = res.map((r) => r.person_id).filter((pid) => perP[pid]);
  const maxHal = Math.max(...kurva.map((k) => k.hal_i_tht));
  let mode = 'hcp';
  let valda = ordning.slice(0, 3);
  const box = document.getElementById('kurvabox');
  const chipsEl = document.getElementById('chips');
  const tip = document.getElementById('kurvatip');
  const val = (k) => (mode === 'hcp' ? k.poang_ack_mot_hcp : k.poang_ack);

  function render() {
    const W = box.clientWidth, H = box.clientHeight;
    const m = { l: 40, r: 60, t: 12, b: 26 };
    const all = kurva.map(val);
    let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
    const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
    const step = niceStep((hi - lo) / 5);
    const x = (h) => m.l + ((h - 1) / Math.max(1, maxHal - 1)) * (W - m.l - m.r);
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
    let g = '';
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? 'rgba(242,232,213,0.25)' : 'rgba(242,232,213,0.06)'}"/>
            <text x="${m.l - 6}" y="${y(v)}" fill="${CREAM3}" font-size="11" text-anchor="end" dominant-baseline="middle">${v > 0 && mode === 'hcp' ? '+' : ''}${v}</text>`;
    }
    for (let r = 1; r <= Math.ceil(maxHal / 18); r++) {
      const start = (r - 1) * 18 + 1;
      if (r > 1) g += `<line x1="${x(start - 0.5)}" x2="${x(start - 0.5)}" y1="${m.t}" y2="${H - m.b}" stroke="${LINE}" stroke-dasharray="3 4"/>`;
      g += `<text x="${x(start + 8.5)}" y="${H - 8}" fill="${CREAM3}" font-size="11" text-anchor="middle">R${r}</text>`;
    }
    const path = (pid) => perP[pid].map((k, i) => `${i ? 'L' : 'M'}${x(k.hal_i_tht).toFixed(1)},${y(val(k)).toFixed(1)}`).join('');
    const muted = ordning.filter((p) => !valda.includes(p)).map((p) => `<path d="${path(p)}" fill="none" stroke="${MUTED}" stroke-width="1.5" stroke-linejoin="round"/>`).join('');
    // slutetiketter, med enkel krock-hantering
    const ends = valda.map((p, i) => { const s = perP[p]; const k = s[s.length - 1]; return { p, i, x: x(k.hal_i_tht), y: y(val(k)) }; }).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    const sel = valda.map((p, i) => `<path d="${path(p)}" fill="none" stroke="${SERIES[i]}" stroke-width="2" stroke-linejoin="round"/>`).join('')
      + ends.map((e) => `<text x="${e.x + 6}" y="${e.y}" fill="${CREAM}" font-size="12" font-weight="600" dominant-baseline="middle">${esc(namn[e.p])}</text>`).join('');
    box.querySelector('svg')?.remove();
    box.insertAdjacentHTML('afterbegin', `<svg width="${W}" height="${H}" role="img" aria-label="THT-grafen">
      ${g}${muted}${sel}<line id="cross" y1="${m.t}" y2="${H - m.b}" stroke="${CREAM3}" visibility="hidden"/><g id="dots"></g></svg>`);
    const svg = box.querySelector('svg');
    const cross = svg.querySelector('#cross'), dots = svg.querySelector('#dots');
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      const h = Math.max(1, Math.min(maxHal, Math.round(1 + ((px - m.l) / (W - m.l - m.r)) * (maxHal - 1))));
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
    render();
  };
  document.querySelectorAll('.seg button').forEach((b) => b.onclick = () => {
    mode = b.dataset.mode;
    document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
    render();
  });
  window.onresize = () => document.getElementById('kurvabox') && render();
  render();
}

// ---------- all-time ----------
const KOLUMNER = [
  { k: 'fornamn', t: 'Spelare', l: true },
  { k: 'tht', t: 'THT' },
  { k: 'segrar', t: 'Segrar' },
  { k: 'pall', t: 'Pall', sm: true },
  { k: 'rundor', t: 'Rundor', sm: true },
  { k: 'snittPoang', t: 'Poäng/runda', d: 1 },
  { k: 'snittSlag', t: 'Slag/runda', d: 1, asc: true },
  { k: 'bastaRunda', t: 'Bästa runda', sm: true },
  { k: 'totalPoang', t: 'Poäng totalt', sm: true },
];
let sortKey = 'segrar', sortAsc = false;

async function renderAlltime() {
  app.innerHTML = `<p class="muted center">Laddar …</p>`;
  const [res, rundor] = await Promise.all([
    api('v_tht_resultat?select=person_id,fornamn,artal,placering,poang'),
    api('v_runda?select=person_id,fornamn,poang,slag,antal_hal'),
  ]);
  const p = {};
  const get = (r) => (p[r.person_id] ??= { fornamn: r.fornamn, tht: 0, segrar: 0, pall: 0, rundor: 0, pSum: 0, sSum: 0, sN: 0, bastaRunda: null, totalPoang: 0, vinstAr: [] });
  res.forEach((r) => {
    const x = get(r); x.tht++;
    if (r.placering === 1) { x.segrar++; x.vinstAr.push(r.artal); }
    if (r.placering <= 3) x.pall++;
  });
  rundor.filter((r) => r.antal_hal > 0).forEach((r) => {
    const x = get(r); x.rundor++; x.pSum += r.poang; x.totalPoang += r.poang;
    if (r.antal_hal === 18) { x.sSum += r.slag; x.sN++; }
    if (x.bastaRunda === null || r.poang > x.bastaRunda) x.bastaRunda = r.poang;
  });
  const rows = Object.values(p).filter((x) => x.rundor > 0).map((x) => ({
    ...x, snittPoang: x.pSum / x.rundor, snittSlag: x.sN ? x.sSum / x.sN : null,
  }));
  const vinnare = res.filter((r) => r.placering === 1).sort((a, b) => b.artal - a.artal);

  const draw = () => {
    rows.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (va === null) return 1; if (vb === null) return -1;
      const c = typeof va === 'string' ? va.localeCompare(vb, 'sv') : va - vb;
      return sortAsc ? c : -c;
    });
    app.innerHTML = `
      <h1>All-time</h1>
      <p class="sub">${new Set(res.map((r) => r.artal)).size} THT med resultat · ${rundor.filter((r) => r.antal_hal > 0).length} rundor</p>
      <div class="tablewrap"><table>
        <thead><tr>${KOLUMNER.map((c) => `<th class="sortable ${c.l ? 'l' : ''} ${c.sm ? 'hide-sm' : ''} ${sortKey === c.k ? 'sorted' : ''}" data-k="${c.k}" aria-sort="${sortKey === c.k ? (sortAsc ? 'ascending' : 'descending') : 'none'}">${c.t}${sortKey === c.k ? (sortAsc ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${KOLUMNER.map((c) => `<td class="${c.l ? 'l' : ''} ${c.sm ? 'hide-sm' : ''}">${c.l ? esc(r[c.k]) : fmt(r[c.k], c.d || 0)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <p class="hint">Tryck på en rubrik för att sortera. Slag/runda räknas bara på rundor med alla 18 hål, med tak par + 5.</p>

      <h2>Vinnare</h2>
      <div class="tablewrap"><table>
        <thead><tr><th class="l">År</th><th class="l">Vinnare</th><th>Poäng</th></tr></thead>
        <tbody>${vinnare.map((v) => `<tr><td class="l"><a href="#/ar/${v.artal}">${v.artal}</a></td><td class="l win">${esc(v.fornamn)}</td><td>${fmt(v.poang)}</td></tr>`).join('')}</tbody>
      </table></div>`;
    app.querySelectorAll('th.sortable').forEach((th) => th.onclick = () => {
      const c = KOLUMNER.find((x) => x.k === th.dataset.k);
      if (sortKey === c.k) sortAsc = !sortAsc; else { sortKey = c.k; sortAsc = !!(c.asc || c.l); }
      draw();
    });
  };
  draw();
}

route();
