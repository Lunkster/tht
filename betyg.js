// Banbetyg via personlig länk (#/betyg/<kod>) – ingen inloggning, en länk per spelare för alla år.
// Databasen kontrollerar koden och tar bara emot betyg på banor som spelaren spelade respektive THT.
import { rpc, esc } from './lib.js?v=0.23.1';

const app = document.getElementById('app');

export async function renderBetygLank(kod) {
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  const info = await rpc('betyg_lank_info', { p_kod: kod });
  if (!info) {
    app.innerHTML = '<h1>Banbetyg</h1><div class="card"><p>Länken finns inte eller har tagits bort.</p><p class="hint">Be den som skickade länken om en ny.</p></div>';
    return;
  }
  // En nyckel per THT och bana – samma bana kan ha spelats flera år
  const nyckel = (t, b) => `${t.tht_nr}-${b.bana_id}`;
  const valda = {};
  info.tht.forEach((t) => (t.banor ?? []).forEach((b) => { valda[nyckel(t, b)] = b.betyg == null ? null : Number(b.betyg); }));
  const orig = { ...valda };
  const antal = (t) => (t.banor ?? []).filter((b) => valda[nyckel(t, b)] != null).length;

  const rad = (t, b) => `
    <div class="round betyg-rad">
      <div><div class="rn">${esc(b.namn)}</div><div class="meta" data-txt="${nyckel(t, b)}"></div></div>
      <div class="stjarnval" role="radiogroup" aria-label="Betyg för ${esc(b.namn)} ${t.artal}">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" data-k="${nyckel(t, b)}" data-v="${n}" aria-label="${n} av 5">★</button>`).join('')}
      </div>
    </div>`;

  app.innerHTML = `
    <h1>Banbetyg</h1>
    <div class="card"><p>Hej ${esc(info.fornamn)}! Ge banorna du har spelat på THT ett betyg från 1 till 5 – <strong>5 = bäst</strong>. Betyg du redan har satt syns med guldstjärnor och kan ändras. Tryck på samma stjärna igen för att ta bort ett betyg.</p></div>
    ${info.tht.map((t, i) => `
      <details class="betyg-ar" ${i < 2 ? 'open' : ''}>
        <summary><strong>THT ${t.tht_nr} · ${esc(t.ort)} ${t.artal}</strong> <span class="muted" data-antal="${t.tht_nr}"></span></summary>
        <div class="rounds">${(t.banor ?? []).map((b) => rad(t, b)).join('')}</div>
      </details>`).join('') || '<p class="muted">Det finns inga rundor för dig ännu.</p>'}
    ${info.tht.length ? '<div class="sparbar"><p class="hint" id="msg" role="status"></p><button class="btn primary" id="spara">Spara</button></div>' : ''}
    <p class="hint">Länken är personlig – dela den inte. Du kan använda den igen nästa år.</p>`;

  const TEXT = ['', 'Dålig', 'Sådär', 'Bra', 'Mycket bra', 'Toppen'];
  const visa = () => {
    Object.keys(valda).forEach((k) => {
      const v = valda[k];
      app.querySelectorAll(`.stjarnval button[data-k="${k}"]`).forEach((knapp) => {
        knapp.classList.toggle('on', v != null && Number(knapp.dataset.v) <= v);
        knapp.setAttribute('aria-checked', String(Number(knapp.dataset.v) === v));
      });
      app.querySelector(`[data-txt="${k}"]`).textContent = v ? `${v} av 5 · ${TEXT[v]}` : 'inget betyg';
    });
    info.tht.forEach((t) => { app.querySelector(`[data-antal="${t.tht_nr}"]`).textContent = `· ${antal(t)} av ${(t.banor ?? []).length} betygsatta`; });
  };
  visa();
  const andrade = () => Object.keys(valda).filter((k) => valda[k] !== orig[k]);
  app.querySelectorAll('.stjarnval button').forEach((k) => k.onclick = () => {
    const v = Number(k.dataset.v);
    valda[k.dataset.k] = valda[k.dataset.k] === v ? null : v;
    visa();
    const n = andrade().length;
    document.getElementById('msg').textContent = n ? `${n} ändrade – tryck Spara` : '';
  });
  const spara = document.getElementById('spara');
  if (spara) spara.onclick = async () => {
    const msg = document.getElementById('msg');
    const lista = andrade().map((k) => { const [t, b] = k.split('-').map(Number); return { tht_nr: t, bana_id: b, betyg: valda[k] }; });
    if (!lista.length) { msg.textContent = 'Inget att spara.'; return; }
    spara.disabled = true; msg.textContent = 'Sparar …';
    try {
      await rpc('lamna_banbetyg', { p_kod: kod, p_betyg: lista });
      lista.forEach((x) => { orig[`${x.tht_nr}-${x.bana_id}`] = x.betyg; });
      msg.textContent = 'Tack! Dina betyg är sparade.';
    } catch (e) { msg.textContent = 'Kunde inte spara: ' + e.message; }
    spara.disabled = false;
  };
}
