// Admin: banbetyg – varje spelares betyg 1–5 på årets banor (tabellen ban_betyg).
import { api, write, esc, fmt, nuNav, aktuell } from './lib.js?v=0.17.0';

const app = document.getElementById('app');

export async function renderBanbetyg(meddelande = '') {
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  const thts = await api('tht?select=nr,artal,ort,deltavling(id)&order=nr.desc', { fresh: true });
  if (!aktuell(myNav)) return;
  const med = thts.filter((t) => t.deltavling.length);
  let valt = Number(sessionStorage.getItem('betyg-tht')) || med[0]?.nr;
  if (!med.some((t) => t.nr === valt)) valt = med[0]?.nr;
  if (!valt) { app.innerHTML = '<a class="back" href="#/admin">‹ Admin</a><h1>Banbetyg</h1><p class="muted">Inga deltävlingar ännu.</p>'; return; }

  const [delt, rundor, betyg, personer] = await Promise.all([
    api(`deltavling?tht_nr=eq.${valt}&select=ordning,banversion(bana(id,namn))&order=ordning`, { fresh: true }),
    api(`v_runda?tht_nr=eq.${valt}&select=person_id`, { fresh: true }),
    api(`ban_betyg?tht_nr=eq.${valt}&select=bana_id,person_id,betyg`, { fresh: true }),
    api('person?select=id,fornamn,efternamn&order=fornamn', { fresh: true }),
  ]);
  if (!aktuell(myNav)) return;
  // Banor i spelordning (samma bana två dagar räknas en gång)
  const banor = [];
  delt.forEach((d) => { const b = d.banversion?.bana; if (b && !banor.some((x) => x.id === b.id)) banor.push(b); });
  // Spelare: de som spelade året, plus de som redan har betyg
  const ids = new Set([...rundor.map((r) => r.person_id), ...betyg.map((b) => b.person_id)]);
  const spelare = personer.filter((p) => ids.has(p.id));
  const orig = Object.fromEntries(betyg.map((b) => [`${b.person_id}-${b.bana_id}`, b.betyg]));
  const tht = thts.find((t) => t.nr === valt);

  const cell = (p, b) => {
    const v = orig[`${p.id}-${b.id}`] ?? '';
    return `<td><select class="betyg" data-p="${p.id}" data-b="${b.id}" aria-label="${esc(p.fornamn)}, ${esc(b.namn)}">
      <option value="" ${v === '' ? 'selected' : ''}>–</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${v === n ? 'selected' : ''}>${n}</option>`).join('')}</select></td>`;
  };
  const snitt = (b) => { const xs = spelare.map((p) => orig[`${p.id}-${b.id}`]).filter(Boolean); return xs.length ? fmt(xs.reduce((a, x) => a + x, 0) / xs.length, 1) : '–'; };

  app.innerHTML = `
    <a class="back" href="#/admin">‹ Admin</a>
    <h1>Banbetyg</h1>
    <div class="yearbar"><select id="betygtht" aria-label="Välj THT">
      ${med.map((t) => `<option value="${t.nr}" ${t.nr === valt ? 'selected' : ''}>THT ${t.nr} · ${esc(t.ort)} ${t.artal}</option>`).join('')}
    </select></div>
    ${meddelande ? `<p class="ok" role="status">${esc(meddelande)}</p>` : ''}
    <p class="sub">Betyg 1–5 per spelare och bana för ${esc(tht.ort)} ${tht.artal}. 5 = bäst. Lämna "–" om spelaren inte betygsatt banan.</p>
    <div class="tablewrap betygtabell"><table>
      <thead><tr><th class="l">Spelare</th>${banor.map((b) => `<th title="${esc(b.namn)}">${esc(b.namn.replace(/ (GK|Golfklubb|Golf & Countryclub|Golfbana)$/i, ''))}</th>`).join('')}</tr></thead>
      <tbody>${spelare.map((p) => `<tr><th scope="row" class="l">${esc(p.fornamn)}</th>${banor.map((b) => cell(p, b)).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><th class="l">Snitt</th>${banor.map((b) => `<td><strong>${snitt(b)}</strong></td>`).join('')}</tr></tfoot>
    </table></div>
    <div class="sparbar"><p class="hint" id="betygmsg" role="status"></p><button class="btn primary" id="sparabetyg">Spara</button></div>`;

  document.getElementById('betygtht').onchange = (e) => { try { sessionStorage.setItem('betyg-tht', e.target.value); } catch { /* */ } renderBanbetyg(); };
  app.querySelectorAll('select.betyg').forEach((s) => s.onchange = () => {
    s.classList.toggle('andrad', (Number(s.value) || null) !== (orig[`${s.dataset.p}-${s.dataset.b}`] ?? null));
    const n = app.querySelectorAll('select.betyg.andrad').length;
    document.getElementById('betygmsg').textContent = n ? `${n} ändrade betyg` : '';
  });

  document.getElementById('sparabetyg').onclick = async () => {
    const msg = document.getElementById('betygmsg'), knapp = document.getElementById('sparabetyg');
    const andrade = [...app.querySelectorAll('select.betyg.andrad')].map((s) => ({ person_id: Number(s.dataset.p), bana_id: Number(s.dataset.b), betyg: Number(s.value) || null }));
    if (!andrade.length) { msg.textContent = 'Inget att spara.'; return; }
    knapp.disabled = true; msg.textContent = 'Sparar …';
    try {
      const satta = andrade.filter((x) => x.betyg).map((x) => ({ tht_nr: valt, ...x }));
      if (satta.length) await write('POST', 'ban_betyg?on_conflict=tht_nr,bana_id,person_id', satta, 'resolution=merge-duplicates,return=minimal');
      for (const x of andrade.filter((y) => !y.betyg)) {
        await write('DELETE', `ban_betyg?tht_nr=eq.${valt}&bana_id=eq.${x.bana_id}&person_id=eq.${x.person_id}`, undefined, 'return=minimal');
      }
      renderBanbetyg(`${andrade.length} betyg sparade.`);
    } catch (e) { knapp.disabled = false; msg.textContent = 'Kunde inte spara: ' + (e.status === 401 ? 'logga in igen.' : e.message); }
  };
}
