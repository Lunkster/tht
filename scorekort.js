// Scorekort i efterhand: hela rundor per spelare – 18 slag (och valfritt puttar) på en gång.
// Samma tabeller och regler som Mata in: runda + score, poäng räknas på samma sätt som vyn v_score.
import { api, write, esc, datum, poang, nuNav, aktuell } from './lib.js?v=0.28.0';

const app = document.getElementById('app');
const HAL = Array.from({ length: 18 }, (_, i) => i + 1);
const heltal = (v) => { const t = String(v ?? '').trim(); if (t === '') return null; const n = Number(t); return Number.isInteger(n) ? n : NaN; };

function felText(e) {
  if (e.status === 401) return 'Inloggningen har gått ut – ladda om sidan och logga in igen.';
  if (e.code === '23505') return 'Spelaren har redan en runda i deltävlingen – ladda om sidan.';
  return e.message;
}

export async function renderScorekort(did, meddelande = '') {
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Laddar scorekort …</p>';
  const [[d], personer] = await Promise.all([
    api(`deltavling?id=eq.${did}&select=id,ordning,namn,datum,banversion_id,tht(artal,ort),banversion(bana(namn))`, { fresh: true }),
    api('person?select=id,fornamn,efternamn,aktiv&order=fornamn', { fresh: true }),
  ]);
  if (!d) { app.innerHTML = '<p class="err">Deltävlingen finns inte.</p>'; return; }
  const [halDb, rundor] = await Promise.all([
    api(`hal?banversion_id=eq.${d.banversion_id}&select=nr,par,hcp_index&order=nr`, { fresh: true }),
    api(`runda?deltavling_id=eq.${did}&select=id,person_id,spel_hcp,boll_nr,kommentar,score(hal_nr,slag,puttar)&order=id`, { fresh: true }),
  ]);
  if (!aktuell(myNav)) return;
  const hal = Object.fromEntries(halDb.map((h) => [h.nr, h]));
  const pMap = Object.fromEntries(personer.map((p) => [p.id, p]));
  if (halDb.length < 18) {
    app.innerHTML = `<a class="back" href="#/mata/${did}">‹ R${d.ordning}</a><p class="varn">Banan saknar hål (${halDb.length} av 18) – fyll i dem under <a href="#/admin/banor">Admin → Banor</a> först.</p>`;
    return;
  }

  // Kort = en spelares runda. Befintliga från databasen, nya läggs till med knappen.
  const kort = rundor.map((r) => ({
    key: 'r' + r.id, runda_id: r.id, person_id: r.person_id, spel_hcp: r.spel_hcp, boll_nr: r.boll_nr, kommentar: r.kommentar ?? null,
    orig: Object.fromEntries((r.score ?? []).map((s) => [s.hal_nr, { slag: s.slag, puttar: s.puttar }])),
  }));
  let nyNr = 0;
  const andrade = new Set();

  const halvRad = (k, fran) => {
    const nr = HAL.slice(fran, fran + 9);
    return `<div class="sk-halva">
      <div class="sk-rad sk-huvud"><span>Hål</span>${nr.map((n) => `<span>${n}</span>`).join('')}<span>${fran ? 'In' : 'Ut'}</span></div>
      <div class="sk-rad sk-par"><span>Par</span>${nr.map((n) => `<span>${hal[n].par}</span>`).join('')}<span>${nr.reduce((s, n) => s + hal[n].par, 0)}</span></div>
      <div class="sk-rad"><span>Slag</span>${nr.map((n) => `<input type="text" inputmode="numeric" maxlength="2" class="sk-slag" data-k="${k.key}" data-h="${n}" value="${k.orig[n]?.slag ?? ''}" aria-label="Slag hål ${n}">`).join('')}<b class="sk-sum" id="ss-${k.key}-${fran}"></b></div>
      <div class="sk-rad sk-putt"><span>Putt</span>${nr.map((n) => `<input type="text" inputmode="numeric" maxlength="1" class="sk-puttar" data-k="${k.key}" data-h="${n}" value="${k.orig[n]?.puttar ?? ''}" aria-label="Puttar hål ${n}">`).join('')}<b class="sk-sum" id="sp-${k.key}-${fran}"></b></div>
      <div class="sk-rad sk-poang"><span>Poäng</span>${nr.map((n) => `<span id="po-${k.key}-${n}"></span>`).join('')}<b class="sk-sum" id="spo-${k.key}-${fran}"></b></div>
    </div>`;
  };
  const kortHtml = (k) => {
    const p = pMap[k.person_id];
    return `<section class="card sk-kort" id="kort-${k.key}">
      <div class="sk-topp">
        <div><div class="rn">${esc(p?.fornamn ?? '?')} <span class="dim">${esc(p?.efternamn ?? '')}</span></div>
        <label class="sk-boll"><span class="meta">${k.runda_id ? '' : 'Ny runda · '}Boll</span>${bollSelect(k)}</label></div>
        <label class="sk-hcp">Spel-HCP<input type="text" inputmode="numeric" id="hcp-${k.key}" value="${k.spel_hcp ?? ''}" maxlength="3"></label>
        <div class="sk-tot"><span id="tot-${k.key}">–</span><small>poäng</small></div>
      </div>
      ${halvRad(k, 0)}${halvRad(k, 9)}
      <label class="sk-kommentar"><span class="meta">Kommentar <span class="muted">(valfritt, syns på scorekortet)</span></span><input type="text" id="kom-${k.key}" value="${esc(k.kommentar ?? '')}" maxlength="300" placeholder="t.ex. regn sista nio, hole in one på 7:an"></label>
      <p class="hint" id="msg-${k.key}" role="status"></p>
    </section>`;
  };

  // Bollval per spelare: utan boll, befintliga bollar (med vilka som är i dem) och en ny boll.
  const bollSelect = (k) => {
    const nr = [...new Set(kort.map((x) => x.boll_nr).filter((b) => b != null))].sort((a, b) => a - b);
    const ny = (nr.length ? Math.max(...nr) : 0) + 1;
    const vem = (b) => kort.filter((x) => x.boll_nr === b && x.key !== k.key).map((x) => pMap[x.person_id]?.fornamn).filter(Boolean).join(', ');
    return `<select id="boll-${k.key}" aria-label="Boll för ${esc(pMap[k.person_id]?.fornamn ?? '')}">
      <option value="" ${k.boll_nr == null ? 'selected' : ''}>Utan boll</option>
      ${nr.map((b) => `<option value="${b}" ${b === k.boll_nr ? 'selected' : ''}>Boll ${b}${vem(b) ? ' – ' + esc(vem(b)) : ''}</option>`).join('')}
      <option value="${ny}">Ny boll (${ny})</option>
    </select>`;
  };
  // Vilande (inaktiva) spelare visas inte – aktivera under Admin → Spelare vid behov.
  const ledigaPersoner = () => personer.filter((p) => p.aktiv && !kort.some((k) => k.person_id === p.id));
  app.innerHTML = `
    <a class="back" href="#/mata/${did}">‹ R${d.ordning} · bollar</a>
    <h1>Scorekort · R${d.ordning} ${esc(d.namn)}</h1>
    <p class="sub">${esc(d.banversion?.bana?.namn ?? '')} · ${datum(d.datum)} ${d.tht?.artal ?? ''}</p>
    ${meddelande ? `<p class="ok" role="status">${esc(meddelande)}</p>` : ''}
    <p class="hint">Skriv slagen hål för hål – markören hoppar vidare själv (för 10 eller fler: skriv båda siffrorna). Hela raden kan också klistras in från Excel i första rutan. Puttar är valfritt. Boll väljs under namnet.</p>
    <div id="korten">${kort.map(kortHtml).join('')}</div>
    <div class="card form sk-ny">
      <div class="adm-falt tva">
        <label>Lägg till spelare<select id="nyspelare"><option value="">Välj …</option>${ledigaPersoner().map((p) => `<option value="${p.id}">${esc(p.fornamn)} ${esc(p.efternamn)}</option>`).join('')}</select></label>
        <label>Spel-HCP<input type="text" inputmode="numeric" id="nyhcp" maxlength="3"></label>
      </div>
      <p class="hint" id="nymsg"></p>
      <div class="adm-knappar"><button class="btn" type="button" id="laggtill">+ Lägg till scorekort</button></div>
    </div>
    <div class="sparbar">
      <p class="hint" id="sparmsg" role="status"></p>
      <button class="btn primary" id="spara">Spara alla</button>
    </div>`;

  const statusRad = () => { document.getElementById('sparmsg').textContent = andrade.size ? `${andrade.size} scorekort ej sparade` : ''; };
  const las = (k) => ({
    hcp: heltal(document.getElementById(`hcp-${k.key}`).value),
    kommentar: document.getElementById(`kom-${k.key}`).value.trim() || null,
    boll: document.getElementById(`boll-${k.key}`).value === '' ? null : Number(document.getElementById(`boll-${k.key}`).value),
    hal: Object.fromEntries(HAL.map((n) => [n, {
      slag: heltal(app.querySelector(`.sk-slag[data-k="${k.key}"][data-h="${n}"]`).value),
      puttar: heltal(app.querySelector(`.sk-puttar[data-k="${k.key}"][data-h="${n}"]`).value),
    }])),
  });
  const summa = (lista) => lista.reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0);

  function rakna(k) {
    const v = las(k);
    let tot = 0;
    HAL.forEach((n) => {
      const s = v.hal[n].slag;
      const p = Number.isInteger(s) && Number.isInteger(v.hcp) && s > 0 ? poang(s, hal[n].par, hal[n].hcp_index, v.hcp) : null;
      document.getElementById(`po-${k.key}-${n}`).textContent = p ?? '';
      tot += p ?? 0;
      const putt = v.hal[n].puttar;
      app.querySelector(`.sk-puttar[data-k="${k.key}"][data-h="${n}"]`).classList.toggle('fel', Number.isInteger(s) && Number.isInteger(putt) && putt >= s);
    });
    [0, 9].forEach((f) => {
      const nr = HAL.slice(f, f + 9);
      document.getElementById(`ss-${k.key}-${f}`).textContent = summa(nr.map((n) => v.hal[n].slag)) || '';
      document.getElementById(`sp-${k.key}-${f}`).textContent = summa(nr.map((n) => v.hal[n].puttar)) || '';
      document.getElementById(`spo-${k.key}-${f}`).textContent = Number.isInteger(v.hcp) ? summa(nr.map((n) => Number(document.getElementById(`po-${k.key}-${n}`).textContent) || 0)) : '';
    });
    const ifyllda = HAL.filter((n) => Number.isInteger(v.hal[n].slag)).length;
    document.getElementById(`tot-${k.key}`).textContent = Number.isInteger(v.hcp) && ifyllda ? tot : '–';
  }

  // Inmatning: hoppa vidare automatiskt, klistra in en hel rad.
  function kopplaKort(k) {
    const el = document.getElementById(`kort-${k.key}`);
    const falt = (typ) => [...el.querySelectorAll(`.sk-${typ}`)];
    el.addEventListener('input', (e) => {
      const t = e.target;
      if (t.matches('.sk-slag, .sk-puttar')) {
        t.value = t.value.replace(/\D/g, '');
        const typ = t.classList.contains('sk-slag') ? 'slag' : 'puttar';
        const klar = typ === 'puttar' ? t.value.length === 1 : (t.value.length === 2 || (t.value.length === 1 && t.value !== '1'));
        if (klar) { const lista = falt(typ); const i = lista.indexOf(t); if (i < lista.length - 1) lista[i + 1].focus(); }
      }
      andrade.add(k.key); statusRad(); rakna(k);
    });
    el.addEventListener('paste', (e) => {
      const t = e.target;
      if (!t.matches('.sk-slag, .sk-puttar')) return;
      const tal = (e.clipboardData.getData('text') || '').split(/[\s;,]+/).filter(Boolean);
      if (tal.length < 2) return;
      e.preventDefault();
      const lista = falt(t.classList.contains('sk-slag') ? 'slag' : 'puttar');
      let i = lista.indexOf(t);
      tal.filter((x) => /^\d+$/.test(x)).forEach((x) => { if (i < lista.length) lista[i++].value = x; });
      andrade.add(k.key); statusRad(); rakna(k);
    });
    el.addEventListener('focusin', (e) => { if (e.target.matches('input')) e.target.select(); });
    rakna(k);
  }
  kort.forEach(kopplaKort);

  document.getElementById('laggtill').onclick = () => {
    const pid = Number(document.getElementById('nyspelare').value), hcp = heltal(document.getElementById('nyhcp').value);
    const msg = document.getElementById('nymsg');
    if (!pid) { msg.textContent = 'Välj spelare.'; return; }
    if (!Number.isInteger(hcp)) { msg.textContent = 'Skriv spel-HCP (heltal).'; return; }
    const k = { key: 'n' + (++nyNr), runda_id: null, person_id: pid, spel_hcp: hcp, boll_nr: null, orig: {} };
    kort.push(k);
    document.getElementById('korten').insertAdjacentHTML('beforeend', kortHtml(k));
    kopplaKort(k);
    andrade.add(k.key); statusRad();
    msg.textContent = '';
    const sel = document.getElementById('nyspelare');
    sel.querySelector(`option[value="${pid}"]`).remove(); sel.value = ''; document.getElementById('nyhcp').value = '';
    app.querySelector(`.sk-slag[data-k="${k.key}"]`).focus();
  };

  document.getElementById('spara').onclick = async () => {
    const msg = document.getElementById('sparmsg');
    if (!andrade.size) { msg.textContent = 'Inget att spara.'; return; }
    const lista = kort.filter((k) => andrade.has(k.key));
    // Kontroll först – inget sparas om något kort har fel.
    let felAntal = 0;
    const data = lista.map((k) => {
      const v = las(k), fel = [], varn = [];
      if (!Number.isInteger(v.hcp) || v.hcp < -10 || v.hcp > 54) fel.push('spel-HCP saknas eller är fel');
      HAL.forEach((n) => {
        const { slag, puttar } = v.hal[n];
        if (Number.isNaN(slag) || (slag !== null && (slag < 1 || slag > 20))) fel.push(`hål ${n}: slag 1–20`);
        if (Number.isNaN(puttar) || (puttar !== null && puttar > 9)) fel.push(`hål ${n}: puttar 0–9`);
        if (Number.isInteger(slag) && Number.isInteger(puttar) && puttar >= slag) fel.push(`hål ${n}: fler puttar än slag`);
        if (slag === null && puttar !== null) fel.push(`hål ${n}: puttar utan slag`);
      });
      const saknas = HAL.filter((n) => v.hal[n].slag === null).length;
      if (saknas && saknas < 18) varn.push(`${saknas} hål saknar slag`);
      const m = document.getElementById(`msg-${k.key}`);
      m.textContent = fel.length ? 'Fel: ' + fel.slice(0, 4).join(', ') + '.' : varn.join(', ');
      m.classList.toggle('felmsg', fel.length > 0);
      felAntal += fel.length ? 1 : 0;
      return { k, v };
    });
    if (felAntal) { msg.textContent = `${felAntal} scorekort har fel – se markeringen på kortet.`; document.querySelector('.felmsg')?.closest('.sk-kort')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }

    const knapp = document.getElementById('spara'); knapp.disabled = true;
    let klara = 0;
    try {
      for (const { k, v } of data) {
        msg.textContent = `Sparar ${pMap[k.person_id]?.fornamn ?? ''} …`;
        if (!k.runda_id) {
          const [r] = await write('POST', 'runda', { deltavling_id: did, person_id: k.person_id, spel_hcp: v.hcp, boll_nr: v.boll, kommentar: v.kommentar });
          k.runda_id = r.id;
        } else if (v.hcp !== k.spel_hcp || v.boll !== k.boll_nr || v.kommentar !== k.kommentar) {
          await write('PATCH', `runda?id=eq.${k.runda_id}`, { spel_hcp: v.hcp, boll_nr: v.boll, kommentar: v.kommentar }, 'return=minimal');
        }
        k.spel_hcp = v.hcp; k.boll_nr = v.boll; k.kommentar = v.kommentar;
        const upsert = HAL.filter((n) => v.hal[n].slag !== null && (v.hal[n].slag !== k.orig[n]?.slag || v.hal[n].puttar !== (k.orig[n]?.puttar ?? null)))
          .map((n) => ({ runda_id: k.runda_id, hal_nr: n, slag: v.hal[n].slag, puttar: v.hal[n].puttar }));
        if (upsert.length) await write('POST', 'score?on_conflict=runda_id,hal_nr', upsert, 'resolution=merge-duplicates,return=minimal');
        const tomma = HAL.filter((n) => v.hal[n].slag === null && k.orig[n]);
        if (tomma.length) await write('DELETE', `score?runda_id=eq.${k.runda_id}&hal_nr=in.(${tomma.join(',')})`, undefined, 'return=minimal');
        k.orig = Object.fromEntries(HAL.filter((n) => v.hal[n].slag !== null).map((n) => [n, { ...v.hal[n] }]));
        andrade.delete(k.key); klara++;
      }
      renderScorekort(did, `${klara} scorekort sparade.`);
    } catch (err) {
      knapp.disabled = false; statusRad();
      msg.textContent = `Sparade ${klara} av ${data.length}. Fel: ${felText(err)}`;
    }
  };
}
