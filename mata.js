// Inmatning: välj deltävling → välj/skapa boll → mata in hål för hål (autospar).
import { api, write, login, logout, isLoggedIn, esc, fmt, datum, extraslag, poang } from './lib.js';

const app = document.getElementById('app');
const pending = new Map(); // `${runda}-${hal}` -> {runda_id, hal_nr, slag, puttar} som inte sparats än

export async function renderMata(args) {
  if (!isLoggedIn()) return renderLogin(args);
  const [did, boll, hal] = args.map((a) => (a === undefined || a === '' ? null : Number(a)));
  if (!did) return renderValjDeltavling();
  if (!boll) return renderBollar(did);
  return renderHal(did, boll, hal || null);
}

// ---------- inloggning ----------
function renderLogin(args) {
  app.innerHTML = `
    <h1>Mata in</h1>
    <p class="sub">Skriv THT-koden. Telefonen kommer ihåg den.</p>
    <form id="login" class="card form">
      <label for="kod">Kod</label>
      <input id="kod" type="password" autocomplete="current-password" required>
      <button class="btn primary" type="submit">Logga in</button>
      <p class="hint" id="loginmsg"></p>
    </form>`;
  document.getElementById('login').onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById('loginmsg');
    msg.textContent = 'Loggar in …';
    if (await login(document.getElementById('kod').value)) renderMata(args);
    else msg.textContent = 'Fel kod – försök igen.';
  };
}

// ---------- 1. välj deltävling ----------
async function renderValjDeltavling() {
  app.innerHTML = `<p class="muted center">Laddar …</p>`;
  const delt = await api('deltavling?select=id,ordning,namn,datum,tht_nr,tht(artal,ort),banversion(bana(namn))&order=datum.desc', { fresh: true });
  const idag = new Date().toISOString().slice(0, 10);
  const senaste = delt[0]?.tht_nr;
  const lista = delt.filter((d) => d.tht_nr === senaste).sort((a, b) => a.ordning - b.ordning);
  const t = lista[0]?.tht;
  app.innerHTML = `
    <div class="row-between"><h1>Mata in</h1><button class="link" id="logout">Logga ut</button></div>
    <p class="sub">${t ? `${esc(t.ort)} ${t.artal}` : 'Ingen tävling upplagd'}</p>
    <div class="rounds">
      ${lista.map((d) => `
        <a class="round link-card ${d.datum === idag ? 'today' : ''}" href="#/mata/${d.id}">
          <div><div class="rn">R${d.ordning} · ${esc(d.namn)}</div>
          <div class="meta">${esc(d.banversion?.bana?.namn ?? '')} · ${datum(d.datum)}${d.datum === idag ? ' · idag' : ''}</div></div>
          <div class="win"><span class="arrow">›</span></div>
        </a>`).join('')}
    </div>
    <p class="hint">Nya tävlingar och deltävlingar läggs upp av admin (kommer i appen senare).</p>`;
  document.getElementById('logout').onclick = () => { logout(); renderMata([]); };
}

// ---------- 2. bollar i deltävlingen ----------
async function renderBollar(did) {
  app.innerHTML = `<p class="muted center">Laddar …</p>`;
  const [[d], rundor, personer] = await Promise.all([
    api(`deltavling?id=eq.${did}&select=id,ordning,namn,datum,tht_nr,banversion(bana(namn))`, { fresh: true }),
    api(`runda?deltavling_id=eq.${did}&select=id,person_id,spel_hcp,boll_nr&order=boll_nr`, { fresh: true }),
    api('person?select=id,fornamn,efternamn,aktiv&order=fornamn', { fresh: true }),
  ]);
  const pnamn = Object.fromEntries(personer.map((p) => [p.id, p.fornamn]));
  const bollar = {};
  rundor.forEach((r) => (bollar[r.boll_nr ?? 0] ??= []).push(r));
  const iBoll = Object.fromEntries(rundor.map((r) => [r.person_id, r.boll_nr]));
  const lediga = personer.filter((p) => p.aktiv && !(p.id in iBoll));

  app.innerHTML = `
    <a class="back" href="#/mata">‹ Deltävlingar</a>
    <h1>R${d.ordning} · ${esc(d.namn)}</h1>
    <p class="sub">${esc(d.banversion?.bana?.namn ?? '')} · ${datum(d.datum)}</p>

    <div class="rounds">
      ${Object.keys(bollar).length ? Object.entries(bollar).map(([nr, rs]) => `
        <a class="round link-card" href="#/mata/${did}/${nr}">
          <div><div class="rn">Boll ${nr}</div>
          <div class="meta">${rs.map((r) => `${esc(pnamn[r.person_id])} (${r.spel_hcp})`).join(' · ')}</div></div>
          <div class="win"><span class="arrow">›</span></div>
        </a>`).join('') : '<p class="muted">Inga bollar ännu.</p>'}
    </div>

    <h2>Ny boll</h2>
    ${lediga.length ? `
    <form id="nyboll" class="card form">
      <p class="hint">Bocka i spelarna och skriv dagens spel-HCP för var och en.</p>
      ${lediga.map((p) => `
        <div class="pick">
          <label class="check"><input type="checkbox" name="p" value="${p.id}"> ${esc(p.fornamn)} <span class="dim">${esc(p.efternamn)}</span></label>
          <input class="hcp" type="number" inputmode="numeric" step="1" min="-10" max="54" placeholder="HCP" aria-label="Spel-HCP ${esc(p.fornamn)}" data-for="${p.id}" disabled>
        </div>`).join('')}
      ${Object.keys(iBoll).length ? `<p class="hint">Redan i en boll: ${personer.filter((p) => p.id in iBoll).map((p) => `${esc(p.fornamn)} (boll ${iBoll[p.id]})`).join(', ')}</p>` : ''}
      <button class="btn primary" type="submit">Skapa boll</button>
      <p class="hint" id="nybollmsg"></p>
    </form>` : '<p class="muted">Alla spelare är redan i en boll.</p>'}`;

  const form = document.getElementById('nyboll');
  if (!form) return;
  form.addEventListener('change', (e) => {
    if (e.target.name !== 'p') return;
    const inp = form.querySelector(`.hcp[data-for="${e.target.value}"]`);
    inp.disabled = !e.target.checked; inp.required = e.target.checked;
    if (e.target.checked) inp.focus(); else inp.value = '';
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById('nybollmsg');
    const valda = [...form.querySelectorAll('input[name=p]:checked')].map((c) => Number(c.value));
    if (!valda.length) { msg.textContent = 'Välj minst en spelare.'; return; }
    const rows = [];
    for (const pid of valda) {
      const v = form.querySelector(`.hcp[data-for="${pid}"]`).value.trim();
      if (v === '' || !Number.isInteger(Number(v))) { msg.textContent = `Skriv spel-HCP för ${pnamn[pid]} (heltal).`; return; }
      rows.push({ deltavling_id: did, person_id: pid, spel_hcp: Number(v) });
    }
    msg.textContent = 'Skapar …';
    try {
      // hämta färskt bollnummer precis innan, ifall någon annan skapat en boll
      const nu = await api(`runda?deltavling_id=eq.${did}&select=boll_nr,person_id`, { fresh: true });
      const upptagna = nu.filter((r) => valda.includes(r.person_id));
      if (upptagna.length) { msg.textContent = `${upptagna.map((r) => pnamn[r.person_id]).join(', ')} är redan i en boll – ladda om sidan.`; return; }
      const nr = Math.max(0, ...nu.map((r) => r.boll_nr ?? 0)) + 1;
      await write('POST', 'runda', rows.map((r) => ({ ...r, boll_nr: nr })));
      location.hash = `#/mata/${did}/${nr}/1`;
    } catch (err) {
      msg.textContent = err.code === '23505' ? 'Någon av spelarna är redan i en boll – ladda om sidan.' : `Kunde inte skapa bollen: ${err.message}`;
    }
  };
}

// ---------- 3. hål för hål ----------
async function renderHal(did, boll, halNr) {
  app.innerHTML = `<p class="muted center">Laddar …</p>`;
  const [[d], rundor, personer] = await Promise.all([
    api(`deltavling?id=eq.${did}&select=id,ordning,namn,banversion_id,tee_id,banversion(bana(namn))`),
    api(`runda?deltavling_id=eq.${did}&boll_nr=eq.${boll}&select=id,person_id,spel_hcp&order=id`, { fresh: true }),
    api('person?select=id,fornamn'),
  ]);
  if (!rundor.length) { location.hash = `#/mata/${did}`; return; }
  const [hal, langd, scores] = await Promise.all([
    api(`hal?banversion_id=eq.${d.banversion_id}&select=id,nr,par,hcp_index&order=nr`),
    d.tee_id ? api(`hal_langd?tee_id=eq.${d.tee_id}&select=hal_id,langd`) : Promise.resolve([]),
    api(`score?runda_id=in.(${rundor.map((r) => r.id).join(',')})&select=runda_id,hal_nr,slag,puttar`, { fresh: true }),
  ]);
  const pnamn = Object.fromEntries(personer.map((p) => [p.id, p.fornamn]));
  const lmap = Object.fromEntries(langd.map((l) => [l.hal_id, l.langd]));
  const S = {}; // `${runda}-${hal}` -> {slag, puttar}
  scores.forEach((s) => { S[`${s.runda_id}-${s.hal_nr}`] = { slag: s.slag, puttar: s.puttar }; });
  pending.forEach((v, k) => { S[k] = { slag: v.slag, puttar: v.puttar }; });

  const klar = (nr) => rundor.every((r) => S[`${r.id}-${nr}`]?.slag != null);
  if (!halNr) halNr = (hal.find((h) => !klar(h.nr)) ?? hal[hal.length - 1]).nr;
  const h = hal.find((x) => x.nr === halNr);
  if (!h) { app.innerHTML = '<div class="err">Banan saknar håldata.</div>'; return; }

  const totalt = (r) => hal.reduce((a, x) => a + (poang(S[`${r.id}-${x.nr}`]?.slag, x.par, x.hcp_index, r.spel_hcp) ?? 0), 0);
  const spelade = (r) => hal.filter((x) => S[`${r.id}-${x.nr}`]?.slag != null).length;

  const slagVal = [...Array(6)].map((_, i) => h.par - 2 + i).filter((v) => v >= 1);
  const fler = [...Array(6)].map((_, i) => h.par + 4 + i);

  app.innerHTML = `
    <a class="back" href="#/mata/${did}">‹ Boll ${boll} · R${d.ordning} ${esc(d.banversion?.bana?.namn ?? '')}</a>
    <nav class="holes" aria-label="Hål">
      ${hal.map((x) => `<a href="#/mata/${did}/${boll}/${x.nr}" class="${x.nr === halNr ? 'cur' : ''} ${klar(x.nr) ? 'done' : ''}" aria-label="Hål ${x.nr}${klar(x.nr) ? ', klart' : ''}">${x.nr}</a>`).join('')}
    </nav>
    <div class="holehead">
      <div class="holenr">Hål ${h.nr}</div>
      <div class="holeinfo">Par ${h.par} · Index ${h.hcp_index}${lmap[h.id] ? ` · ${lmap[h.id]} m` : ''}</div>
    </div>

    <div class="players">
      ${rundor.map((r) => {
        const k = `${r.id}-${h.nr}`; const v = S[k] || {};
        const ex = extraslag(r.spel_hcp, h.hcp_index);
        const p = poang(v.slag, h.par, h.hcp_index, r.spel_hcp);
        return `<section class="pcard" data-r="${r.id}">
          <header>
            <div><div class="pname">${esc(pnamn[r.person_id])}</div>
              <button class="hcpbtn" data-r="${r.id}" aria-label="Ändra spel-HCP">HCP ${r.spel_hcp} · ${ex > 0 ? '+' + ex : ex} slag</button></div>
            <div class="ppts"><span class="big">${p ?? '–'}</span><span class="dim"> p</span>
              <div class="dim small">tot ${totalt(r)} p · ${spelade(r)}/18</div></div>
          </header>
          <div class="lbl">Slag</div>
          <div class="nums" data-f="slag">
            ${slagVal.map((n) => `<button class="num ${v.slag === n ? 'on' : ''} ${n === h.par ? 'par' : ''}" data-v="${n}">${n}</button>`).join('')}
            <button class="num more ${v.slag > h.par + 3 ? 'on' : ''}" data-more="1">${v.slag > h.par + 3 ? v.slag : '…'}</button>
          </div>
          <div class="nums extra" data-f="slag" hidden>
            ${fler.map((n) => `<button class="num ${v.slag === n ? 'on' : ''}" data-v="${n}">${n}</button>`).join('')}
          </div>
          <div class="lbl">Puttar</div>
          <div class="nums" data-f="puttar">
            ${[0, 1, 2, 3, 4].map((n) => `<button class="num ${v.puttar === n ? 'on' : ''}" data-v="${n}">${n}</button>`).join('')}
          </div>
          <div class="strek dim small" ${v.slag >= h.par + 5 ? '' : 'hidden'}>Struket hål – puttar räknas inte i snittet</div>
          <div class="status" aria-live="polite">${pending.has(k) ? '<span class="warn">Ej sparat – försöker igen</span>' : ''}</div>
        </section>`;
      }).join('')}
    </div>

    <div class="holenav">
      ${halNr > 1 ? `<a class="btn" href="#/mata/${did}/${boll}/${halNr - 1}">‹ Hål ${halNr - 1}</a>` : '<span></span>'}
      ${halNr < hal.length ? `<a class="btn primary" href="#/mata/${did}/${boll}/${halNr + 1}">Hål ${halNr + 1} ›</a>` : `<a class="btn primary" href="#/ar">Klart – se resultat</a>`}
    </div>
    <p class="hint">Fyll i när hålet är spelat. Allt sparas direkt. Tryck på en vald siffra igen för att ta bort den.</p>

    <h2>Ställning R${d.ordning}</h2>
    <div id="stallning" class="tablewrap"><p class="muted center">Laddar …</p></div>`;

  // klick på siffror
  app.querySelector('.players').addEventListener('click', async (e) => {
    const card = e.target.closest('.pcard'); if (!card) return;
    const rid = Number(card.dataset.r); const r = rundor.find((x) => x.id === rid);
    if (e.target.closest('.hcpbtn')) return andraHcp(r, did, boll, halNr);
    const b = e.target.closest('.num'); if (!b) return;
    if (b.dataset.more) { card.querySelector('.nums.extra').hidden = !card.querySelector('.nums.extra').hidden; return; }
    const f = b.closest('.nums').dataset.f; const n = Number(b.dataset.v);
    const k = `${rid}-${h.nr}`; const v = { ...(S[k] || { slag: null, puttar: null }) };
    v[f] = v[f] === n ? null : n;
    S[k] = v;
    // uppdatera kortet direkt
    card.querySelectorAll(`.nums[data-f="${f}"] .num[data-v]`).forEach((x) => x.classList.toggle('on', Number(x.dataset.v) === v[f]));
    if (f === 'slag') {
      const more = card.querySelector('.num.more');
      more.classList.toggle('on', v.slag > h.par + 3); more.textContent = v.slag > h.par + 3 ? v.slag : '…';
      card.querySelector('.big').textContent = poang(v.slag, h.par, h.hcp_index, r.spel_hcp) ?? '–';
      card.querySelector('.small').textContent = `tot ${totalt(r)} p · ${spelade(r)}/18`;
      app.querySelector(`.holes a:nth-child(${h.nr})`).classList.toggle('done', klar(h.nr));
      if (v.slag > h.par + 3) card.querySelector('.nums.extra').hidden = true;
      card.querySelector('.strek').hidden = !(v.slag >= h.par + 5);
    }
    await spara(rid, h.nr, v, card.querySelector('.status'));
    visaStallning(did, d.ordning);
  });

  visaStallning(did, d.ordning);
}

async function spara(runda_id, hal_nr, v, statusEl) {
  const k = `${runda_id}-${hal_nr}`;
  pending.set(k, { runda_id, hal_nr, slag: v.slag, puttar: v.puttar });
  statusEl.innerHTML = '<span class="dim">Sparar …</span>';
  try {
    await sparaEn(pending.get(k));
    pending.delete(k);
    statusEl.innerHTML = '<span class="ok">Sparat ✓</span>';
    setTimeout(() => { if (statusEl.isConnected && !pending.has(k)) statusEl.innerHTML = ''; }, 1500);
  } catch (err) {
    if (err.status === 401) { statusEl.innerHTML = '<span class="warn">Inloggningen har gått ut – ladda om och logga in</span>'; return; }
    statusEl.innerHTML = '<span class="warn">Ej sparat – försöker igen när nätet är tillbaka</span>';
  }
}

async function sparaEn(x) {
  if (x.slag == null && x.puttar == null) {
    return write('DELETE', `score?runda_id=eq.${x.runda_id}&hal_nr=eq.${x.hal_nr}`, undefined, 'return=minimal');
  }
  return write('POST', 'score?on_conflict=runda_id,hal_nr', x, 'resolution=merge-duplicates,return=minimal');
}

async function forsokIgen() {
  for (const [k, x] of [...pending]) {
    try { await sparaEn(x); pending.delete(k); } catch { return; }
  }
  if (location.hash.startsWith('#/mata/')) document.querySelectorAll('.status .warn').forEach((el) => { el.outerHTML = '<span class="ok">Sparat ✓</span>'; });
}
window.addEventListener('online', forsokIgen);
setInterval(() => { if (pending.size) forsokIgen(); }, 15000);

async function andraHcp(r, did, boll, hal) {
  const nytt = window.prompt('Spel-HCP för rundan (heltal):', '');
  if (nytt === null || nytt.trim() === '') return;
  if (!Number.isInteger(Number(nytt))) { alert('Skriv ett heltal.'); return; }
  try {
    await write('PATCH', `runda?id=eq.${r.id}`, { spel_hcp: Number(nytt) }, 'return=minimal');
    renderHal(did, boll, hal);
  } catch (err) { alert(`Kunde inte spara: ${err.message}`); }
}

async function visaStallning(did, ordning) {
  const el = document.getElementById('stallning'); if (!el) return;
  try {
    const rows = await api(`v_runda?deltavling_id=eq.${did}&select=fornamn,boll_nr,antal_hal,poang,placering&order=placering`, { fresh: true });
    if (!document.body.contains(el)) return;
    el.innerHTML = `<table><thead><tr><th>#</th><th class="l">Spelare</th><th>Boll</th><th>Hål</th><th>Poäng</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${r.antal_hal ? r.placering : '–'}</td><td class="l">${esc(r.fornamn)}</td><td>${r.boll_nr ?? ''}</td><td>${r.antal_hal}</td><td><strong>${fmt(r.poang ?? 0)}</strong></td></tr>`).join('')}
    </tbody></table>`;
  } catch { el.innerHTML = '<p class="muted center">Kunde inte hämta ställningen.</p>'; }
}
