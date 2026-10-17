// Admin: grunddata som läggs upp sällan – spelare, banor, THT, priser och övernattningar.
import { api, allaRader, write, isLoggedIn, arAdmin, arMarkor, logout, esc, nuNav, aktuell } from './lib.js?v=0.23.1';
import { visaLogin } from './mata.js?v=0.23.1';
import { renderBanor } from './admin-banor.js?v=0.23.1';
import { renderTht } from './admin-tht.js?v=0.23.1';
import { renderPriser } from './admin-priser.js?v=0.23.1';
import { renderOvernattning } from './admin-overnattning.js?v=0.23.1';
import { renderBanbetyg } from './admin-banbetyg.js?v=0.23.1';

const app = document.getElementById('app');

const SEKTIONER = [
  { id: 'spelare', t: 'Spelare', d: 'Lägg till spelare, ändra namn och Golf-ID, aktiv/vilande' },
  { id: 'banor', t: 'Banor', d: 'Ny bana, ombyggnad (ny version), tee:er och hål – klistra in scorekort' },
  { id: 'tht', t: 'THT och deltävlingar', d: 'Ny THT med ort och startdatum, deltävlingar med bana, version och tee' },
  { id: 'priser', t: 'Närmast hål och longest drive', d: 'Hål och vinnare per deltävling' },
  { id: 'banbetyg', t: 'Banbetyg', d: 'Varje spelares betyg 1–5 på årets banor' },
  { id: 'overnattning', t: 'Övernattningar', d: 'Plats, nätter, organisatör och koordinater per THT' },
];

export async function renderAdmin([sida, ...rest]) {
  if (!isLoggedIn()) return visaLogin('Admin', () => renderAdmin([sida, ...rest]));
  if (arMarkor()) {   // markör: priser och banbetyg för öppna THT
    if (sida === 'priser') return renderPriser();
    if (sida === 'banbetyg') return renderBanbetyg();
    if (!sida) { location.hash = '#/mata'; return; }   // markörens sida är Mata in
  }
  if (!arAdmin()) return visaEjAdmin([sida, ...rest]);
  if (sida === 'spelare') return renderSpelare();
  if (sida === 'banor') return renderBanor(rest);
  if (sida === 'tht') return renderTht(rest);
  if (sida === 'priser') return renderPriser();
  if (sida === 'overnattning') return renderOvernattning();
  if (sida === 'banbetyg') return renderBanbetyg();
  return renderMeny();
}

// Inloggad med markörkoden (eller ett konto utan roll): admin kräver admin-koden.
function visaEjAdmin(args) {
  app.innerHTML = `
    <h1>Admin</h1>
    <div class="card">
      <p>${arMarkor() ? 'Du är inloggad som <strong>markör</strong>. Den här delen kräver admin – allt markörer kan göra finns under <a href="#/mata">Mata in</a>.' : 'Kontot saknar behörighet för admin.'}</p>
      <p class="sub">Admin kräver admin-koden.</p>
      <button class="btn primary" type="button" id="bytkonto">Logga in som admin</button>
    </div>`;
  document.getElementById('bytkonto').onclick = () => { logout(); renderAdmin(args); };
}

function renderMeny() {
  app.innerHTML = `
    <div class="row-between"><h1>Admin</h1><button class="link" id="logout">Logga ut</button></div>
    <p class="sub">Grunddata som läggs upp före eller efter en THT.</p>
    <div class="rounds">
      ${SEKTIONER.map((s) => s.kommer
        ? `<div class="round adm-kommer"><div><div class="rn">${esc(s.t)}</div><div class="meta">${esc(s.d)} · kommer</div></div></div>`
        : `<a class="round link-card" href="#/admin/${s.id}"><div><div class="rn">${esc(s.t)}</div><div class="meta">${esc(s.d)}</div></div><div class="win"><span class="arrow">›</span></div></a>`).join('')}
    </div>

    <details class="card golfid-lista" id="golfid">
      <summary><strong>Golf-ID</strong> <span class="muted">– lista för anmälan och tävlingar</span></summary>
      <div id="golfid-innehall"><p class="muted">Laddar …</p></div>
    </details>

    <h2>Backup</h2>
    <div class="card backup">
      <div><strong>Ladda ned backup</strong>
      <div class="meta">All data som en SQL-fil (insert-satser), t.ex. att spara i Dropbox efter varje THT.</div></div>
      <button class="btn primary" type="button" id="backup">Ladda ned .sql</button>
      <p class="hint" id="backupmsg" role="status"></p>
    </div>`;
  document.getElementById('logout').onclick = () => { logout(); renderAdmin([]); };
  document.getElementById('backup').onclick = laddaNedBackup;
  document.getElementById('golfid').addEventListener('toggle', visaGolfId, { once: true });
}

async function visaGolfId() {
  const el = document.getElementById('golfid-innehall');
  try {
    const [personer, kontakt] = await Promise.all([
      api('person?select=id,fornamn,efternamn,aktiv&order=fornamn,efternamn', { fresh: true }),
      api('person_kontakt?select=person_id,golf_id', { fresh: true }),
    ]);
    const g = Object.fromEntries(kontakt.map((k) => [k.person_id, k.golf_id]));
    const rad = (p) => `<tr class="${p.aktiv ? '' : 'dim'}"><td class="l">${esc(p.fornamn)} ${esc(p.efternamn)}</td><td class="l"><code>${esc(g[p.id] ?? '–')}</code></td></tr>`;
    el.innerHTML = `<div class="tablewrap"><table><thead><tr><th class="l">Spelare</th><th class="l">Golf-ID</th></tr></thead>
      <tbody>${personer.filter((p) => p.aktiv).map(rad).join('')}${personer.filter((p) => !p.aktiv).map(rad).join('')}</tbody></table></div>
      <p class="hint">Vilande spelare står sist i grått. Golf-ID ändras under <a href="#/admin/spelare">Spelare</a>.</p>`;
  } catch (e) { el.innerHTML = `<p class="err">Kunde inte hämta Golf-ID: ${esc(e.message)}</p>`; }
}

// ---------- backup ----------
// Tabellerna i den ordning de måste läsas in (främmande nycklar). id = tabeller med identitetskolumn.
const BACKUP = [
  { t: 'tht', o: 'nr' }, { t: 'person', o: 'id', id: true }, { t: 'tht_resultat_utan_kort', o: 'tht_nr,person_id' }, { t: 'bana', o: 'id', id: true },
  { t: 'banversion', o: 'id', id: true }, { t: 'tee', o: 'id', id: true }, { t: 'hal', o: 'id', id: true },
  { t: 'hal_langd', o: 'hal_id,tee_id' }, { t: 'deltavling', o: 'id', id: true }, { t: 'runda', o: 'id', id: true },
  { t: 'score', o: 'runda_id,hal_nr' }, { t: 'pris', o: 'deltavling_id,typ' }, { t: 'overnattning', o: 'id', id: true },
  { t: 'ban_betyg', o: 'tht_nr,bana_id,person_id' }, { t: 'betyg_lank', o: 'tht_nr,person_id' }, { t: 'spelar_lank', o: 'person_id' },
];
const sqlVarde = (v) => v === null || v === undefined ? 'NULL'
  : typeof v === 'boolean' ? (v ? 'true' : 'false')
  : typeof v === 'number' ? String(v)
  : `'${String(v).replace(/'/g, "''")}'`;

export function byggBackup(data, nu = new Date()) {
  const stampel = `${nu.toISOString().slice(0, 10)} ${nu.toTimeString().slice(0, 5)}`;
  const rader = [
    `-- THT backup ${stampel}`,
    '-- Bara data (insert-satser). Schemat finns i repot: supabase/01_schema.sql, 02_vyer.sql … 08 –',
    '-- kör dem först i en tom databas, sedan den här filen.',
    '-- person_kontakt ingår inte (skyddad tabell utan läsrätt).',
    '',
    'begin;',
  ];
  for (const { t, id } of BACKUP) {
    const rows = data[t] ?? [];
    rader.push('', `-- ${t}: ${rows.length} rader`);
    if (!rows.length) continue;
    const kol = Object.keys(rows[0]);
    for (let i = 0; i < rows.length; i += 200) {
      rader.push(`insert into public.${t} (${kol.join(', ')}) values\n` +
        rows.slice(i, i + 200).map((r) => `  (${kol.map((k) => sqlVarde(r[k])).join(', ')})`).join(',\n') + ';');
    }
    if (id) rader.push(`select setval(pg_get_serial_sequence('public.${t}', 'id'), (select coalesce(max(id), 1) from public.${t}));`);
  }
  rader.push('', 'commit;', '');
  return rader.join('\n');
}

async function laddaNedBackup() {
  const knapp = document.getElementById('backup'), msg = document.getElementById('backupmsg');
  knapp.disabled = true;
  try {
    const data = {};
    for (const { t, o } of BACKUP) {
      msg.textContent = `Hämtar ${t} …`;
      data[t] = await allaRader(`${t}?select=*&order=${o}`);
    }
    const sql = byggBackup(data);
    const namn = `tht-backup-${new Date().toISOString().slice(0, 10)}.sql`;
    const url = URL.createObjectURL(new Blob([sql], { type: 'application/sql' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: namn });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    const antal = Object.values(data).reduce((s, x) => s + x.length, 0);
    msg.textContent = `Klart: ${namn} (${antal.toLocaleString('sv-SE')} rader, ${(sql.length / 1024).toFixed(0)} kB). Spara den i Dropbox.`;
  } catch (e) {
    msg.textContent = 'Backupen misslyckades: ' + e.message;
  } finally { knapp.disabled = false; }
}

// ---------- spelare ----------
// HCP skrivs som i golfen: "+2,1" är plus-hcp och lagras negativt, precis som i extraslag().
export function tolkaHcp(txt) {
  const t = String(txt ?? '').trim().replace(',', '.').replace(/\s/g, '');
  if (t === '') return null;
  const plus = t.startsWith('+');
  const v = Number(plus ? t.slice(1) : t);
  if (!Number.isFinite(v) || v < -10 || v > 54) return NaN;
  return plus ? -v : v;
}
export function visaHcp(v) {
  if (v === null || v === undefined) return '';
  const n = Number(v);
  const s = Math.abs(n).toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return n < 0 ? '+' + s : s;
}

async function renderSpelare(meddelande = '') {
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Laddar spelare …</p>';
  const bas = 'person?select=id,fornamn,efternamn,aktiv';
  // Antal rundor är bara information – om räkningen inte stöds visas listan ändå.
  const [personer, kontakt] = await Promise.all([
    api(`${bas},runda(count)&order=fornamn,efternamn`, { fresh: true }).catch(() => api(`${bas}&order=fornamn,efternamn`, { fresh: true })),
    api('person_kontakt?select=person_id,golf_id', { fresh: true }).catch(() => []),
  ]);
  // Golf-ID ligger i den skyddade tabellen person_kontakt (syns bara inloggad). HCP lagras inte längre – spel-HCP anges per runda.
  const golfId = Object.fromEntries(kontakt.map((k) => [k.person_id, k.golf_id]));
  personer.forEach((p) => { p.golf_id = golfId[p.id] ?? null; p.harKontakt = p.id in golfId; });
  if (!aktuell(myNav)) return;
  const rundor = (p) => p.runda?.[0]?.count;
  const rad = (p) => `
    <div class="adm-rad" data-id="${p.id}">
      <div class="adm-namn">
        <div class="rn">${esc(p.fornamn)} ${esc(p.efternamn)}</div>
        <div class="meta">${p.golf_id ? 'Golf-ID ' + esc(p.golf_id) : '<span class="saknas">Golf-ID saknas</span>'}${rundor(p) === undefined ? '' : ` · ${rundor(p)} ${rundor(p) === 1 ? 'runda' : 'rundor'}`}</div>
      </div>
      <button class="link" data-andra="${p.id}">Ändra</button>
      <button class="vaxel" role="switch" aria-checked="${p.aktiv}" data-aktiv="${p.id}" aria-label="${esc(p.fornamn)} aktiv">
        <span class="spar" aria-hidden="true"></span>
      </button>
    </div>`;
  const aktiva = personer.filter((p) => p.aktiv), inaktiva = personer.filter((p) => !p.aktiv);

  app.innerHTML = `
    <a class="back" href="#/admin">‹ Admin</a>
    <h1>Spelare</h1>
    <p class="sub">Aktiva spelare går att välja när bollar skapas under Mata in. Spelare tas aldrig bort – gamla resultat hänger på dem.</p>
    ${meddelande ? `<p class="ok" role="status">${esc(meddelande)}</p>` : ''}

    <details class="card adm-ny" ${personer.length ? '' : 'open'}>
      <summary><strong>+ Lägg till spelare</strong></summary>
      ${formular('ny', { fornamn: '', efternamn: '', golf_id: null })}
    </details>

    <h2>Aktiva <span class="muted">(${aktiva.length})</span></h2>
    <div class="card adm-lista">${aktiva.map(rad).join('') || '<p class="muted">Inga aktiva spelare.</p>'}</div>
    <h2>Inaktiva <span class="muted">(${inaktiva.length})</span></h2>
    <div class="card adm-lista">${inaktiva.map(rad).join('') || '<p class="muted">Inga inaktiva spelare.</p>'}</div>`;

  koppla('ny', null, personer);

  app.querySelectorAll('[data-aktiv]').forEach((b) => b.onclick = async () => {
    const id = Number(b.dataset.aktiv);
    const ny = b.getAttribute('aria-checked') !== 'true';
    b.disabled = true;
    try {
      await write('PATCH', `person?id=eq.${id}`, { aktiv: ny }, 'return=minimal');
      const p = personer.find((x) => x.id === id);
      renderSpelare(`${p.fornamn} är nu ${ny ? 'aktiv' : 'inaktiv'}.`);
    } catch (e) { b.disabled = false; alertFel(e); }
  });

  app.querySelectorAll('[data-andra]').forEach((b) => b.onclick = () => {
    const id = Number(b.dataset.andra);
    const p = personer.find((x) => x.id === id);
    const radEl = b.closest('.adm-rad');
    radEl.outerHTML = `<div class="adm-rad redigera" data-id="${id}">${formular(id, p)}</div>`;
    koppla(id, p, personer);
    document.getElementById(`fn-${id}`).focus();
  });
}

function formular(key, p) {
  const ny = key === 'ny';
  return `
    <form class="form adm-form" id="f-${key}" novalidate>
      <div class="adm-falt">
        <label>Förnamn<input type="text" id="fn-${key}" value="${esc(p.fornamn)}" autocomplete="off" required></label>
        <label>Efternamn<input type="text" id="en-${key}" value="${esc(p.efternamn)}" autocomplete="off" required></label>
        <label><span>Golf-ID <span class="muted">(valfritt)</span></span><input type="text" inputmode="numeric" id="gid-${key}" value="${esc(p.golf_id ?? '')}" placeholder="ÅÅMMDD-NNN" autocomplete="off"></label>
      </div>
      <p class="hint" id="msg-${key}" role="status"></p>
      <div class="adm-knappar">
        <button class="btn primary" type="submit">${ny ? 'Lägg till' : 'Spara'}</button>
        ${ny ? '' : '<button class="btn" type="button" data-avbryt>Avbryt</button>'}
      </div>
    </form>`;
}

function koppla(key, p, personer) {
  const f = document.getElementById(`f-${key}`);
  const msg = document.getElementById(`msg-${key}`);
  const fnEl = document.getElementById(`fn-${key}`);
  const varna = () => {
    // Appen visar bara förnamn i listor och grafer – varna för dubbletter.
    const fn = fnEl.value.trim().toLowerCase();
    const krock = fn && personer.find((x) => x.id !== p?.id && x.aktiv && x.fornamn.toLowerCase() === fn);
    msg.textContent = krock ? `Obs: det finns redan en aktiv ${krock.fornamn} (${krock.efternamn}). Appen visar bara förnamn, så överväg t.ex. "${krock.fornamn} B".` : '';
  };
  fnEl.oninput = varna;
  f.querySelector('[data-avbryt]')?.addEventListener('click', () => renderSpelare());
  f.onsubmit = async (e) => {
    e.preventDefault();
    const fornamn = fnEl.value.trim();
    const efternamn = document.getElementById(`en-${key}`).value.trim();
    const golf_id = document.getElementById(`gid-${key}`).value.trim() || null;
    if (!fornamn || !efternamn) { msg.textContent = 'Fyll i både förnamn och efternamn.'; return; }
    if (!p && personer.some((x) => x.fornamn.toLowerCase() === fornamn.toLowerCase() && x.efternamn.toLowerCase() === efternamn.toLowerCase())) {
      msg.textContent = `${fornamn} ${efternamn} finns redan – sök i listan och aktivera hen i stället.`; return;
    }
    const knapp = f.querySelector('[type=submit]');
    knapp.disabled = true; msg.textContent = 'Sparar …';
    try {
      let pid = p?.id;
      if (p) await write('PATCH', `person?id=eq.${p.id}`, { fornamn, efternamn }, 'return=minimal');
      else [{ id: pid }] = await write('POST', 'person', { fornamn, efternamn, aktiv: true });
      if (golf_id !== (p?.golf_id ?? null) && (golf_id || p?.harKontakt)) {
        await write('POST', 'person_kontakt?on_conflict=person_id', { person_id: pid, golf_id }, 'resolution=merge-duplicates,return=minimal');
      }
      renderSpelare(p ? `${fornamn} ${efternamn} är uppdaterad.` : `${fornamn} ${efternamn} är tillagd som aktiv spelare.`);
    } catch (e2) {
      knapp.disabled = false;
      msg.textContent = e2.status === 401 ? 'Inloggningen har gått ut – ladda om sidan och logga in igen.' : `Kunde inte spara: ${e2.message}`;
    }
  };
}

function alertFel(e) {
  const s = app.querySelector('.sub');
  if (s) s.insertAdjacentHTML('afterend', `<p class="err" role="alert">Kunde inte spara: ${esc(e.message)}</p>`);
}
