// Admin: grunddata som läggs upp sällan – spelare och banor nu, THT/priser/övernattningar senare.
import { api, write, isLoggedIn, logout, esc, nuNav, aktuell } from './lib.js?v=0.7.0';
import { visaLogin } from './mata.js?v=0.7.0';
import { renderBanor } from './admin-banor.js?v=0.7.0';

const app = document.getElementById('app');

const SEKTIONER = [
  { id: 'spelare', t: 'Spelare', d: 'Lägg till spelare, ändra namn och HCP, aktiv/inaktiv' },
  { id: 'banor', t: 'Banor', d: 'Ny bana, ombyggnad (ny version), tee:er och hål – klistra in scorekort' },
  { id: 'tht', t: 'THT och deltävlingar', d: 'Ny THT med ort och datum, deltävlingar', kommer: true },
  { id: 'priser', t: 'Närmast hål och longest drive', d: 'Hål och vinnare per deltävling', kommer: true },
  { id: 'overnattning', t: 'Övernattningar', d: 'Plats, nätter och organisatör', kommer: true },
];

export async function renderAdmin([sida, ...rest]) {
  if (!isLoggedIn()) return visaLogin('Admin', () => renderAdmin([sida, ...rest]));
  if (sida === 'spelare') return renderSpelare();
  if (sida === 'banor') return renderBanor(rest);
  return renderMeny();
}

function renderMeny() {
  app.innerHTML = `
    <div class="row-between"><h1>Admin</h1><button class="link" id="logout">Logga ut</button></div>
    <p class="sub">Grunddata som läggs upp före eller efter en THT.</p>
    <div class="rounds">
      ${SEKTIONER.map((s) => s.kommer
        ? `<div class="round adm-kommer"><div><div class="rn">${esc(s.t)}</div><div class="meta">${esc(s.d)} · kommer</div></div></div>`
        : `<a class="round link-card" href="#/admin/${s.id}"><div><div class="rn">${esc(s.t)}</div><div class="meta">${esc(s.d)}</div></div><div class="win"><span class="arrow">›</span></div></a>`).join('')}
    </div>`;
  document.getElementById('logout').onclick = () => { logout(); renderAdmin([]); };
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
  const bas = 'person?select=id,fornamn,efternamn,hcp,aktiv';
  // Antal rundor är bara information – om räkningen inte stöds visas listan ändå.
  const personer = await api(`${bas},runda(count)&order=fornamn,efternamn`, { fresh: true })
    .catch(() => api(`${bas}&order=fornamn,efternamn`, { fresh: true }));
  if (!aktuell(myNav)) return;
  const rundor = (p) => p.runda?.[0]?.count;
  const rad = (p) => `
    <div class="adm-rad" data-id="${p.id}">
      <div class="adm-namn">
        <div class="rn">${esc(p.fornamn)} ${esc(p.efternamn)}</div>
        <div class="meta">HCP ${p.hcp === null ? '–' : visaHcp(p.hcp)}${rundor(p) === undefined ? '' : ` · ${rundor(p)} ${rundor(p) === 1 ? 'runda' : 'rundor'}`}</div>
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
      ${formular('ny', { fornamn: '', efternamn: '', hcp: null })}
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
        <label><span>HCP <span class="muted">(valfritt)</span></span><input type="text" inputmode="decimal" id="hcp-${key}" value="${esc(visaHcp(p.hcp))}" placeholder="t.ex. 14,2 eller +1,5" autocomplete="off"></label>
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
    const hcp = tolkaHcp(document.getElementById(`hcp-${key}`).value);
    if (!fornamn || !efternamn) { msg.textContent = 'Fyll i både förnamn och efternamn.'; return; }
    if (Number.isNaN(hcp)) { msg.textContent = 'HCP ska vara ett tal, t.ex. 14,2 – plus-hcp skrivs +1,5.'; return; }
    if (!p && personer.some((x) => x.fornamn.toLowerCase() === fornamn.toLowerCase() && x.efternamn.toLowerCase() === efternamn.toLowerCase())) {
      msg.textContent = `${fornamn} ${efternamn} finns redan – sök i listan och aktivera hen i stället.`; return;
    }
    const knapp = f.querySelector('[type=submit]');
    knapp.disabled = true; msg.textContent = 'Sparar …';
    try {
      if (p) await write('PATCH', `person?id=eq.${p.id}`, { fornamn, efternamn, hcp }, 'return=minimal');
      else await write('POST', 'person', { fornamn, efternamn, hcp, aktiv: true }, 'return=minimal');
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
