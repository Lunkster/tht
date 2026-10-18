// Banbetyg via personlig länk (#/betyg/<kod>) – ingen inloggning, en länk per spelare för alla år.
// Databasen kontrollerar koden och tar bara emot betyg på banor som spelaren spelade respektive THT.
// Här skriver spelaren också ETT eget minnesvärt moment per deltävling hen spelat (bara om sig själv, migrering 23).
import { rpc, esc } from './lib.js?v=0.33.1';

const app = document.getElementById('app');

export async function renderBetygLank(kod) {
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  const [info, minnen] = await Promise.all([rpc('betyg_lank_info', { p_kod: kod }), rpc('minne_lank_info', { p_kod: kod }).catch(() => [])]);
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
  // Egna minnesvärda moment: ett per deltävling
  const minne = Object.fromEntries((minnen ?? []).map((m) => [m.deltavling_id, m.text ?? '']));
  const minneOrig = { ...minne };
  const minnenFor = (t) => (minnen ?? []).filter((m) => m.tht_nr === t.tht_nr).sort((a, b) => a.ordning - b.ordning);
  const minnesRutor = (t) => { const ms = minnenFor(t); return ms.length ? `
        <div class="mm-lank"><h3>Det du minns</h3><p class="hint">Ett minnesvärt moment per deltävling – om dig själv eller någon annan i gänget.</p>
        ${ms.map((m) => `<label class="mm-lank-rad"><span class="meta">R${m.ordning}${m.bana ? ' · ' + esc(m.bana) : ''}</span>
          <textarea rows="2" maxlength="500" data-did="${m.deltavling_id}" placeholder="t.ex. Robert sänkte bunkerslaget på 17:an">${esc(m.text ?? '')}</textarea></label>`).join('')}</div>` : ''; };

  const rad = (t, b) => `
    <div class="round betyg-rad">
      <div><div class="rn">${esc(b.namn)}</div><div class="meta" data-txt="${nyckel(t, b)}"></div></div>
      <div class="stjarnval" role="radiogroup" aria-label="Betyg för ${esc(b.namn)} ${t.artal}">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" data-k="${nyckel(t, b)}" data-v="${n}" aria-label="${n} av 5">★</button>`).join('')}
      </div>
    </div>`;

  app.innerHTML = `
    <h1>Banbetyg och minnen</h1>
    <div class="card"><p>Hej ${esc(info.fornamn)}! Ge banorna du har spelat på THT ett betyg från 1 till 5 – <strong>5 = bäst</strong>. Betyg du redan har satt syns med guldstjärnor och kan ändras. Tryck på samma stjärna igen för att ta bort ett betyg.</p><p>Under varje år kan du också skriva ett <strong>minnesvärt moment</strong> för varje deltävling du spelade – om dig själv eller om någon annan. Det syns på årssidan och under All-time → Minnen.</p></div>
    ${info.tht.map((t, i) => `
      <details class="betyg-ar" ${i < 2 ? 'open' : ''}>
        <summary><strong>THT ${t.tht_nr} · ${esc(t.ort)} ${t.artal}</strong> <span class="muted" data-antal="${t.tht_nr}"></span></summary>
        <div class="rounds">${(t.banor ?? []).map((b) => rad(t, b)).join('')}</div>
        ${minnesRutor(t)}
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
  const andradeMinnen = () => Object.keys(minne).filter((d) => minne[d].trim() !== minneOrig[d].trim());
  const visaAntal = () => { const n = andrade().length + andradeMinnen().length; document.getElementById('msg').textContent = n ? `${n} ändrade – tryck Spara` : ''; };
  app.querySelectorAll('.mm-lank textarea').forEach((ta) => ta.oninput = () => { minne[ta.dataset.did] = ta.value; visaAntal(); });
  app.querySelectorAll('.stjarnval button').forEach((k) => k.onclick = () => {
    const v = Number(k.dataset.v);
    valda[k.dataset.k] = valda[k.dataset.k] === v ? null : v;
    visa();
    visaAntal();
  });
  const spara = document.getElementById('spara');
  if (spara) spara.onclick = async () => {
    const msg = document.getElementById('msg');
    const lista = andrade().map((k) => { const [t, b] = k.split('-').map(Number); return { tht_nr: t, bana_id: b, betyg: valda[k] }; });
    const mlista = andradeMinnen();
    if (!lista.length && !mlista.length) { msg.textContent = 'Inget att spara.'; return; }
    spara.disabled = true; msg.textContent = 'Sparar …';
    try {
      if (lista.length) await rpc('lamna_banbetyg', { p_kod: kod, p_betyg: lista });
      lista.forEach((x) => { orig[`${x.tht_nr}-${x.bana_id}`] = x.betyg; });
      for (const d of mlista) { await rpc('lamna_minne', { p_kod: kod, p_deltavling_id: Number(d), p_text: minne[d] }); minneOrig[d] = minne[d]; }
      msg.textContent = 'Tack! Det är sparat.';
    } catch (e) { msg.textContent = 'Kunde inte spara: ' + e.message; }
    spara.disabled = false;
  };
}
