// Banbetyg via personlig länk (#/betyg/<kod>) – ingen inloggning. Databasen kontrollerar koden
// och tar bara emot betyg på banor som spelaren spelade den THT:n.
import { rpc, esc } from './lib.js?v=0.20.0';

const app = document.getElementById('app');

export async function renderBetygLank(kod) {
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  const info = await rpc('betyg_lank_info', { p_kod: kod });
  if (!info) {
    app.innerHTML = '<h1>Banbetyg</h1><div class="card"><p>Länken finns inte eller har tagits bort.</p><p class="hint">Be den som skickade länken om en ny.</p></div>';
    return;
  }
  const valda = Object.fromEntries(info.banor.map((b) => [b.bana_id, b.betyg == null ? null : Number(b.betyg)]));
  const orig = { ...valda };

  const rad = (b) => `
    <div class="round betyg-rad">
      <div><div class="rn">${esc(b.namn)}</div><div class="meta" id="txt-${b.bana_id}"></div></div>
      <div class="stjarnval" role="radiogroup" aria-label="Betyg för ${esc(b.namn)}">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" data-b="${b.bana_id}" data-v="${n}" aria-label="${n} av 5">★</button>`).join('')}
      </div>
    </div>`;

  app.innerHTML = `
    <h1>Banbetyg</h1>
    <p class="sub">THT ${info.tht_nr} · ${esc(info.ort)} ${info.artal}</p>
    <div class="card"><p>Hej ${esc(info.fornamn)}! Ge banorna du spelade ett betyg från 1 till 5 – <strong>5 = bäst</strong>. Tryck på samma stjärna igen för att ta bort ett betyg. Du kan ändra dig senare med samma länk.</p></div>
    ${info.banor.length ? `<div class="rounds">${info.banor.map(rad).join('')}</div>
    <div class="sparbar"><p class="hint" id="msg" role="status"></p><button class="btn primary" id="spara">Spara</button></div>`
    : '<p class="muted">Det finns inga rundor för dig den här THT:n.</p>'}
    <p class="hint">Länken är personlig – dela den inte.</p>`;

  const TEXT = ['', 'Dålig', 'Sådär', 'Bra', 'Mycket bra', 'Toppen'];
  const visa = () => info.banor.forEach((b) => {
    const v = valda[b.bana_id];
    app.querySelectorAll(`.stjarnval button[data-b="${b.bana_id}"]`).forEach((k) => {
      k.classList.toggle('on', v != null && Number(k.dataset.v) <= v);
      k.setAttribute('aria-checked', String(Number(k.dataset.v) === v));
    });
    document.getElementById(`txt-${b.bana_id}`).textContent = v ? `${v} av 5 · ${TEXT[v]}` : 'inget betyg';
  });
  visa();
  app.querySelectorAll('.stjarnval button').forEach((k) => k.onclick = () => {
    const b = Number(k.dataset.b), v = Number(k.dataset.v);
    valda[b] = valda[b] === v ? null : v;
    visa();
    const n = Object.keys(valda).filter((id) => valda[id] !== orig[id]).length;
    document.getElementById('msg').textContent = n ? `${n} ändrade – tryck Spara` : '';
  });
  const spara = document.getElementById('spara');
  if (spara) spara.onclick = async () => {
    const msg = document.getElementById('msg');
    const andrade = Object.keys(valda).filter((id) => valda[id] !== orig[id]).map((id) => ({ bana_id: Number(id), betyg: valda[id] }));
    if (!andrade.length) { msg.textContent = 'Inget att spara.'; return; }
    spara.disabled = true; msg.textContent = 'Sparar …';
    try {
      await rpc('lamna_banbetyg', { p_kod: kod, p_betyg: andrade });
      andrade.forEach((x) => { orig[x.bana_id] = x.betyg; });
      msg.textContent = 'Tack! Dina betyg är sparade.';
    } catch (e) { msg.textContent = 'Kunde inte spara: ' + e.message; }
    spara.disabled = false;
  };
}
