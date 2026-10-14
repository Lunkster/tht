// Admin: närmast hål och longest drive – hål och vinnare per deltävling (även i efterhand).
// En vinnare per deltävling och typ. "Ingen vinnare" tar bort raden – ibland blir priset inte av.
import { api, write, esc, nuNav, aktuell } from './lib.js?v=0.11.0';

const app = document.getElementById('app');
const TYPER = [
  { typ: 'narmast', kol: 'narmast_hal', t: 'Närmast hål', parTips: [3], tips: 'brukar vara ett par 3' },
  { typ: 'longest', kol: 'longest_hal', t: 'Longest drive', parTips: [5, 4], tips: 'brukar vara ett par 5, ibland par 4' },
];

function felText(e) {
  if (e.status === 401) return 'Inloggningen har gått ut – ladda om sidan och logga in igen.';
  return e.message;
}

export async function renderPriser(meddelande = '') {
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  const thts = await api('tht?select=nr,artal,ort,deltavling(id)&order=nr.desc', { fresh: true });
  if (!aktuell(myNav)) return;
  const medDelt = thts.filter((t) => t.deltavling.length);
  let valt = Number(sessionStorage.getItem('pris-tht')) || medDelt[0]?.nr;
  if (!medDelt.some((t) => t.nr === valt)) valt = medDelt[0]?.nr;
  if (!valt) { app.innerHTML = '<a class="back" href="#/admin">‹ Admin</a><h1>Närmast hål och longest drive</h1><p class="muted">Inga deltävlingar ännu – lägg upp dem under THT och deltävlingar.</p>'; return; }

  const [delt, priser, personer] = await Promise.all([
    api(`deltavling?tht_nr=eq.${valt}&select=id,ordning,namn,datum,banversion_id,narmast_hal,longest_hal,banversion(bana(namn)),runda(person_id)&order=ordning`, { fresh: true }),
    api(`pris?select=deltavling_id,typ,person_id&deltavling_id=in.(${medDelt.find((t) => t.nr === valt).deltavling.map((d) => d.id).join(',')})`, { fresh: true }),
    api('person?select=id,fornamn,efternamn,aktiv&order=fornamn', { fresh: true }),
  ]);
  const vids = [...new Set(delt.map((d) => d.banversion_id))];
  const hal = vids.length ? await api(`hal?banversion_id=in.(${vids.join(',')})&select=banversion_id,nr,par&order=nr`, { fresh: true }) : [];
  if (!aktuell(myNav)) return;
  const halFor = (vid) => hal.filter((h) => h.banversion_id === vid);
  const pMap = Object.fromEntries(personer.map((p) => [p.id, p]));
  const vinnare = (did, typ) => priser.find((p) => p.deltavling_id === did && p.typ === typ)?.person_id ?? null;

  const halSelect = (d, T) => {
    const hs = halFor(d.banversion_id);
    const vald = d[T.kol];
    const opt = hs.length
      ? hs.map((h) => `<option value="${h.nr}" ${h.nr === vald ? 'selected' : ''}>Hål ${h.nr} · par ${h.par}</option>`).join('')
      : Array.from({ length: 18 }, (_, i) => `<option value="${i + 1}" ${i + 1 === vald ? 'selected' : ''}>Hål ${i + 1}</option>`).join('');
    return `<select id="h-${T.typ}-${d.id}" aria-label="${T.t}, hål"><option value="">Hål ej angivet</option>${opt}</select>`;
  };
  const personSelect = (d, T) => {
    const spelade = [...new Set(d.runda.map((r) => r.person_id))].map((id) => pMap[id]).filter(Boolean).sort((a, b) => a.fornamn.localeCompare(b.fornamn, 'sv'));
    const ovriga = personer.filter((p) => !spelade.includes(p));
    const vald = vinnare(d.id, T.typ);
    const o = (p) => `<option value="${p.id}" ${p.id === vald ? 'selected' : ''}>${esc(p.fornamn)} ${esc(p.efternamn)}</option>`;
    return `<select id="p-${T.typ}-${d.id}" aria-label="${T.t}, vinnare">
      <option value="">${vald ? 'Ingen vinnare (blev inte av)' : 'Ingen vinnare'}</option>
      ${spelade.length ? `<optgroup label="Spelade deltävlingen">${spelade.map(o).join('')}</optgroup><optgroup label="Övriga">${ovriga.map(o).join('')}</optgroup>` : ovriga.map(o).join('')}
    </select>`;
  };

  app.innerHTML = `
    <a class="back" href="#/admin">‹ Admin</a>
    <h1>Närmast hål och longest drive</h1>
    <div class="yearbar"><select id="pristht" aria-label="Välj THT">
      ${medDelt.map((t) => `<option value="${t.nr}" ${t.nr === valt ? 'selected' : ''}>THT ${t.nr} · ${esc(t.ort)} ${t.artal}</option>`).join('')}
    </select></div>
    ${meddelande ? `<p class="ok" role="status">${esc(meddelande)}</p>` : ''}
    <p class="sub">Hålet kan läggas in före rundan och vinnaren efteråt. Blev ett pris inte av: välj "Ingen vinnare" och tomt hål.</p>
    <div class="rounds">
      ${delt.map((d) => `
        <form class="round priskort" id="pf-${d.id}" novalidate>
          <div class="pris-rubrik"><div class="rn">R${d.ordning} · ${esc(d.namn)}</div>
          <div class="meta">${esc(d.banversion?.bana?.namn ?? '')} · ${esc(d.datum)}</div></div>
          ${TYPER.map((T) => `
            <fieldset class="prisrad">
              <legend>${T.t}</legend>
              <div class="prisfalt">${halSelect(d, T)}${personSelect(d, T)}</div>
              <p class="hint" id="tips-${T.typ}-${d.id}"></p>
            </fieldset>`).join('')}
          <p class="hint" id="msg-${d.id}" role="status"></p>
          <div class="adm-knappar"><button class="btn primary" type="submit">Spara R${d.ordning}</button></div>
        </form>`).join('')}
    </div>`;

  document.getElementById('pristht').onchange = (e) => { try { sessionStorage.setItem('pris-tht', e.target.value); } catch { /* */ } renderPriser(); };

  delt.forEach((d) => {
    const visaTips = (T) => {
      const nr = Number(document.getElementById(`h-${T.typ}-${d.id}`).value);
      const h = halFor(d.banversion_id).find((x) => x.nr === nr);
      document.getElementById(`tips-${T.typ}-${d.id}`).textContent = h && !T.parTips.includes(h.par) ? `Hål ${nr} är par ${h.par} – ${T.t.toLowerCase()} ${T.tips}.` : '';
    };
    TYPER.forEach((T) => { visaTips(T); document.getElementById(`h-${T.typ}-${d.id}`).onchange = () => visaTips(T); });

    document.getElementById(`pf-${d.id}`).onsubmit = async (e) => {
      e.preventDefault();
      const msg = document.getElementById(`msg-${d.id}`);
      const knapp = e.target.querySelector('[type=submit]');
      const halVal = Object.fromEntries(TYPER.map((T) => [T.kol, Number(document.getElementById(`h-${T.typ}-${d.id}`).value) || null]));
      const nyaVinnare = TYPER.map((T) => ({ typ: T.typ, person_id: Number(document.getElementById(`p-${T.typ}-${d.id}`).value) || null }));
      knapp.disabled = true; msg.textContent = 'Sparar …';
      try {
        if (TYPER.some((T) => halVal[T.kol] !== d[T.kol])) await write('PATCH', `deltavling?id=eq.${d.id}`, halVal, 'return=minimal');
        for (const v of nyaVinnare.filter((x) => !x.person_id && vinnare(d.id, x.typ))) {
          await write('DELETE', `pris?deltavling_id=eq.${d.id}&typ=eq.${v.typ}`, undefined, 'return=minimal');
        }
        const rader = nyaVinnare.filter((v) => v.person_id && v.person_id !== vinnare(d.id, v.typ)).map((v) => ({ deltavling_id: d.id, ...v }));
        if (rader.length) await write('POST', 'pris?on_conflict=deltavling_id,typ', rader, 'resolution=merge-duplicates,return=minimal');
        renderPriser(`R${d.ordning} är sparad.`);
      } catch (err) { knapp.disabled = false; msg.textContent = 'Kunde inte spara: ' + felText(err); }
    };
  });
}
