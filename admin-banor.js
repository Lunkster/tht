// Admin: banor. Lista → bana (namn, plats, versioner) → banversion (tee:er och 18 hål).
// Inget tas bort (RLS tillåter inte delete här) – allt rättas genom att ändra.
import { api, write, esc, nuNav, aktuell } from './lib.js?v=0.8.0';
import { tolkaScorekort, kontrolleraHal } from './banparse.js?v=0.8.0';

const app = document.getElementById('app');
const idag = () => new Date().toISOString().slice(0, 10);
const tal = (v) => { const t = String(v ?? '').trim().replace(',', '.'); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
const heltal = (v) => { const n = tal(v); return n === null ? null : Number.isInteger(n) ? n : NaN; };
const UPSERT = 'resolution=merge-duplicates,return=representation';

export function renderBanor([bid, vid]) {
  if (bid === 'ny') return renderNyBana();
  if (bid && vid) return renderVersion(Number(bid), Number(vid));
  if (bid) return renderBana(Number(bid));
  return renderLista();
}

function felText(e) {
  if (e.status === 401) return 'Inloggningen har gått ut – ladda om sidan och logga in igen.';
  if (e.code === '23505') return 'Det finns redan en rad med samma namn/datum.';
  return e.message;
}

// Koordinater: tillåt "59.58, 15.24" inklistrat i lat-fältet.
function kopplaKoordinater(latId, lonId) {
  const lat = document.getElementById(latId), lon = document.getElementById(lonId);
  lat.addEventListener('input', () => {
    const m = lat.value.match(/^\s*(-?\d+[.,]\d+)\s*[,;\s]\s*(-?\d+[.,]\d+)\s*$/);
    if (m) { lat.value = m[1]; lon.value = m[2]; }
  });
}

// ---------- lista ----------
async function renderLista() {
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Laddar banor …</p>';
  const banor = await api('bana?select=id,namn,banversion(id,deltavling(tht(artal)))&order=namn', { fresh: true });
  if (!aktuell(myNav)) return;
  const ar = (b) => [...new Set(b.banversion.flatMap((v) => v.deltavling.map((d) => d.tht?.artal)).filter(Boolean))].sort();
  const rad = (b) => {
    const a = ar(b);
    return `<a class="round link-card" href="#/admin/banor/${b.id}" data-namn="${esc(b.namn.toLowerCase())}">
      <div><div class="rn">${esc(b.namn)}</div>
      <div class="meta">${a.length ? 'Spelad ' + a.join(', ') : 'Inte spelad'}${b.banversion.length > 1 ? ` · ${b.banversion.length} versioner` : ''}</div></div>
      <div class="win"><span class="arrow">›</span></div></a>`;
  };
  app.innerHTML = `
    <a class="back" href="#/admin">‹ Admin</a>
    <div class="row-between"><h1>Banor</h1><a class="btn primary" href="#/admin/banor/ny">+ Ny bana</a></div>
    <p class="sub">${banor.length} banor. En bana kan ha flera versioner om den byggts om – deltävlingen pekar på den version som spelades.</p>
    <input type="text" id="sok" placeholder="Sök bana …" aria-label="Sök bana" autocomplete="off">
    <div class="rounds" id="banlista" style="margin-top:10px">${banor.map(rad).join('')}</div>
    <p class="muted center" id="ingen" hidden>Ingen bana matchar.</p>`;
  const sok = document.getElementById('sok');
  sok.oninput = () => {
    const q = sok.value.trim().toLowerCase();
    let n = 0;
    document.querySelectorAll('#banlista a').forEach((a) => { const vis = a.dataset.namn.includes(q); a.hidden = !vis; n += vis; });
    document.getElementById('ingen').hidden = n > 0;
  };
}

// ---------- ny bana ----------
async function renderNyBana() {
  const myNav = nuNav();
  const banor = await api('bana?select=id,namn&order=namn', { fresh: true });
  if (!aktuell(myNav)) return;
  app.innerHTML = `
    <a class="back" href="#/admin/banor">‹ Banor</a>
    <h1>Ny bana</h1>
    <form class="card form" id="nybana" novalidate>
      <label>Namn<input type="text" id="namn" required autocomplete="off" placeholder="t.ex. Lindesberga GK"></label>
      <p class="hint" id="liknande"></p>
      <div class="adm-falt tva">
        <label><span>Latitud <span class="muted">(valfritt)</span></span><input type="text" inputmode="decimal" id="lat" placeholder="59.5848 – eller klistra in båda"></label>
        <label>Longitud<input type="text" inputmode="decimal" id="lon" placeholder="15.2433"></label>
      </div>
      <div class="adm-checks">
        <label><input type="checkbox" id="rest"> Restaurang</label>
        <label><input type="checkbox" id="ratt"> Fullständiga rättigheter</label>
      </div>
      <div class="adm-falt tva">
        <label>Version giltig från<input type="date" id="giltig" value="${idag()}" required></label>
        <label><span>Första tee <span class="muted">(valfritt)</span></span><input type="text" id="tee" value="gul" autocomplete="off"></label>
      </div>
      <p class="hint">Efter att banan skapats fyller du i hålen – gärna genom att klistra in scorekortet.</p>
      <p class="hint" id="msg" role="status"></p>
      <div class="adm-knappar"><button class="btn primary" type="submit">Skapa bana</button></div>
    </form>`;
  kopplaKoordinater('lat', 'lon');
  const namnEl = document.getElementById('namn');
  namnEl.oninput = () => {
    const q = namnEl.value.trim().toLowerCase().replace(/\b(gk|golfklubb|golfbana|golf|club)\b/g, '').trim();
    const lika = q.length >= 3 ? banor.filter((b) => b.namn.toLowerCase().includes(q)) : [];
    document.getElementById('liknande').innerHTML = lika.length
      ? `Finns redan: ${lika.slice(0, 4).map((b) => `<a href="#/admin/banor/${b.id}">${esc(b.namn)}</a>`).join(', ')} – är det en ombyggnad, lägg en ny version där i stället.` : '';
  };
  document.getElementById('nybana').onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById('msg');
    const namn = namnEl.value.trim(), lat = tal(document.getElementById('lat').value), lon = tal(document.getElementById('lon').value);
    const giltig = document.getElementById('giltig').value, tee = document.getElementById('tee').value.trim();
    if (!namn) { msg.textContent = 'Banan behöver ett namn.'; return; }
    if (Number.isNaN(lat) || Number.isNaN(lon) || (lat === null) !== (lon === null)) { msg.textContent = 'Fyll i både latitud och longitud som decimaltal, eller lämna båda tomma.'; return; }
    if (!giltig) { msg.textContent = 'Välj datum för versionen.'; return; }
    const knapp = e.target.querySelector('[type=submit]'); knapp.disabled = true; msg.textContent = 'Skapar …';
    try {
      const [b] = await write('POST', 'bana', { namn, lat, lon, restaurang: document.getElementById('rest').checked, rattigheter: document.getElementById('ratt').checked });
      const [v] = await write('POST', 'banversion', { bana_id: b.id, giltig_fran: giltig });
      if (tee) await write('POST', 'tee', { banversion_id: v.id, namn: tee });
      location.hash = `#/admin/banor/${b.id}/${v.id}`;
    } catch (err) { knapp.disabled = false; msg.textContent = 'Kunde inte skapa: ' + felText(err); }
  };
}

// ---------- en bana ----------
async function renderBana(bid, meddelande = '') {
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  const [[b], versioner] = await Promise.all([
    api(`bana?id=eq.${bid}&select=id,namn,lat,lon,restaurang,rattigheter`, { fresh: true }),
    api(`banversion?bana_id=eq.${bid}&select=id,giltig_fran,kommentar,tee(namn),hal(count),deltavling(namn,tht(artal))&order=giltig_fran.desc`, { fresh: true }),
  ]);
  if (!aktuell(myNav)) return;
  if (!b) { app.innerHTML = '<p class="err">Banan finns inte.</p>'; return; }
  const karta = b.lat != null ? ` · <a href="https://www.openstreetmap.org/?mlat=${b.lat}&mlon=${b.lon}#map=15/${b.lat}/${b.lon}" target="_blank" rel="noopener">Visa på karta</a>` : '';
  app.innerHTML = `
    <a class="back" href="#/admin/banor">‹ Banor</a>
    <h1>${esc(b.namn)}</h1>
    ${meddelande ? `<p class="ok" role="status">${esc(meddelande)}</p>` : ''}
    <h2>Versioner</h2>
    <div class="rounds">
      ${versioner.map((v) => {
        const ar = [...new Set(v.deltavling.map((d) => d.tht?.artal).filter(Boolean))].sort();
        const hal = v.hal?.[0]?.count ?? 0;
        return `<a class="round link-card" href="#/admin/banor/${bid}/${v.id}">
          <div><div class="rn">Från ${esc(v.giltig_fran)}${v.kommentar ? ' · ' + esc(v.kommentar) : ''}</div>
          <div class="meta">${hal} hål · tee ${v.tee.map((t) => esc(t.namn)).join(', ') || '–'} · ${ar.length ? 'spelad ' + ar.join(', ') : 'inte spelad'}</div></div>
          <div class="win"><span class="arrow">›</span></div></a>`;
      }).join('') || '<p class="muted">Inga versioner ännu.</p>'}
    </div>
    <details class="card adm-ny">
      <summary><strong>+ Ny version</strong> <span class="muted">– om banan byggts om</span></summary>
      <form class="form" id="nyversion" novalidate>
        <div class="adm-falt tva">
          <label>Giltig från<input type="date" id="vgiltig" value="${idag()}" required></label>
          <label>Kopiera hål och tee:er från
            <select id="vkopia"><option value="">Ingen – börja tomt</option>
              ${versioner.map((v) => `<option value="${v.id}">Versionen från ${esc(v.giltig_fran)}</option>`).join('')}
            </select></label>
        </div>
        <label><span>Kommentar <span class="muted">(valfritt)</span></span><input type="text" id="vkomm" placeholder="t.ex. hål 3–5 ombyggda" autocomplete="off"></label>
        <p class="hint" id="vmsg" role="status"></p>
        <div class="adm-knappar"><button class="btn primary" type="submit">Skapa version</button></div>
      </form>
    </details>

    <h2>Uppgifter</h2>
    <form class="card form" id="banform" novalidate>
      <label>Namn<input type="text" id="bnamn" value="${esc(b.namn)}" required autocomplete="off"></label>
      <div class="adm-falt tva">
        <label>Latitud<input type="text" inputmode="decimal" id="blat" value="${b.lat ?? ''}"></label>
        <label>Longitud<input type="text" inputmode="decimal" id="blon" value="${b.lon ?? ''}"></label>
      </div>
      <div class="adm-checks">
        <label><input type="checkbox" id="brest" ${b.restaurang ? 'checked' : ''}> Restaurang</label>
        <label><input type="checkbox" id="bratt" ${b.rattigheter ? 'checked' : ''}> Fullständiga rättigheter</label>
      </div>
      <p class="hint" id="bmsg" role="status">${karta ? karta.slice(3) : ''}</p>
      <div class="adm-knappar"><button class="btn primary" type="submit">Spara uppgifter</button></div>
    </form>`;
  kopplaKoordinater('blat', 'blon');
  if (versioner.length) document.getElementById('vkopia').value = versioner[0].id;

  document.getElementById('banform').onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById('bmsg');
    const namn = document.getElementById('bnamn').value.trim(), lat = tal(document.getElementById('blat').value), lon = tal(document.getElementById('blon').value);
    if (!namn) { msg.textContent = 'Banan behöver ett namn.'; return; }
    if (Number.isNaN(lat) || Number.isNaN(lon) || (lat === null) !== (lon === null)) { msg.textContent = 'Fyll i både latitud och longitud som decimaltal, eller lämna båda tomma.'; return; }
    msg.textContent = 'Sparar …';
    try {
      await write('PATCH', `bana?id=eq.${bid}`, { namn, lat, lon, restaurang: document.getElementById('brest').checked, rattigheter: document.getElementById('bratt').checked }, 'return=minimal');
      renderBana(bid, 'Uppgifterna är sparade.');
    } catch (err) { msg.textContent = 'Kunde inte spara: ' + felText(err); }
  };

  document.getElementById('nyversion').onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById('vmsg');
    const giltig = document.getElementById('vgiltig').value, kopia = Number(document.getElementById('vkopia').value) || null;
    const kommentar = document.getElementById('vkomm').value.trim() || null;
    if (!giltig) { msg.textContent = 'Välj datum.'; return; }
    const knapp = e.target.querySelector('[type=submit]'); knapp.disabled = true; msg.textContent = 'Skapar …';
    try {
      const [v] = await write('POST', 'banversion', { bana_id: bid, giltig_fran: giltig, kommentar });
      if (kopia) await kopieraVersion(kopia, v.id);
      location.hash = `#/admin/banor/${bid}/${v.id}`;
    } catch (err) { knapp.disabled = false; msg.textContent = 'Kunde inte skapa: ' + felText(err); }
  };
}

async function kopieraVersion(fran, till) {
  const [tees, hal] = await Promise.all([
    api(`tee?banversion_id=eq.${fran}&select=id,namn,slope,course_rating&order=id`, { fresh: true }),
    api(`hal?banversion_id=eq.${fran}&select=id,nr,par,hcp_index,hal_langd(tee_id,langd)&order=nr`, { fresh: true }),
  ]);
  const nyaTees = tees.length ? await write('POST', 'tee', tees.map((t) => ({ banversion_id: till, namn: t.namn, slope: t.slope, course_rating: t.course_rating }))) : [];
  const teeMap = Object.fromEntries(tees.map((t) => [t.id, nyaTees.find((n) => n.namn === t.namn)?.id]));
  if (!hal.length) return;
  const nyaHal = await write('POST', 'hal', hal.map((h) => ({ banversion_id: till, nr: h.nr, par: h.par, hcp_index: h.hcp_index })));
  const halMap = Object.fromEntries(nyaHal.map((h) => [h.nr, h.id]));
  const langder = hal.flatMap((h) => h.hal_langd.filter((l) => teeMap[l.tee_id]).map((l) => ({ hal_id: halMap[h.nr], tee_id: teeMap[l.tee_id], langd: l.langd })));
  if (langder.length) await write('POST', 'hal_langd', langder, 'return=minimal');
}

// ---------- en banversion: tee:er och hål ----------
async function renderVersion(bid, vid, meddelande = '') {
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  const [[v], teesDb, halDb] = await Promise.all([
    api(`banversion?id=eq.${vid}&select=id,giltig_fran,kommentar,bana(id,namn),deltavling(id,namn,ordning,tht(nr,artal))`, { fresh: true }),
    api(`tee?banversion_id=eq.${vid}&select=id,namn,slope,course_rating&order=id`, { fresh: true }),
    api(`hal?banversion_id=eq.${vid}&select=id,nr,par,hcp_index,hal_langd(tee_id,langd)&order=nr`, { fresh: true }),
  ]);
  if (!aktuell(myNav)) return;
  if (!v || v.bana?.id !== bid) { app.innerHTML = '<p class="err">Versionen finns inte.</p>'; return; }

  // Tillstånd: tee:er (befintliga + nya) och 18 hål. DOM:en är källan medan man skriver; las() läser tillbaka.
  let tees = teesDb.map((t) => ({ key: 't' + t.id, id: t.id, namn: t.namn, slope: t.slope, cr: t.course_rating, orig: t }));
  const orig = Object.fromEntries(halDb.map((h) => [h.nr, h]));
  let hal = Array.from({ length: 18 }, (_, i) => {
    const h = orig[i + 1];
    return { nr: i + 1, par: h?.par ?? null, index: h?.hcp_index ?? null,
      langd: Object.fromEntries((h?.hal_langd ?? []).map((l) => ['t' + l.tee_id, l.langd])) };
  });
  let nyNr = 0, andrat = false;

  const anvand = v.deltavling.length
    ? `<p class="varn">Används i ${v.deltavling.map((d) => `THT ${d.tht?.artal} R${d.ordning}`).join(', ')}. Ändrar du par eller index räknas poängen om för de rundorna.</p>` : '';

  app.innerHTML = `
    <a class="back" href="#/admin/banor/${bid}">‹ ${esc(v.bana.namn)}</a>
    <h1>${esc(v.bana.namn)}</h1>
    <p class="sub">Version från ${esc(v.giltig_fran)}${v.kommentar ? ' · ' + esc(v.kommentar) : ''}</p>
    ${meddelande ? `<p class="ok" role="status">${esc(meddelande)}</p>` : ''}
    ${anvand}

    <h2>Tee:er</h2>
    <div class="card" id="teekort"></div>

    <h2>Hål</h2>
    <details class="card adm-ny" id="klistra">
      <summary><strong>Klistra in scorekort</strong> <span class="muted">– från Excel, banans hemsida eller handskrivet</span></summary>
      <div class="form">
        <textarea id="klistertext" rows="6" placeholder="En rad per hål:  1  4  7  345  320&#10;eller en rad per sak:  Par 4 3 5 …  /  Index 7 17 1 …  /  Gul 345 150 …"></textarea>
        <p class="hint">Hålnummer och summor (Ut/In/Tot) får vara med. Längder hamnar på tee:erna i den ordning de står ovan – eller på den tee vars namn står först på raden.</p>
        <p class="hint" id="klistermsg" role="status"></p>
        <div class="adm-knappar"><button class="btn" type="button" id="fyll">Fyll i tabellen</button></div>
      </div>
    </details>
    <div class="tablewrap haltabell" id="haltabell"></div>
    <p class="hint">Par 3–6 och index 1–18. Längder i meter. Tomma längder går bra.</p>

    <h2>Versionen</h2>
    <div class="card form">
      <div class="adm-falt tva">
        <label>Giltig från<input type="date" id="vgiltig" value="${esc(v.giltig_fran)}"></label>
        <label>Kommentar<input type="text" id="vkomm" value="${esc(v.kommentar ?? '')}" autocomplete="off"></label>
      </div>
    </div>

    <div class="sparbar">
      <p class="hint" id="sparmsg" role="status"></p>
      <button class="btn primary" id="spara">Spara</button>
    </div>`;

  const markera = () => { andrat = true; document.getElementById('sparmsg').textContent = 'Osparade ändringar'; };

  function las() {
    tees = tees.map((t) => ({ ...t,
      namn: document.getElementById(`tn-${t.key}`).value.trim(),
      slope: tal(document.getElementById(`ts-${t.key}`).value),
      cr: tal(document.getElementById(`tc-${t.key}`).value) }));
    hal = hal.map((h) => ({ nr: h.nr,
      par: heltal(document.getElementById(`p-${h.nr}`).value),
      index: heltal(document.getElementById(`i-${h.nr}`).value),
      langd: Object.fromEntries(tees.map((t) => [t.key, heltal(document.getElementById(`l-${h.nr}-${t.key}`).value)])) }));
  }

  function rita() {
    document.getElementById('teekort').innerHTML = `
      <div class="teerader">
        <div class="teehuvud"><span>Namn</span><span>Slope</span><span>CR</span></div>
        ${tees.map((t) => `<div class="teerad">
          <input type="text" id="tn-${t.key}" value="${esc(t.namn ?? '')}" aria-label="Tee-namn" placeholder="t.ex. gul" autocomplete="off">
          <input type="text" inputmode="numeric" id="ts-${t.key}" value="${t.slope ?? ''}" aria-label="Slope ${esc(t.namn ?? '')}">
          <input type="text" inputmode="decimal" id="tc-${t.key}" value="${t.cr ?? ''}" aria-label="Course rating ${esc(t.namn ?? '')}">
        </div>`).join('') || '<p class="muted">Inga tee:er ännu.</p>'}
      </div>
      <button class="link" id="nytee" type="button">+ Lägg till tee</button>`;
    const rad = (h) => `<tr>
      <th scope="row">${h.nr}</th>
      <td><input type="text" inputmode="numeric" id="p-${h.nr}" value="${h.par ?? ''}" aria-label="Par hål ${h.nr}" maxlength="1"></td>
      <td><input type="text" inputmode="numeric" id="i-${h.nr}" value="${h.index ?? ''}" aria-label="Index hål ${h.nr}" maxlength="2"></td>
      ${tees.map((t) => `<td><input type="text" inputmode="numeric" class="lang" id="l-${h.nr}-${t.key}" value="${h.langd[t.key] ?? ''}" aria-label="Längd ${esc(t.namn)} hål ${h.nr}" maxlength="3"></td>`).join('')}
    </tr>`;
    document.getElementById('haltabell').innerHTML = `<table>
      <thead><tr><th>Hål</th><th>Par</th><th>Index</th>${tees.map((t) => `<th id="th-${t.key}">${esc(t.namn || 'ny tee')}</th>`).join('')}</tr></thead>
      <tbody>${hal.slice(0, 9).map(rad).join('')}
        <tr class="summa"><th>Ut</th><td id="ut-par"></td><td></td>${tees.map((t) => `<td id="ut-${t.key}"></td>`).join('')}</tr>
        ${hal.slice(9).map(rad).join('')}</tbody>
      <tfoot><tr class="summa"><th>Tot</th><td id="tot-par"></td><td></td>${tees.map((t) => `<td id="tot-${t.key}"></td>`).join('')}</tr></tfoot>
    </table>`;
    summera();
    document.getElementById('nytee').onclick = () => { las(); tees.push({ key: 'n' + (++nyNr), id: null, namn: '', slope: null, cr: null }); rita(); markera(); document.getElementById(`tn-n${nyNr}`).focus(); };
    app.querySelectorAll('#teekort input, #haltabell input').forEach((el) => {
      el.addEventListener('input', markera);
      el.addEventListener('change', summera);
    });
  }
  // Summor och tee-rubriker uppdateras på plats, så att fokus inte tappas när man tabbar.
  function summera() {
    las();
    const sum = (lista, f) => lista.reduce((a, h) => a + (Number.isFinite(f(h)) ? f(h) : 0), 0) || '';
    const satt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    satt('ut-par', sum(hal.slice(0, 9), (h) => h.par));
    satt('tot-par', sum(hal, (h) => h.par));
    tees.forEach((t) => {
      satt(`th-${t.key}`, t.namn || 'ny tee');
      satt(`ut-${t.key}`, sum(hal.slice(0, 9), (h) => h.langd[t.key]));
      satt(`tot-${t.key}`, sum(hal, (h) => h.langd[t.key]));
    });
  }
  rita();
  ['vgiltig', 'vkomm'].forEach((id) => document.getElementById(id).addEventListener('input', markera));

  document.getElementById('fyll').onclick = () => {
    las();
    const r = tolkaScorekort(document.getElementById('klistertext').value, tees.map((t) => t.namn));
    const msg = document.getElementById('klistermsg');
    if (!r.info.length) { msg.textContent = r.varningar.join(' '); return; }
    hal = hal.map((h, i) => ({ ...h,
      par: r.par.length ? (r.par[i] ?? null) : h.par,
      index: r.index.length ? (r.index[i] ?? null) : h.index,
      langd: { ...h.langd, ...Object.fromEntries(tees.map((t, ti) => [t.key, r.langd[ti]?.length ? (r.langd[ti][i] ?? null) : h.langd[t.key]])) } }));
    rita(); markera();
    msg.textContent = `Ifyllt: ${r.info.join(', ')}. ${r.varningar.join(' ')} Kontrollera och tryck Spara.`;
  };

  let varnatFor = '';
  document.getElementById('spara').onclick = async () => {
    las(); rita();
    const msg = document.getElementById('sparmsg');
    const { fel, varn } = kontrolleraHal(hal);
    // Befintliga värden kan inte tömmas (inget delete-skydd att luta sig mot).
    hal.forEach((h) => {
      if (orig[h.nr] && (h.par === null || h.index === null)) fel.push(`Hål ${h.nr}: par och index kan ändras men inte tömmas.`);
      tees.forEach((t) => {
        const fore = orig[h.nr]?.hal_langd?.find((l) => 't' + l.tee_id === t.key);
        if (fore && h.langd[t.key] === null) fel.push(`Hål ${h.nr}, tee ${t.namn}: längden kan ändras men inte tömmas.`);
        if (h.langd[t.key] !== null && !(Number.isInteger(h.langd[t.key]) && h.langd[t.key] > 0 && h.langd[t.key] < 1000)) fel.push(`Hål ${h.nr}, tee ${t.namn}: längden ska vara ett heltal i meter.`);
      });
    });
    tees.forEach((t) => {
      const harLangd = hal.some((h) => h.langd[t.key] !== null);
      if (!t.namn && (t.id || harLangd)) fel.push('En tee saknar namn.');
      if (Number.isNaN(t.slope) || Number.isNaN(t.cr)) fel.push(`Tee ${t.namn}: slope och CR ska vara tal.`);
    });
    const namn = tees.filter((t) => t.namn).map((t) => t.namn.toLowerCase());
    if (new Set(namn).size !== namn.length) fel.push('Två tee:er har samma namn.');
    const giltig = document.getElementById('vgiltig').value;
    if (!giltig) fel.push('Versionen behöver ett giltig-från-datum.');
    if (fel.length) { msg.textContent = [...new Set(fel)].slice(0, 4).join(' '); return; }
    const varnText = varn.join(' ');
    if (varn.length && varnatFor !== varnText) { varnatFor = varnText; msg.textContent = `${varnText} Tryck Spara igen om det stämmer.`; return; }

    const knapp = document.getElementById('spara'); knapp.disabled = true; msg.textContent = 'Sparar …';
    try {
      await write('PATCH', `banversion?id=eq.${vid}`, { giltig_fran: giltig, kommentar: document.getElementById('vkomm').value.trim() || null }, 'return=minimal');
      // Tee:er: ändrade befintliga, sedan nya (behöver id innan längderna sparas)
      for (const t of tees.filter((t) => t.id)) {
        if (t.namn !== t.orig.namn || t.slope !== (t.orig.slope == null ? null : Number(t.orig.slope)) || t.cr !== (t.orig.course_rating == null ? null : Number(t.orig.course_rating))) {
          await write('PATCH', `tee?id=eq.${t.id}`, { namn: t.namn, slope: t.slope, course_rating: t.cr }, 'return=minimal');
        }
      }
      const nya = tees.filter((t) => !t.id && t.namn);
      if (nya.length) {
        const skapade = await write('POST', 'tee', nya.map((t) => ({ banversion_id: vid, namn: t.namn, slope: t.slope, course_rating: t.cr })));
        nya.forEach((t) => { t.id = skapade.find((s) => s.namn === t.namn)?.id; });
      }
      const ifyllda = hal.filter((h) => h.par !== null && h.index !== null);
      const sparadeHal = ifyllda.length
        ? await write('POST', 'hal?on_conflict=banversion_id,nr', ifyllda.map((h) => ({ banversion_id: vid, nr: h.nr, par: h.par, hcp_index: h.index })), UPSERT) : [];
      const halId = Object.fromEntries(sparadeHal.map((h) => [h.nr, h.id]));
      const langder = ifyllda.flatMap((h) => tees.filter((t) => t.id && h.langd[t.key] !== null).map((t) => ({ hal_id: halId[h.nr], tee_id: t.id, langd: h.langd[t.key] })));
      if (langder.length) await write('POST', 'hal_langd?on_conflict=hal_id,tee_id', langder, 'resolution=merge-duplicates,return=minimal');
      renderVersion(bid, vid, `Sparat: ${ifyllda.length} hål, ${tees.filter((t) => t.id).length} tee:er.`);
    } catch (err) {
      knapp.disabled = false;
      msg.textContent = 'Kunde inte spara allt: ' + felText(err) + ' Ladda om sidan och kontrollera.';
    }
  };
}
