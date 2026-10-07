// Inmatning: välj deltävling → välj/skapa boll → mata in hål för hål (autospar).
import { api, write, login, logout, isLoggedIn, esc, fmt, datum, poang, nuNav, aktuell } from './lib.js?v=0.3.0';

const app = document.getElementById('app');
const pending = new Map(); // `${runda}-${hal}` -> {runda_id, hal_nr, slag, puttar} som inte sparats än

export async function renderMata(args) {
  if (!isLoggedIn()) return renderLogin(args);
  const [did, boll, hal, pid] = args.map((a) => (a === undefined || a === '' ? null : Number(a)));
  if (!did) return renderValjDeltavling();
  if (boll == null) return renderBollar(did);           // boll 0 = rundor utan bollnummer (äldre år)
  return renderHal(did, boll, hal || null, pid || null);
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
  const myNav = nuNav();
  if (!aktuell(myNav)) return; app.innerHTML = `<p class="muted center">Laddar …</p>`;
  const delt = await api('deltavling?select=id,ordning,namn,datum,tht_nr,tht(artal,ort),banversion(bana(namn))&order=datum.desc', { fresh: true });
  const idag = new Date().toISOString().slice(0, 10);
  const thts = [...new Map(delt.map((d) => [d.tht_nr, d.tht])).entries()]; // nyast först
  const valt = Number(sessionStorage.getItem('mata-tht')) || thts[0]?.[0];
  const lista = delt.filter((d) => d.tht_nr === valt).sort((a, b) => a.ordning - b.ordning);
  if (!aktuell(myNav)) return; app.innerHTML = `
    <div class="row-between"><h1>Mata in</h1><button class="link" id="logout">Logga ut</button></div>
    <div class="yearbar"><select id="matatht" aria-label="Välj THT">
      ${thts.map(([nr, t]) => `<option value="${nr}" ${nr === valt ? 'selected' : ''}>THT ${nr} · ${esc(t.ort)} ${t.artal}</option>`).join('')}
    </select></div>
    <div class="rounds">
      ${lista.map((d) => `
        <a class="round link-card ${d.datum === idag ? 'today' : ''}" href="#/mata/${d.id}">
          <div><div class="rn">R${d.ordning} · ${esc(d.namn)}</div>
          <div class="meta">${esc(d.banversion?.bana?.namn ?? '')} · ${datum(d.datum)}${d.datum === idag ? ' · idag' : ''}</div></div>
          <div class="win"><span class="arrow">›</span></div>
        </a>`).join('')}
    </div>
    <p class="hint">Välj tidigare år i listan för att rätta gamla rundor. Nya tävlingar och deltävlingar läggs upp av admin (kommer i appen senare).</p>`;
  document.getElementById('logout').onclick = () => { logout(); renderMata([]); };
  document.getElementById('matatht').onchange = (e) => { try { sessionStorage.setItem('mata-tht', e.target.value); } catch { /* */ } renderValjDeltavling(); };
}

// ---------- 2. bollar i deltävlingen ----------
async function renderBollar(did) {
  const myNav = nuNav();
  if (!aktuell(myNav)) return; app.innerHTML = `<p class="muted center">Laddar …</p>`;
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

  if (!aktuell(myNav)) return; app.innerHTML = `
    <a class="back" href="#/mata">‹ Deltävlingar</a>
    <h1>R${d.ordning} · ${esc(d.namn)}</h1>
    <p class="sub">${esc(d.banversion?.bana?.namn ?? '')} · ${datum(d.datum)}</p>

    <div class="rounds">
      ${Object.keys(bollar).length ? Object.entries(bollar).map(([nr, rs]) => `
        <div class="round boll">
          <a class="link-card bollhead" href="#/mata/${did}/${nr}"><span class="rn">${nr === '0' ? 'Utan boll' : 'Boll ' + nr}</span><span class="dim small">hela bollen</span><span class="arrow">›</span></a>
          <div class="who">${rs.map((r) => `<a class="chip" href="#/mata/${did}/${nr}/0/${r.person_id}">${esc(pnamn[r.person_id])} <span class="dim">${r.spel_hcp}</span></a>`).join('')}</div>
        </div>`).join('') : '<p class="muted">Inga bollar ännu.</p>'}
    </div>
    <p class="hint">Tryck på en boll för att mata in för alla i den, eller på ett namn för att mata in eller rätta bara den spelaren.</p>
    <div>
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
async function renderHal(did, boll, halNr, pid = null) {
  const myNav = nuNav();
  if (!aktuell(myNav)) return; app.innerHTML = `<p class="muted center">Laddar …</p>`;
  const [[d], rundor, personer] = await Promise.all([
    api(`deltavling?id=eq.${did}&select=id,ordning,namn,banversion_id,tee_id,banversion(bana(namn))`),
    api(`runda?deltavling_id=eq.${did}&${pid ? `person_id=eq.${pid}` : boll ? `boll_nr=eq.${boll}` : 'boll_nr=is.null'}&select=id,person_id,spel_hcp&order=id`, { fresh: true }),
    api('person?select=id,fornamn'),
  ]);
  if (!rundor.length) return renderBollar(did);
  const [hal, langd, scores] = await Promise.all([
    api(`hal?banversion_id=eq.${d.banversion_id}&select=id,nr,par,hcp_index&order=nr`),
    d.tee_id ? api(`hal_langd?tee_id=eq.${d.tee_id}&select=hal_id,langd`) : Promise.resolve([]),
    api(`score?runda_id=in.(${rundor.map((r) => r.id).join(',')})&select=runda_id,hal_nr,slag,puttar`, { fresh: true }),
  ]);
  const pnamn = Object.fromEntries(personer.map((p) => [p.id, p.fornamn]));
  const base = `#/mata/${did}/${boll}`, suf = pid ? `/${pid}` : '';
  const lmap = Object.fromEntries(langd.map((l) => [l.hal_id, l.langd]));
  const S = {}; // `${runda}-${hal}` -> {slag, puttar}
  scores.forEach((s) => { S[`${s.runda_id}-${s.hal_nr}`] = { slag: s.slag, puttar: s.puttar }; });
  pending.forEach((v, k) => { S[k] = { slag: v.slag, puttar: v.puttar }; });

  const klar = (nr) => rundor.every((r) => S[`${r.id}-${nr}`]?.slag != null);
  if (!halNr) halNr = (hal.find((h) => !klar(h.nr)) ?? hal[hal.length - 1]).nr;
  const h = hal.find((x) => x.nr === halNr);
  if (!h) { if (!aktuell(myNav)) return; app.innerHTML = '<div class="err">Banan saknar håldata.</div>'; return; }

  const totalt = (r) => hal.reduce((a, x) => a + (poang(S[`${r.id}-${x.nr}`]?.slag, x.par, x.hcp_index, r.spel_hcp) ?? 0), 0);
  const spelade = (r) => hal.filter((x) => S[`${r.id}-${x.nr}`]?.slag != null).length;

  const START = { slag: h.par, puttar: 2 }; // förslag som visas dämpat tills man bekräftar
  const MIN = { slag: 1, puttar: 0 }, MAX = { slag: 20, puttar: 10 };
  const stepper = (f, v) => `
    <div class="step" data-f="${f}">
      <button class="sbtn" data-d="-1" aria-label="${f === 'slag' ? 'Ett slag mindre' : 'En putt mindre'}">−</button>
      <button class="sval ${v[f] == null ? 'tom' : ''}" data-d="0" aria-label="${f === 'slag' ? 'Slag' : 'Puttar'}: ${v[f] ?? 'inte ifyllt, tryck för ' + START[f]}">
        <span class="slbl">${f === 'slag' ? 'Slag' : 'Puttar'}</span><span class="snum">${v[f] ?? START[f]}</span></button>
      <button class="sbtn" data-d="1" aria-label="${f === 'slag' ? 'Ett slag till' : 'En putt till'}">+</button>
    </div>`;

  if (!aktuell(myNav)) return; app.innerHTML = `
    <div class="holetop">
      <a class="back" href="#/mata/${did}">‹ ${pid ? esc(pnamn[pid]) : boll ? 'Boll ' + boll : 'Utan boll'}</a>
      <div class="holehead"><span class="holenr">Hål ${h.nr}</span>
        <span class="holeinfo">Par ${h.par} · Index ${h.hcp_index}${lmap[h.id] ? ` · ${lmap[h.id]} m` : ''}</span></div>
    </div>
    <nav class="holes" aria-label="Hål">
      ${hal.map((x) => `<a href="${base}/${x.nr}${suf}" class="${x.nr === halNr ? 'cur' : ''} ${klar(x.nr) ? 'done' : ''}" aria-label="Hål ${x.nr}${klar(x.nr) ? ', klart' : ''}">${x.nr}</a>`).join('')}
    </nav>

    <div class="players">
      ${rundor.map((r) => {
        const k = `${r.id}-${h.nr}`; const v = S[k] || {};
        const p = poang(v.slag, h.par, h.hcp_index, r.spel_hcp);
        return `<section class="pcard" data-r="${r.id}">
          <div class="prow">
            <span class="pname">${esc(pnamn[r.person_id])}</span>
            <button class="hcpbtn" aria-label="Ändra spel-HCP">HCP ${r.spel_hcp}</button>
            <span class="status" aria-live="polite">${pending.has(k) ? '<span class="warn">Ej sparat</span>' : ''}</span>
            <span class="ppts"><span class="big">${p ?? '–'}</span> p <span class="dim small">(${totalt(r)})</span></span>
          </div>
          <div class="steps">${stepper('slag', v)}${stepper('puttar', v)}</div>
        </section>`;
      }).join('')}
    </div>

    <div class="holenav">
      ${halNr > 1 ? `<a class="btn" href="${base}/${halNr - 1}${suf}">‹ ${halNr - 1}</a>` : '<span></span>'}
      ${halNr < hal.length ? `<a class="btn primary" href="${base}/${halNr + 1}${suf}">Hål ${halNr + 1} ›</a>` : `<a class="btn primary" href="#/mata/${did}">Klart</a>`}
    </div>
    <p class="hint">Dämpad siffra = inte ifyllt (förslag: par resp. 2 puttar). Tryck på siffran för att bekräfta, eller + / −. Under 1 slag resp. 0 puttar blir fältet tomt igen. Tomma puttar räknas inte. Siffran inom parentes är totalpoängen.</p>

    <h2>Ställning R${d.ordning}</h2>
    <div id="stallning" class="tablewrap"><p class="muted center">Laddar …</p></div>`;

  app.querySelector('.players').addEventListener('click', async (e) => {
    const card = e.target.closest('.pcard'); if (!card) return;
    const rid = Number(card.dataset.r); const r = rundor.find((x) => x.id === rid);
    if (e.target.closest('.hcpbtn')) return andraHcp(r, did, boll, halNr, pid);
    const btn = e.target.closest('.sbtn, .sval'); if (!btn) return;
    const step = btn.closest('.step'); const f = step.dataset.f; const delta = Number(btn.dataset.d);
    const k = `${rid}-${h.nr}`; const v = { ...(S[k] || { slag: null, puttar: null }) };
    if (v[f] == null) v[f] = START[f] + delta;      // första tryck: utgå från förslaget
    else if (delta === 0) return;                    // redan ifyllt – inget att bekräfta
    else v[f] += delta;
    if (v[f] < MIN[f]) v[f] = null;                  // under minsta värdet = tomt
    if (v[f] > MAX[f]) v[f] = MAX[f];
    S[k] = v;
    const sv = step.querySelector('.sval');
    sv.classList.toggle('tom', v[f] == null);
    sv.querySelector('.snum').textContent = v[f] ?? START[f];
    if (f === 'slag') {
      card.querySelector('.big').textContent = poang(v.slag, h.par, h.hcp_index, r.spel_hcp) ?? '–';
      card.querySelector('.ppts .small').textContent = `(${totalt(r)})`;
      app.querySelector(`.holes a:nth-child(${h.nr})`).classList.toggle('done', klar(h.nr));
    }
    clearTimeout(card._t);
    card._t = setTimeout(async () => {               // vänta lite så att flera tryck blir ett anrop
      await spara(rid, h.nr, S[k], card.querySelector('.status'));
      visaStallning(did, d.ordning);
    }, 500);
  });

  visaStallning(did, d.ordning);
}

async function spara(runda_id, hal_nr, v, statusEl) {
  const k = `${runda_id}-${hal_nr}`;
  pending.set(k, { runda_id, hal_nr, slag: v.slag, puttar: v.puttar });
  statusEl.innerHTML = '<span class="dim">…</span>';
  try {
    await sparaEn(pending.get(k));
    pending.delete(k);
    statusEl.innerHTML = '<span class="ok" aria-label="Sparat">✓</span>';
    setTimeout(() => { if (statusEl.isConnected && !pending.has(k)) statusEl.innerHTML = ''; }, 1500);
  } catch (err) {
    if (err.status === 401) { statusEl.innerHTML = '<span class="warn">Logga in igen</span>'; return; }
    statusEl.innerHTML = '<span class="warn">Ej sparat</span>';
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
  if (location.hash.startsWith('#/mata/')) document.querySelectorAll('.status .warn').forEach((el) => { el.outerHTML = '<span class="ok">✓</span>'; });
}
window.addEventListener('online', forsokIgen);
setInterval(() => { if (pending.size) forsokIgen(); }, 15000);

async function andraHcp(r, did, boll, hal, pid) {
  const nytt = window.prompt('Spel-HCP för rundan (heltal):', '');
  if (nytt === null || nytt.trim() === '') return;
  if (!Number.isInteger(Number(nytt))) { alert('Skriv ett heltal.'); return; }
  try {
    await write('PATCH', `runda?id=eq.${r.id}`, { spel_hcp: Number(nytt) }, 'return=minimal');
    renderHal(did, boll, hal, pid);
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
