// Admin: övernattningar per THT – plats, antal nätter, organisatör, koordinater.
import { api, write, esc, nuNav, aktuell } from './lib.js?v=0.11.0';
import { kopplaKoordinater } from './admin-banor.js?v=0.11.0';

const app = document.getElementById('app');
const tal = (v) => { const t = String(v ?? '').trim().replace(',', '.'); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };

function felText(e) {
  if (e.status === 401) return 'Inloggningen har gått ut – ladda om sidan och logga in igen.';
  return e.message;
}

export async function renderOvernattning(meddelande = '') {
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  const [thts, personer] = await Promise.all([
    api('tht?select=nr,artal,ort&order=nr.desc', { fresh: true }),
    api('person?select=fornamn,efternamn,aktiv&order=fornamn', { fresh: true }),
  ]);
  if (!aktuell(myNav)) return;
  let valt = Number(sessionStorage.getItem('over-tht')) || thts[0]?.nr;
  if (!thts.some((t) => t.nr === valt)) valt = thts[0]?.nr;
  const tht = thts.find((t) => t.nr === valt);
  const rader = valt ? await api(`overnattning?tht_nr=eq.${valt}&select=id,platsnamn,antal_natter,organisator,lat,lon&order=id`, { fresh: true }) : [];
  if (!aktuell(myNav)) return;

  const karta = (o) => o.lat != null ? `<a href="https://www.openstreetmap.org/?mlat=${o.lat}&mlon=${o.lon}#map=14/${o.lat}/${o.lon}" target="_blank" rel="noopener">karta</a>` : 'saknar koordinater';
  const kort = (o) => `
    <div class="round okort" data-oid="${o.id}">
      <div><div class="rn">${esc(o.platsnamn)}</div>
      <div class="meta">${o.antal_natter ? `${o.antal_natter} ${o.antal_natter === 1 ? 'natt' : 'nätter'}` : 'nätter ej angivet'} · ${esc(o.organisator || 'organisatör ej angiven')} · ${karta(o)}</div></div>
      <div class="win"><button class="link" data-andra="${o.id}">Ändra</button></div>
    </div>`;

  app.innerHTML = `
    <a class="back" href="#/admin">‹ Admin</a>
    <h1>Övernattningar</h1>
    <div class="yearbar"><select id="overtht" aria-label="Välj THT">
      ${thts.map((t) => `<option value="${t.nr}" ${t.nr === valt ? 'selected' : ''}>THT ${t.nr} · ${esc(t.ort)} ${t.artal}</option>`).join('')}
    </select></div>
    ${meddelande ? `<p class="ok" role="status">${esc(meddelande)}</p>` : ''}
    <div class="rounds">${rader.map(kort).join('') || `<p class="muted">Inga övernattningar för ${esc(tht?.ort ?? '')} ${tht?.artal ?? ''} ännu.</p>`}</div>
    <details class="card adm-ny" ${rader.length ? '' : 'open'}>
      <summary><strong>+ Ny övernattning</strong></summary>
      <div id="nyform"></div>
    </details>
    <datalist id="org-lista">${personer.map((p) => `<option value="${esc(p.fornamn)} ${esc(p.efternamn)}">`).join('')}</datalist>`;

  document.getElementById('overtht').onchange = (e) => { try { sessionStorage.setItem('over-tht', e.target.value); } catch { /* */ } renderOvernattning(); };
  formular(document.getElementById('nyform'), { id: null, platsnamn: '', antal_natter: null, organisator: '', lat: null, lon: null });
  app.querySelectorAll('[data-andra]').forEach((b) => b.onclick = () => {
    const o = rader.find((x) => x.id === Number(b.dataset.andra));
    const el = b.closest('.okort');
    el.classList.add('redigera');
    el.innerHTML = '<div class="oform"></div>';
    formular(el.querySelector('.oform'), o);
  });

  function formular(el, o) {
    const k = o.id ?? 'ny';
    el.innerHTML = `
      <form class="form" id="of-${k}" novalidate>
        <label>Plats<input type="text" id="oplats-${k}" value="${esc(o.platsnamn)}" placeholder="t.ex. Roberts hus, Lindesberg" autocomplete="off"></label>
        <div class="adm-falt tva">
          <label>Antal nätter<input type="text" inputmode="numeric" id="onatt-${k}" value="${o.antal_natter ?? ''}"></label>
          <label>Organisatör<input type="text" id="oorg-${k}" value="${esc(o.organisator ?? '')}" list="org-lista" autocomplete="off"></label>
          <label><span>Latitud <span class="muted">(valfritt)</span></span><input type="text" inputmode="decimal" id="olat-${k}" value="${o.lat ?? ''}" placeholder="59.58 – eller klistra in båda"></label>
          <label>Longitud<input type="text" inputmode="decimal" id="olon-${k}" value="${o.lon ?? ''}"></label>
        </div>
        <p class="hint">Koordinater: högerklicka på platsen i Google Maps och klicka på siffrorna – klistra sedan in i latitudfältet.</p>
        <p class="hint" id="omsg-${k}" role="status"></p>
        <div class="adm-knappar">
          <button class="btn primary" type="submit">${o.id ? 'Spara' : 'Lägg till'}</button>
          ${o.id ? '<button class="btn" type="button" data-avbryt>Avbryt</button><button class="btn fara" type="button" data-bort>Ta bort</button>' : ''}
        </div>
      </form>`;
    kopplaKoordinater(`olat-${k}`, `olon-${k}`);
    const $ = (id) => document.getElementById(`${id}-${k}`);
    el.querySelector('[data-avbryt]')?.addEventListener('click', () => renderOvernattning());

    // Ta bort: två tryck i stället för en dialogruta.
    const bort = el.querySelector('[data-bort]');
    if (bort) bort.onclick = async () => {
      if (!bort.dataset.saker) { bort.dataset.saker = '1'; bort.textContent = 'Tryck igen för att ta bort'; return; }
      bort.disabled = true; $('omsg').textContent = 'Tar bort …';
      try {
        await write('DELETE', `overnattning?id=eq.${o.id}`, undefined, 'return=minimal');
        renderOvernattning(`${o.platsnamn} är borttagen.`);
      } catch (err) { bort.disabled = false; $('omsg').textContent = 'Kunde inte ta bort: ' + felText(err); }
    };

    $('of').onsubmit = async (e) => {
      e.preventDefault();
      const msg = $('omsg');
      const platsnamn = $('oplats').value.trim(), natterTxt = $('onatt').value.trim();
      const antal_natter = natterTxt === '' ? null : Number(natterTxt);
      const organisator = $('oorg').value.trim() || null;
      const lat = tal($('olat').value), lon = tal($('olon').value);
      if (!platsnamn) { msg.textContent = 'Fyll i plats.'; return; }
      if (antal_natter !== null && !(Number.isInteger(antal_natter) && antal_natter >= 1 && antal_natter <= 30)) { msg.textContent = 'Antal nätter ska vara ett heltal.'; return; }
      if (Number.isNaN(lat) || Number.isNaN(lon) || (lat === null) !== (lon === null)) { msg.textContent = 'Fyll i både latitud och longitud som decimaltal, eller lämna båda tomma.'; return; }
      if (lat !== null && (Math.abs(lat) > 90 || Math.abs(lon) > 180)) { msg.textContent = 'Koordinaterna ser fel ut.'; return; }
      const knapp = e.target.querySelector('[type=submit]'); knapp.disabled = true; msg.textContent = 'Sparar …';
      const rad = { platsnamn, antal_natter, organisator, lat, lon };
      try {
        if (o.id) await write('PATCH', `overnattning?id=eq.${o.id}`, rad, 'return=minimal');
        else await write('POST', 'overnattning', { tht_nr: valt, ...rad }, 'return=minimal');
        renderOvernattning(o.id ? `${platsnamn} är uppdaterad.` : `${platsnamn} är tillagd.`);
      } catch (err) { knapp.disabled = false; msg.textContent = 'Kunde inte spara: ' + felText(err); }
    };
  }
}
