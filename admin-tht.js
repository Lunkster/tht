// Admin: THT (nr, år, ort, startdatum, krönika) och dess deltävlingar (bana/version/tee, datum, namn).
import { api, write, esc, nuNav, aktuell, tolkaDatum } from './lib.js?v=0.13.1';

const app = document.getElementById('app');
const idag = () => new Date().toISOString().slice(0, 10);
const plusDag = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function felText(e) {
  if (e.status === 401) return 'Inloggningen har gått ut – ladda om sidan och logga in igen.';
  if (e.code === '23505') return /artal/.test(e.message) ? 'Det finns redan en THT det året.' : /ordning/.test(e.message) ? 'Det finns redan en deltävling med det numret.' : 'Finns redan.';
  return e.message;
}

export function renderTht([nr]) {
  if (nr) return renderEnTht(Number(nr));
  return renderLista();
}

// ---------- lista ----------
async function renderLista() {
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  const thts = await api('tht?select=nr,artal,ort,start,deltavling(datum)&order=nr.desc', { fresh: true });
  if (!aktuell(myNav)) return;
  const nastaNr = (thts[0]?.nr ?? 0) + 1;
  const ledigtAr = thts.length ? Math.max(...thts.map((t) => t.artal)) + 1 : new Date().getFullYear();
  app.innerHTML = `
    <a class="back" href="#/admin">‹ Admin</a>
    <h1>THT och deltävlingar</h1>
    <details class="card adm-ny" ${thts.some((t) => t.artal === new Date().getFullYear()) ? '' : 'open'}>
      <summary><strong>+ Ny THT</strong></summary>
      <form class="form" id="nytht" novalidate>
        <div class="adm-falt tva">
          <label>Nummer<input type="text" inputmode="numeric" id="tnr" value="${nastaNr}"></label>
          <label>År<input type="text" inputmode="numeric" id="tar" value="${ledigtAr}"></label>
          <label>Ort<input type="text" id="tort" placeholder="t.ex. Lindesberg" autocomplete="off"></label>
          <label><span>Startdatum <span class="muted">(valfritt)</span></span><input type="text" inputmode="numeric" class="datum" placeholder="ÅÅÅÅ-MM-DD" maxlength="10" autocomplete="off" id="tstart"></label>
        </div>
        <p class="hint">Startdatumet styr nedräkningen på startsidan tills deltävlingarna är upplagda.</p>
        <p class="hint" id="tmsg" role="status"></p>
        <div class="adm-knappar"><button class="btn primary" type="submit">Skapa THT</button></div>
      </form>
    </details>
    <div class="rounds" style="margin-top:12px">
      ${thts.map((t) => {
        const ds = t.deltavling.map((d) => d.datum).sort();
        return `<a class="round link-card" href="#/admin/tht/${t.nr}">
          <div><div class="rn">THT ${t.nr} · ${esc(t.ort)} ${t.artal}</div>
          <div class="meta">${t.deltavling.length ? `${t.deltavling.length} deltävlingar · ${ds[0]} – ${ds[ds.length - 1]}` : `Inga deltävlingar${t.start ? ' · start ' + t.start : ''}`}</div></div>
          <div class="win"><span class="arrow">›</span></div></a>`;
      }).join('')}
    </div>`;

  document.getElementById('nytht').onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById('tmsg');
    const nr = Number(document.getElementById('tnr').value), artal = Number(document.getElementById('tar').value);
    const ort = document.getElementById('tort').value.trim(), start = tolkaDatum(document.getElementById('tstart').value);
    if (!Number.isInteger(nr) || nr < 1) { msg.textContent = 'Numret ska vara ett heltal.'; return; }
    if (thts.some((t) => t.nr === nr)) { msg.textContent = `THT ${nr} finns redan.`; return; }
    if (!Number.isInteger(artal) || artal < 1990 || artal > 2100) { msg.textContent = 'Året ser fel ut.'; return; }
    if (!ort) { msg.textContent = 'Fyll i ort – den går att ändra senare.'; return; }
    if (Number.isNaN(start)) { msg.textContent = 'Startdatum skrivs ÅÅÅÅ-MM-DD.'; return; }
    if (start && !start.startsWith(String(artal))) { msg.textContent = 'Startdatumet ligger inte på det året.'; return; }
    msg.textContent = 'Skapar …';
    try {
      await write('POST', 'tht', { nr, artal, ort, start }, 'return=minimal');
      location.hash = `#/admin/tht/${nr}`;
    } catch (err) { msg.textContent = 'Kunde inte skapa: ' + felText(err); }
  };
}

// ---------- en THT ----------
async function renderEnTht(nr, meddelande = '') {
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  const [[t], delt, banor, versioner] = await Promise.all([
    api(`tht?nr=eq.${nr}&select=nr,artal,ort,start,kronika,klar`, { fresh: true }),
    api(`deltavling?tht_nr=eq.${nr}&select=id,ordning,namn,datum,banversion_id,tee_id,runda(count)&order=ordning`, { fresh: true }),
    api('bana?select=id,namn&order=namn', { fresh: true }),
    api('banversion?select=id,bana_id,giltig_fran,kommentar,tee(id,namn),hal(count)&order=giltig_fran.desc', { fresh: true }),
  ]);
  if (!aktuell(myNav)) return;
  if (!t) { app.innerHTML = '<p class="err">THT:n finns inte.</p>'; return; }
  const vMap = Object.fromEntries(versioner.map((v) => [v.id, v]));
  const bMap = Object.fromEntries(banor.map((b) => [b.id, b]));
  const teeNamn = (d) => vMap[d.banversion_id]?.tee.find((x) => x.id === d.tee_id)?.namn;
  const antalRundor = (d) => d.runda?.[0]?.count ?? 0;

  const kort = (d) => {
    const v = vMap[d.banversion_id], b = v && bMap[v.bana_id];
    const flera = v && versioner.filter((x) => x.bana_id === v.bana_id).length > 1;
    return `<div class="round dkort" data-did="${d.id}">
      <div><div class="rn">R${d.ordning} · ${esc(d.namn)}</div>
      <div class="meta">${esc(d.datum)} · ${esc(b?.namn ?? '?')}${flera ? ` (version ${esc(v.giltig_fran)})` : ''} · tee ${esc(teeNamn(d) ?? '–')} · ${antalRundor(d)} rundor</div></div>
      <div class="win"><button class="link" data-andra="${d.id}">Ändra</button></div>
    </div>`;
  };

  app.innerHTML = `
    <a class="back" href="#/admin/tht">‹ THT och deltävlingar</a>
    <h1>THT ${t.nr} · ${esc(t.ort)} ${t.artal}</h1>
    ${meddelande ? `<p class="ok" role="status">${esc(meddelande)}</p>` : ''}
    <div class="card avsluta ${t.klar ? 'klar' : ''}">
      <div><strong>${t.klar ? 'Avslutad' : 'Pågår'}</strong>
      <div class="meta">${t.klar ? 'Vinnare och pall är utsedda och räknas i all-time.' : 'Ingen vinnare utses förrän THT:n är avslutad – markera när alla rundor är inmatade.'}</div></div>
      <button class="btn ${t.klar ? '' : 'primary'}" type="button" id="avsluta">${t.klar ? 'Öppna igen' : 'Avsluta THT'}</button>
      <p class="hint" id="avslutamsg" role="status"></p>
    </div>
    <h2>Deltävlingar</h2>
    <div class="rounds" id="dlista">${delt.map(kort).join('') || '<p class="muted">Inga deltävlingar ännu.</p>'}</div>
    <details class="card adm-ny" id="nydelt" ${delt.length ? '' : 'open'}>
      <summary><strong>+ Ny deltävling</strong></summary>
      <div id="nyform"></div>
    </details>

    <h2>THT:n</h2>
    <form class="card form" id="thtform" novalidate>
      <div class="adm-falt tva">
        <label>År<input type="text" inputmode="numeric" id="tar" value="${t.artal}"></label>
        <label>Ort<input type="text" id="tort" value="${esc(t.ort)}" autocomplete="off"></label>
        <label><span>Startdatum <span class="muted">(valfritt)</span></span><input type="text" inputmode="numeric" class="datum" placeholder="ÅÅÅÅ-MM-DD" maxlength="10" autocomplete="off" id="tstart" value="${t.start ?? ''}"></label>
      </div>
      <label><span>Krönika <span class="muted">(valfritt)</span></span><textarea id="tkron" class="prosa" rows="5" placeholder="Vad hände i år?">${esc(t.kronika ?? '')}</textarea></label>
      <p class="hint" id="tmsg" role="status"></p>
      <div class="adm-knappar"><button class="btn primary" type="submit">Spara THT</button></div>
    </form>`;

  // Ny deltävling: förifyll nästa nummer, dagen efter förra (eller startdatum) och förra banans tee-namn.
  const sista = delt[delt.length - 1];
  const nyDefault = {
    id: null, ordning: (sista?.ordning ?? 0) + 1, namn: '',
    datum: sista ? plusDag(sista.datum, 1) : (t.start || ''),
    banversion_id: null, tee_id: null, teeNamnForslag: sista ? teeNamn(sista) : 'gul',
  };
  deltForm(document.getElementById('nyform'), nyDefault);

  app.querySelectorAll('[data-andra]').forEach((btn) => btn.onclick = () => {
    const d = delt.find((x) => x.id === Number(btn.dataset.andra));
    const el = btn.closest('.dkort');
    el.classList.add('redigera');
    el.innerHTML = '<div class="dform"></div>';
    deltForm(el.querySelector('.dform'), d);
  });

  function deltForm(el, d) {
    const key = d.id ?? 'ny';
    const valdBana = d.banversion_id ? vMap[d.banversion_id]?.bana_id : '';
    el.innerHTML = `
      <form class="form" id="df-${key}" novalidate>
        <div class="adm-falt dfalt">
          <label>Nr<input type="text" inputmode="numeric" id="dord-${key}" value="${d.ordning}"></label>
          <label>Datum<input type="text" inputmode="numeric" class="datum" placeholder="ÅÅÅÅ-MM-DD" maxlength="10" autocomplete="off" id="ddat-${key}" value="${d.datum ?? ''}"></label>
        </div>
        <label>Namn<input type="text" id="dnamn-${key}" value="${esc(d.namn)}" placeholder="t.ex. The burning bockjävel open" autocomplete="off"></label>
        <label>Bana
          <select id="dbana-${key}"><option value="">Välj bana …</option>
            ${banor.map((b) => `<option value="${b.id}" ${b.id === valdBana ? 'selected' : ''}>${esc(b.namn)}</option>`).join('')}
          </select></label>
        <p class="hint">Saknas banan? <a href="#/admin/banor/ny">Lägg upp den under Banor</a> först.</p>
        <div class="adm-falt tva">
          <label>Version<select id="dver-${key}"></select></label>
          <label>Tee<select id="dtee-${key}"></select></label>
        </div>
        <p class="hint" id="dinfo-${key}"></p>
        <p class="hint" id="dmsg-${key}" role="status"></p>
        <div class="adm-knappar">
          <button class="btn primary" type="submit">${d.id ? 'Spara' : 'Lägg till'}</button>
          ${d.id ? '<button class="btn" type="button" data-avbryt>Avbryt</button>' : ''}
        </div>
      </form>`;
    const $ = (id) => document.getElementById(`${id}-${key}`);
    const fyllVersioner = (behall) => {
      const bid = Number($('dbana').value);
      const vs = versioner.filter((v) => v.bana_id === bid);
      const datum = tolkaDatum($('ddat').value);
      const forslag = (vs.find((v) => !datum || v.giltig_fran <= datum) ?? vs[0])?.id;
      const vald = behall && vs.some((v) => v.id === d.banversion_id) ? d.banversion_id : forslag;
      $('dver').innerHTML = vs.length
        ? vs.map((v) => `<option value="${v.id}" ${v.id === vald ? 'selected' : ''}>från ${esc(v.giltig_fran)}${v.kommentar ? ' · ' + esc(v.kommentar) : ''}</option>`).join('')
        : '<option value="">–</option>';
      fyllTees(behall);
    };
    const fyllTees = (behall) => {
      const v = vMap[Number($('dver').value)];
      const tees = v?.tee ?? [];
      const namnForslag = (d.teeNamnForslag || teeNamn(d) || '').toLowerCase();
      const vald = behall && tees.some((x) => x.id === d.tee_id) ? d.tee_id : (tees.find((x) => x.namn.toLowerCase() === namnForslag) ?? tees[0])?.id;
      $('dtee').innerHTML = tees.length ? tees.map((x) => `<option value="${x.id}" ${x.id === vald ? 'selected' : ''}>${esc(x.namn)}</option>`).join('') : '<option value="">–</option>';
      const info = [];
      if (v && !(v.hal?.[0]?.count)) info.push(`Versionen saknar hål – <a href="#/admin/banor/${v.bana_id}/${v.id}">fyll i dem under Banor</a>.`);
      if (v && !tees.length) info.push('Versionen saknar tee:er.');
      if (d.id && v && v.id !== d.banversion_id && antalRundor(d)) info.push(`Byter du version räknas poängen om för ${antalRundor(d)} rundor med den nya versionens par och index.`);
      $('dinfo').innerHTML = info.join(' ');
      $('dinfo').classList.toggle('varn', info.length > 0);
    };
    fyllVersioner(true);
    $('dbana').onchange = () => fyllVersioner(false);
    $('dver').onchange = () => fyllTees(false);
    $('ddat').onchange = () => { if (!d.id) fyllVersioner(false); };
    el.querySelector('[data-avbryt]')?.addEventListener('click', () => renderEnTht(nr));

    $('df').onsubmit = async (e) => {
      e.preventDefault();
      const msg = $('dmsg');
      const ordning = Number($('dord').value), datum = tolkaDatum($('ddat').value);
      const banversion_id = Number($('dver').value) || null, tee_id = Number($('dtee').value) || null;
      const namn = $('dnamn').value.trim() || `Deltävling ${ordning}`;
      if (!Number.isInteger(ordning) || ordning < 1 || ordning > 20) { msg.textContent = 'Numret ska vara ett heltal, 1, 2, 3 …'; return; }
      if (delt.some((x) => x.ordning === ordning && x.id !== d.id)) { msg.textContent = `R${ordning} finns redan.`; return; }
      if (!datum) { msg.textContent = 'Skriv datum som ÅÅÅÅ-MM-DD.'; return; }
      if (!datum.startsWith(String(t.artal))) { msg.textContent = `Datumet ligger inte ${t.artal}.`; return; }
      if (!banversion_id) { msg.textContent = 'Välj bana.'; return; }
      if (!tee_id) { msg.textContent = 'Versionen saknar tee – lägg till en under Banor.'; return; }
      const knapp = e.target.querySelector('[type=submit]'); knapp.disabled = true; msg.textContent = 'Sparar …';
      const rad = { ordning, namn, datum, banversion_id, tee_id };
      try {
        if (d.id) await write('PATCH', `deltavling?id=eq.${d.id}`, rad, 'return=minimal');
        else await write('POST', 'deltavling', { tht_nr: nr, ...rad }, 'return=minimal');
        renderEnTht(nr, d.id ? `R${ordning} är uppdaterad.` : `R${ordning} är tillagd.`);
      } catch (err) { knapp.disabled = false; msg.textContent = 'Kunde inte spara: ' + felText(err); }
    };
  }

  // Avsluta/öppna: kontrollera först att alla rundor har 18 hål – andra trycket avslutar ändå.
  let bekraftat = false;
  document.getElementById('avsluta').onclick = async () => {
    const msg = document.getElementById('avslutamsg');
    const knapp = document.getElementById('avsluta');
    try {
      if (!t.klar && !bekraftat) {
        if (!delt.length) { msg.textContent = 'THT:n har inga deltävlingar ännu.'; return; }
        const rundor = await api(`v_runda?tht_nr=eq.${nr}&select=ordning,fornamn,antal_hal&order=ordning`, { fresh: true });
        const ofullst = rundor.filter((r) => (r.antal_hal ?? 0) < 18);
        const utan = delt.filter((d) => !rundor.some((r) => r.ordning === d.ordning));
        const brister = [...utan.map((d) => `R${d.ordning} saknar rundor`), ...ofullst.map((r) => `R${r.ordning} ${r.fornamn}: ${r.antal_hal ?? 0} hål`)];
        if (brister.length) {
          bekraftat = true;
          msg.innerHTML = `Inte komplett: ${brister.slice(0, 8).map(esc).join(' · ')}${brister.length > 8 ? ` · och ${brister.length - 8} till` : ''}. Tryck igen för att avsluta ändå.`;
          knapp.textContent = 'Avsluta ändå';
          return;
        }
      }
      knapp.disabled = true; msg.textContent = 'Sparar …';
      await write('PATCH', `tht?nr=eq.${nr}`, { klar: !t.klar }, 'return=minimal');
      renderEnTht(nr, t.klar ? 'THT:n är öppnad igen – ingen vinnare utses förrän den avslutas.' : `THT ${nr} är avslutad – vinnaren är utsedd.`);
    } catch (err) { knapp.disabled = false; msg.textContent = 'Kunde inte spara: ' + felText(err); }
  };

  document.getElementById('thtform').onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById('tmsg');
    const artal = Number(document.getElementById('tar').value), ort = document.getElementById('tort').value.trim();
    const start = tolkaDatum(document.getElementById('tstart').value), kronika = document.getElementById('tkron').value.trim() || null;
    if (!Number.isInteger(artal) || artal < 1990 || artal > 2100) { msg.textContent = 'Året ser fel ut.'; return; }
    if (!ort) { msg.textContent = 'Fyll i ort.'; return; }
    if (Number.isNaN(start)) { msg.textContent = 'Startdatum skrivs ÅÅÅÅ-MM-DD.'; return; }
    if (start && !start.startsWith(String(artal))) { msg.textContent = 'Startdatumet ligger inte på det året.'; return; }
    msg.textContent = 'Sparar …';
    try {
      await write('PATCH', `tht?nr=eq.${nr}`, { artal, ort, start, kronika }, 'return=minimal');
      renderEnTht(nr, 'THT:n är sparad.');
    } catch (err) { msg.textContent = 'Kunde inte spara: ' + felText(err); }
  };
}
