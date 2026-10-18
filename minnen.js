// Minnesvärda moment: kommentarer för en deltävling, en boll eller en spelares runda (tabellen kommentar, migrering 21).
// Admin och markör kan alltid skriva, ändra och ta bort – även i avslutade THT. Alla kan läsa.
// Används i Mata in (deltävlingens bollar), på årssidan under varje deltävling, på scorekortet och i årsrapporten.
import { api, allaRader, write, esc, arAdmin, arMarkor } from './lib.js?v=0.34.0';

export const kanSkriva = () => arAdmin() || arMarkor();
const RUNDOR = 'id,deltavling_id,person_id,boll_nr,person(fornamn)';

// Hämta kommentarer och rundor (för namn och bollar) för en eller flera deltävlingar
export async function hamtaMinnen(dids, { fresh = false } = {}) {
  if (!dids.length) return { kom: [], rundor: [] };
  const lista = dids.join(',');
  const [kom, rundor] = await Promise.all([
    api(`kommentar?deltavling_id=in.(${lista})&select=id,deltavling_id,runda_id,boll_nr,text,skapad,fran_lank&order=skapad,id`, { fresh }),
    api(`runda?deltavling_id=in.(${lista})&select=${RUNDOR}&order=boll_nr,id`, { fresh }),
  ]);
  return { kom, rundor };
}

// Vem/vad kommentaren gäller
export function vem(k, rundor) {
  if (k.runda_id) { const r = rundor.find((x) => x.id === k.runda_id); return (r?.person?.fornamn ?? 'Spelare') + (k.fran_lank ? ' minns' : ''); }
  if (k.boll_nr != null) return `Boll ${k.boll_nr}`;
  return 'Alla';
}
const dag = (t) => String(t ?? '').slice(0, 10);

export function minnenLista(kom, rundor, { redigera = false } = {}) {
  if (!kom.length) return '<p class="muted mm-tom">Inga minnesvärda moment ännu.</p>';
  return `<ul class="mm-lista">${kom.map((k) => `<li data-id="${k.id}">
    <span class="mm-vem">${esc(vem(k, rundor))}</span>
    <span class="mm-text">${esc(k.text)}</span>
    <span class="mm-fot"><span class="muted">${dag(k.skapad)}</span>${redigera ? ` <button type="button" class="link mm-andra" data-id="${k.id}">Ändra</button> <button type="button" class="link mm-bort" data-id="${k.id}">Ta bort</button>` : ''}</span>
  </li>`).join('')}</ul>`;
}

function formular(did, rundor) {
  const rs = rundor.filter((r) => r.deltavling_id === did);
  const bollar = [...new Set(rs.map((r) => r.boll_nr).filter((b) => b != null))].sort((a, b) => a - b);
  return `<form class="mm-form card" data-did="${did}">
    <label><span class="meta">Gäller</span>
      <select name="vem">
        <option value="d">Alla – hela deltävlingen</option>
        ${bollar.length ? `<optgroup label="Boll">${bollar.map((b) => `<option value="b${b}">Boll ${b}</option>`).join('')}</optgroup>` : ''}
        ${rs.length ? `<optgroup label="Spelare">${rs.slice().sort((a, b) => (a.person?.fornamn ?? '').localeCompare(b.person?.fornamn ?? '', 'sv')).map((r) => `<option value="r${r.id}">${esc(r.person?.fornamn ?? '?')}${r.boll_nr != null ? ` (boll ${r.boll_nr})` : ''}</option>`).join('')}</optgroup>` : ''}
      </select></label>
    <label><span class="meta">Vad hände?</span>
      <textarea name="text" rows="2" maxlength="500" placeholder="t.ex. chip in från 40 m på 7:an, åskvarning på 14:e" required></textarea></label>
    <button class="btn primary" type="submit">Spara minnesvärt moment</button>
    <p class="hint mm-msg" role="status"></p>
  </form>`;
}

// Ritar listan (och formuläret för admin/markör) för EN deltävling i el. data = förhämtat { kom, rundor } (valfritt).
export async function minnenWidget(el, did, data = null, { onAndrat } = {}) {
  let { kom, rundor } = data ?? await hamtaMinnen([did]);
  const skriv = kanSkriva();
  const rita = () => {
    const mina = kom.filter((k) => k.deltavling_id === did);
    el.innerHTML = `${minnenLista(mina, rundor, { redigera: skriv })}${skriv ? formular(did, rundor) : ''}`;
    koppla();
  };
  const ladda = async () => { ({ kom, rundor } = await hamtaMinnen([did], { fresh: true })); rita(); onAndrat?.(kom.filter((k) => k.deltavling_id === did)); };
  function koppla() {
    const form = el.querySelector('.mm-form');
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      const msg = form.querySelector('.mm-msg'), text = form.text.value.trim(), v = form.vem.value;
      if (!text) { msg.textContent = 'Skriv vad som hände.'; return; }
      const rad = { deltavling_id: did, text };
      if (v.startsWith('b')) rad.boll_nr = Number(v.slice(1));
      if (v.startsWith('r')) rad.runda_id = Number(v.slice(1));
      msg.textContent = 'Sparar …';
      try { await write('POST', 'kommentar', rad, 'return=minimal'); await ladda(); }
      catch (err) { msg.textContent = `Kunde inte spara: ${err.message}`; }
    };
    el.querySelectorAll('.mm-bort').forEach((b) => b.onclick = async () => {
      if (!b.classList.contains('bekrafta')) { b.classList.add('bekrafta'); b.textContent = 'Säker? Ta bort'; return; }
      try { await write('DELETE', `kommentar?id=eq.${b.dataset.id}`, undefined, 'return=minimal'); await ladda(); }
      catch (err) { b.textContent = `Fel: ${err.message}`; }
    });
    el.querySelectorAll('.mm-andra').forEach((b) => b.onclick = () => {
      const k = kom.find((x) => String(x.id) === b.dataset.id), li = b.closest('li');
      li.innerHTML = `<span class="mm-vem">${esc(vem(k, rundor))}</span>
        <textarea class="mm-ny" rows="2" maxlength="500">${esc(k.text)}</textarea>
        <span class="mm-fot"><button type="button" class="btn small primary mm-spara">Spara</button> <button type="button" class="link mm-avbryt">Avbryt</button></span>`;
      li.querySelector('.mm-avbryt').onclick = rita;
      li.querySelector('.mm-spara').onclick = async () => {
        const text = li.querySelector('.mm-ny').value.trim();
        if (!text) return;
        try { await write('PATCH', `kommentar?id=eq.${k.id}`, { text }, 'return=minimal'); await ladda(); }
        catch (err) { li.querySelector('.mm-fot').insertAdjacentHTML('beforeend', ` <span class="err">${esc(err.message)}</span>`); }
      };
    });
  }
  rita();
  return { valj: (v) => { const f = el.querySelector('.mm-form'); if (f) { f.vem.value = v; f.text.focus(); } } };
}

// ---------- All-time → Minnen: krönikor och minnesvärda moment år för år ----------
const kronika = (t) => t.trim().split(/\n\s*\n/).map((st) => `<p>${esc(st).replace(/\n/g, '<br>')}</p>`).join('');
let nyastForst = false;
export async function minnenAlltime(el) {
  const [thts, delt, kom] = await Promise.all([
    api('tht?select=nr,artal,ort,kronika&nr=gt.0&order=artal'),
    api('deltavling?select=id,tht_nr,ordning,banversion(bana(namn))&tht_nr=gt.0&order=tht_nr,ordning'),
    allaRader('kommentar?select=id,deltavling_id,runda_id,boll_nr,text,skapad,fran_lank&order=skapad,id'),
  ]);
  const rid = [...new Set(kom.map((k) => k.runda_id).filter(Boolean))];
  const rundor = rid.length ? await api(`runda?id=in.(${rid.join(',')})&select=${RUNDOR}`) : [];
  const ar = thts.map((t) => {
    const ds = delt.filter((d) => d.tht_nr === t.nr).map((d) => ({ ...d, kom: kom.filter((k) => k.deltavling_id === d.id) })).filter((d) => d.kom.length);
    return { ...t, ds, n: ds.reduce((a, d) => a + d.kom.length, 0) };
  }).filter((t) => t.n || t.kronika?.trim());
  const rita = () => {
    const lista = nyastForst ? ar.slice().reverse() : ar;
    const tot = ar.reduce((a, t) => a + t.n, 0);
    el.innerHTML = `
      <div class="seg" role="group" aria-label="Ordning"><button type="button" data-o="0" class="${nyastForst ? '' : 'on'}">Äldst först</button><button type="button" data-o="1" class="${nyastForst ? 'on' : ''}">Nyast först</button></div>
      <p class="hint">${((k) => `${k} ${k === 1 ? 'krönika' : 'krönikor'}`)(ar.filter((t) => t.kronika?.trim()).length)} och ${tot} minnesvärda moment. Tryck på ett år för att fälla ut.</p>
      ${lista.map((t) => `<details class="card mm-ar-alla">
        <summary><strong>${t.artal}</strong> · ${esc(t.ort)} <span class="muted">(${t.n}${t.kronika?.trim() ? ' + krönika' : ''})</span></summary>
        ${t.kronika?.trim() ? `<h3>Krönika</h3><div class="kronika">${kronika(t.kronika)}</div>` : ''}
        ${t.ds.map((d) => `<h3>R${d.ordning}${d.banversion?.bana?.namn ? ' · ' + esc(d.banversion.bana.namn) : ''} <span class="muted">(${d.kom.length})</span></h3>${minnenLista(d.kom, rundor)}`).join('')}
        <p><a class="lank-pil" href="#/ar/${t.artal}">Årssidan ${t.artal} ›</a></p>
      </details>`).join('') || '<p class="muted">Inga krönikor eller minnesvärda moment ännu.</p>'}`;
    el.querySelectorAll('[data-o]').forEach((b) => b.onclick = () => { nyastForst = b.dataset.o === '1'; rita(); });
  };
  rita();
}
