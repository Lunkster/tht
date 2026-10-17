// Admin: banbetyg – varje spelares betyg 1–5 på årets banor (tabellen ban_betyg).
import { api, write, esc, fmt, nuNav, aktuell, arMarkor, arAdmin } from './lib.js?v=0.20.0';

const app = document.getElementById('app');
const tillbaka = () => arMarkor() ? '<a class="back" href="#/mata">‹ Mata in</a>' : '<a class="back" href="#/admin">‹ Admin</a>';

export async function renderBanbetyg(meddelande = '') {
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  const thts = await api('tht?select=nr,artal,ort,klar,deltavling(id)&order=nr.desc', { fresh: true });
  if (!aktuell(myNav)) return;
  const med = thts.filter((t) => t.deltavling.length); // banbetyg får anges även för avslutade THT (även av markör)
  let valt = Number(sessionStorage.getItem('betyg-tht')) || med[0]?.nr;
  if (!med.some((t) => t.nr === valt)) valt = med[0]?.nr;
  if (!valt) { app.innerHTML = `${tillbaka()}<h1>Banbetyg</h1><p class="muted">Inga deltävlingar ännu.</p>`; return; }

  const [delt, rundor, betyg, personer, lankar, kontakt] = await Promise.all([
    api(`deltavling?tht_nr=eq.${valt}&select=ordning,banversion(bana(id,namn))&order=ordning`, { fresh: true }),
    api(`v_runda?tht_nr=eq.${valt}&select=person_id,ordning`, { fresh: true }),
    api(`ban_betyg?tht_nr=eq.${valt}&select=bana_id,person_id,betyg`, { fresh: true }),
    api('person?select=id,fornamn,efternamn&order=fornamn', { fresh: true }),
    api(`betyg_lank?tht_nr=eq.${valt}&select=kod,person_id,anvand`, { fresh: true }).catch(() => []),
    arAdmin() ? api('person_kontakt?select=person_id,epost', { fresh: true }).catch(() => []) : [],   // e-post: bara admin
  ]);
  if (!aktuell(myNav)) return;
  // Banor i spelordning (samma bana två dagar räknas en gång)
  const banor = [];
  delt.forEach((d) => { const b = d.banversion?.bana; if (b && !banor.some((x) => x.id === b.id)) banor.push(b); });
  // Spelare: de som spelade året, plus de som redan har betyg
  const ids = new Set([...rundor.map((r) => r.person_id), ...betyg.map((b) => b.person_id)]);
  const spelare = personer.filter((p) => ids.has(p.id));
  // Bara den som spelade banan det året får betygsätta den (befintliga betyg visas ändå).
  const banaFor = Object.fromEntries(delt.map((d) => [d.ordning, d.banversion?.bana?.id]));
  const spelat = new Set(rundor.map((r) => `${r.person_id}-${banaFor[r.ordning]}`));
  const orig = Object.fromEntries(betyg.map((b) => [`${b.person_id}-${b.bana_id}`, b.betyg]));
  const tht = thts.find((t) => t.nr === valt);
  // Personliga länkar för spelare med rundor det året
  const harRundor = personer.filter((p) => rundor.some((r) => r.person_id === p.id));
  const lankMap = Object.fromEntries(lankar.map((l) => [l.person_id, l]));
  const epost = Object.fromEntries(kontakt.map((k) => [k.person_id, k.epost]));
  const lankUrl = (kod) => `${location.origin}${location.pathname}#/betyg/${kod}`;
  const antalBetyg = (pid) => betyg.filter((b) => b.person_id === pid).length;
  const mejl = (p, kod) => `mailto:${encodeURIComponent(epost[p.id] ?? '')}?subject=${encodeURIComponent(`Banbetyg THT ${tht.nr} – ${tht.ort} ${tht.artal}`)}&body=${encodeURIComponent(`Hej ${p.fornamn}!\n\nVad tyckte du om banorna på THT i ${tht.ort} ${tht.artal}? Ge dem ett betyg 1–5 här:\n${lankUrl(kod)}\n\nLänken är personlig – dela den inte.\n`)}`;
  const lankRad = (p) => {
    const l = lankMap[p.id], n = antalBetyg(p.id);
    const status = !l ? 'ingen länk ännu' : l.anvand ? `har svarat · ${n} betyg` : n ? `${n} betyg (inlagda av admin/markör)` : 'länk skapad, inget svar ännu';
    return `<div class="round lankrad"><div><div class="rn">${esc(p.fornamn)} ${esc(p.efternamn)}</div><div class="meta">${status}</div></div>
      <div class="lankknappar">${l
        ? `<button class="btn" type="button" data-kopiera="${l.kod}">Kopiera</button><a class="btn" href="${mejl(p, l.kod)}">Mejla</a>`
        : `<button class="btn" type="button" data-skapa="${p.id}">Skapa länk</button>`}</div></div>`;
  };

  const cell = (p, b) => {
    const v = orig[`${p.id}-${b.id}`] ?? '';
    if (v === '' && !spelat.has(`${p.id}-${b.id}`)) return '<td class="dim" title="Spelade inte banan">·</td>';
    return `<td><select class="betyg" data-p="${p.id}" data-b="${b.id}" aria-label="${esc(p.fornamn)}, ${esc(b.namn)}">
      <option value="" ${v === '' ? 'selected' : ''}>–</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${v === n ? 'selected' : ''}>${n}</option>`).join('')}</select></td>`;
  };
  const snitt = (b) => { const xs = spelare.map((p) => orig[`${p.id}-${b.id}`]).filter(Boolean); return xs.length ? fmt(xs.reduce((a, x) => a + x, 0) / xs.length, 1) : '–'; };

  app.innerHTML = `
    ${tillbaka()}
    <h1>Banbetyg</h1>
    <div class="yearbar"><select id="betygtht" aria-label="Välj THT">
      ${med.map((t) => `<option value="${t.nr}" ${t.nr === valt ? 'selected' : ''}>THT ${t.nr} · ${esc(t.ort)} ${t.artal}</option>`).join('')}
    </select></div>
    ${meddelande ? `<p class="ok" role="status">${esc(meddelande)}</p>` : ''}
    <p class="sub">Betyg 1–5 per spelare och bana för ${esc(tht.ort)} ${tht.artal}. 5 = bäst. Lämna "–" om spelaren inte betygsatt banan. Bara den som spelade banan kan få betyg (· = spelade inte).</p>
    <div class="tablewrap betygtabell"><table>
      <thead><tr><th class="l">Spelare</th>${banor.map((b) => `<th title="${esc(b.namn)}">${esc(b.namn.replace(/ (GK|Golfklubb|Golf & Countryclub|Golfbana)$/i, ''))}</th>`).join('')}</tr></thead>
      <tbody>${spelare.map((p) => `<tr><th scope="row" class="l">${esc(p.fornamn)}</th>${banor.map((b) => cell(p, b)).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><th class="l">Snitt</th>${banor.map((b) => `<td><strong>${snitt(b)}</strong></td>`).join('')}</tr></tfoot>
    </table></div>
    <div class="sparbar"><p class="hint" id="betygmsg" role="status"></p><button class="btn primary" id="sparabetyg">Spara</button></div>

    <h2>Personliga länkar</h2>
    <p class="sub">Varje spelare får en egen länk och betygsätter själv banorna hen spelade ${tht.artal} – utan inloggning. Länken är personlig: den som har den kan bara betygsätta i den spelarens namn.</p>
    ${harRundor.length ? `<div class="rounds">${harRundor.map(lankRad).join('')}</div>
    ${harRundor.some((p) => !lankMap[p.id]) ? '<div class="adm-knappar"><button class="btn" type="button" id="allalankar">Skapa länkar för alla</button></div>' : ''}
    <p class="hint" id="lankmsg" role="status"></p>` : '<p class="muted">Inga rundor inlagda för året – länkar kan skapas när rundorna finns.</p>'}`;

  document.getElementById('betygtht').onchange = (e) => { try { sessionStorage.setItem('betyg-tht', e.target.value); } catch { /* */ } renderBanbetyg(); };
  app.querySelectorAll('select.betyg').forEach((s) => s.onchange = () => {
    s.classList.toggle('andrad', (Number(s.value) || null) !== (orig[`${s.dataset.p}-${s.dataset.b}`] ?? null));
    const n = app.querySelectorAll('select.betyg.andrad').length;
    document.getElementById('betygmsg').textContent = n ? `${n} ändrade betyg` : '';
  });

  const lankmsg = () => document.getElementById('lankmsg');
  const skapa = async (ids) => {
    try {
      await write('POST', 'betyg_lank?on_conflict=tht_nr,person_id', ids.map((id) => ({ tht_nr: valt, person_id: id })), 'resolution=ignore-duplicates,return=minimal');
      renderBanbetyg(ids.length === 1 ? 'Länken är skapad.' : `${ids.length} länkar skapade.`);
    } catch (e) { lankmsg().textContent = 'Kunde inte skapa länk: ' + (e.status === 401 ? 'logga in igen.' : e.message); }
  };
  app.querySelectorAll('[data-skapa]').forEach((k) => k.onclick = () => { k.disabled = true; skapa([Number(k.dataset.skapa)]); });
  const alla = document.getElementById('allalankar');
  if (alla) alla.onclick = () => { alla.disabled = true; skapa(harRundor.filter((p) => !lankMap[p.id]).map((p) => p.id)); };
  app.querySelectorAll('[data-kopiera]').forEach((k) => k.onclick = async () => {
    const url = lankUrl(k.dataset.kopiera);
    try { await navigator.clipboard.writeText(url); lankmsg().textContent = 'Länken är kopierad.'; }
    catch { window.prompt('Kopiera länken:', url); }
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
