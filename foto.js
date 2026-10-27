// Foton (tabellen foto + Storage-bucketen foton, migrering 25). Önskemål Henrik 2026-10-27.
// Bilderna krymps i webbläsaren innan uppladdning: en stor (högst ca 300 kB, 1600 px) och en liten för
// gallerier (<fil>-liten.jpg). Alla får ladda upp – admin och markör i appen, spelarna via sin personliga länk.
// Ingen granskning. Används på årssidan, deltävlingssidan, länksidan, All-time → Minnen och i karusellen.
import { api, rpc, write, lagring, lagringUrl, esc, arAdmin, arMarkor } from './lib.js?v=0.35.3';

export const MAX_BYTE = 300_000;
export const litenFil = (fil) => fil.replace(/\.jpg$/, '-liten.jpg');
export const fotoUrl = (f) => lagringUrl(f.fil);
export const litenUrl = (f) => lagringUrl(litenFil(f.fil));
const kanSkriva = () => arAdmin() || arMarkor();
const URVAL = 'id,tht_nr,deltavling_id,person_id,fil,bredd,hojd,tagen,text,skapad,person(fornamn)';

// Klara foton (filter t.ex. "tht_nr=eq.29"), äldst först
export function hamtaFoton(filter, fresh = false) {
  return api(`foto?${filter}&klar=is.true&borttagen=is.null&select=${URVAL}&order=tagen.asc.nullslast,id`, { fresh });
}

// ---------- EXIF: när bilden togs (DateTimeOriginal, annars DateTime) ----------
export function exifDatum(buf) {
  try {
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xffd8) return null;
    let p = 2;
    while (p + 4 < v.byteLength) {
      const m = v.getUint16(p), len = v.getUint16(p + 2);
      if (m === 0xffe1 && v.getUint32(p + 4) === 0x45786966) {   // "Exif"
        const t = p + 10, le = v.getUint16(t) === 0x4949;
        const u16 = (o) => v.getUint16(t + o, le), u32 = (o) => v.getUint32(t + o, le);
        const text = (o, n) => { let s = ''; for (let i = 0; i < n - 1; i++) s += String.fromCharCode(v.getUint8(t + o + i)); return s; };
        const las = (ifd, tagg) => {
          const n = u16(ifd);
          for (let i = 0; i < n; i++) {
            const e = ifd + 2 + i * 12;
            if (u16(e) === tagg) return { typ: u16(e + 2), antal: u32(e + 4), varde: u32(e + 8) };
          }
          return null;
        };
        const ifd0 = u32(4);
        const exif = las(ifd0, 0x8769);
        const d = (exif && las(exif.varde, 0x9003)) || las(ifd0, 0x0132);
        if (!d || d.typ !== 2) return null;
        const s = text(d.varde, d.antal);
        const mm = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
        if (!mm || mm[1] === '0000') return null;
        return `${mm[1]}-${mm[2]}-${mm[3]}T${mm[4]}:${mm[5]}:${mm[6]}`;   // lokal tid där bilden togs
      }
      if ((m & 0xff00) !== 0xff00) return null;
      p += 2 + len;
    }
  } catch { /* trasig EXIF */ }
  return null;
}

// ---------- krympa ----------
async function lasBild(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    const url = URL.createObjectURL(file);
    try { const img = new Image(); img.src = url; await img.decode(); return img; }
    catch { throw new Error('Bildformatet går inte att läsa i den här webbläsaren (t.ex. HEIC) – spara som JPEG först'); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
}
function rita(src, maxSida) {
  const w = src.width, h = src.height, s = Math.min(1, maxSida / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
const tillJpeg = (c, q) => new Promise((ok, fel) => c.toBlob((b) => (b ? ok(b) : fel(new Error('Kunde inte göra om bilden'))), 'image/jpeg', q));

export async function krymp(file) {
  const tagen = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name) ? exifDatum(await file.slice(0, 256 * 1024).arrayBuffer()) : null;
  const src = await lasBild(file);
  let sida = 1600, stor, c;
  for (;;) {
    c = rita(src, sida);
    for (const q of [0.85, 0.78, 0.7, 0.62, 0.55]) { stor = await tillJpeg(c, q); if (stor.size <= MAX_BYTE) break; }
    if (stor.size <= MAX_BYTE || sida < 600) break;
    sida = Math.round(sida * 0.8);
  }
  const liten = await tillJpeg(rita(src, 480), 0.75);
  src.close?.();
  return { stor, liten, bredd: c.width, hojd: c.height, tagen };
}

// ---------- ladda upp och ta bort ----------
const tagenTs = (t) => (t ? new Date(t).toISOString() : null);   // EXIF-tid tolkas i webbläsarens tidszon

// Admin och markör i appen
export const appLadda = (thtNr) => async (p, did, text) => {
  const fil = `${thtNr}/${crypto.randomUUID()}.jpg`;
  const [rad] = await write('POST', 'foto', { tht_nr: thtNr, deltavling_id: did, fil, bredd: p.bredd, hojd: p.hojd, tagen: tagenTs(p.tagen), text: text || null });
  try {
    await lagring('POST', fil, p.stor);
    await lagring('POST', litenFil(fil), p.liten);
    await write('PATCH', `foto?id=eq.${rad.id}`, { klar: true }, 'return=minimal');
  } catch (e) {
    await write('DELETE', `foto?id=eq.${rad.id}`, undefined, 'return=minimal').catch(() => {});
    await lagring('DELETE', [fil, litenFil(fil)]).catch(() => {});
    throw e;
  }
};
export async function appTaBort(f) {
  await write('DELETE', `foto?id=eq.${f.id}`, undefined, 'return=minimal');
  await lagring('DELETE', [f.fil, litenFil(f.fil)]).catch(() => {});
}

export async function appAndra(f, nytt) {
  await write('PATCH', `foto?id=eq.${f.id}`, nytt, 'return=minimal');
}
// THT:er och deltävlingar att flytta till (bara = tillåtna THT-nummer, t.ex. de spelaren var med på)
export async function flyttVal(bara = null) {
  const [thts, delt] = await Promise.all([
    api('tht?select=nr,artal,ort&nr=gt.0&order=artal.desc'),
    api('deltavling?select=id,tht_nr,ordning,datum,banversion(bana(namn))&tht_nr=gt.0&order=tht_nr,ordning'),
  ]);
  return thts.filter((t) => !bara || bara.includes(t.nr)).map((t) => ({ ...t, delt: delt.filter((d) => d.tht_nr === t.nr).map((d) => ({ id: d.id, ordning: d.ordning, datum: d.datum, bana: d.banversion?.bana?.namn ?? null })) }));
}

// Spelaren via personlig länk – databasen reserverar filnamnet och kontrollerar att spelaren var med
export const lankLadda = (kod, thtNr) => async (p, did, text) => {
  const r = await rpc('foto_lank_reservera', { p_kod: kod, p_tht_nr: thtNr, p_deltavling_id: did, p_bredd: p.bredd, p_hojd: p.hojd, p_tagen: tagenTs(p.tagen), p_text: text || null });
  await lagring('POST', r.fil, p.stor);
  await lagring('POST', litenFil(r.fil), p.liten);
  await rpc('foto_lank_klar', { p_kod: kod, p_id: r.id });
};
export const lankAndra = (kod) => (f, nytt) => rpc('foto_lank_andra', { p_kod: kod, p_id: f.id, p_tht_nr: nytt.tht_nr, p_deltavling_id: nytt.deltavling_id, p_text: nytt.text });
export const lankTaBort = (kod) => async (f) => {
  const fil = await rpc('foto_lank_ta_bort', { p_kod: kod, p_id: f.id });
  await lagring('DELETE', [fil, litenFil(fil)]).catch(() => {});
};

// ---------- galleri och helskärmsvisning ----------
// info(f) = bildtext under bilden; taBort(f) = funktion (eller null) för att ta bort;
// andra = { spara(f, nytt), val() → [{ nr, artal, ort, delt }], behall(f) } för att flytta fotot till annan runda/THT
export function galleri(el, foton, opt = {}) {
  el.innerHTML = foton.length ? `<div class="foto-rutnat">${foton.map((f, i) => `<button type="button" class="foto-ruta" data-i="${i}" aria-label="Visa foto ${i + 1}">
      <img src="${litenUrl(f)}" alt="${esc(f.text ?? '')}" loading="lazy" decoding="async"></button>`).join('')}</div>` : '';
  el.querySelectorAll('.foto-ruta').forEach((b) => b.onclick = () => visaStor(foton, Number(b.dataset.i), opt));
}

let ljus = null;
export function visaStor(foton, start, { info = () => '', taBort = null, onAndrat = null, andra = null } = {}) {
  ljus?.stang();
  let i = start;
  const ov = document.createElement('div');
  ov.className = 'foto-ljus';
  ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Foto');
  document.body.appendChild(ov);
  document.body.classList.add('ljus-oppen');
  const rita = () => {
    const f = foton[i];
    if (!f) { stang(); return; }
    const txt = info(f);
    ov.innerHTML = `<div class="fl-topp"><span>${i + 1} / ${foton.length}</span>
        <span class="fl-knappar">${andra ? '<button type="button" class="link fl-andra">Ändra</button>' : ''}${taBort ? '<button type="button" class="link fl-bort">Ta bort</button>' : ''}<button type="button" class="fl-stang" aria-label="Stäng">✕</button></span></div>
      <div class="fl-bild"><img src="${fotoUrl(f)}" alt="${esc(f.text ?? '')}">
        ${foton.length > 1 ? '<button type="button" class="fl-pil fl-forra" aria-label="Föregående">‹</button><button type="button" class="fl-pil fl-nasta" aria-label="Nästa">›</button>' : ''}</div>
      ${txt ? `<div class="fl-text">${txt}</div>` : ''}`;
    ov.querySelector('.fl-stang').onclick = stang;
    ov.querySelector('.fl-forra')?.addEventListener('click', () => steg(-1));
    ov.querySelector('.fl-nasta')?.addEventListener('click', () => steg(1));
    const knapp = ov.querySelector('.fl-andra');
    if (knapp) knapp.onclick = () => andraForm(f);
    const bort = ov.querySelector('.fl-bort');
    if (bort) bort.onclick = async () => {
      if (!bort.classList.contains('bekrafta')) { bort.classList.add('bekrafta'); bort.textContent = 'Säker? Ta bort'; return; }
      bort.disabled = true; bort.textContent = 'Tar bort …';
      try { await taBort(f); foton.splice(i, 1); onAndrat?.(foton); if (!foton.length) { stang(); return; } if (i >= foton.length) i = foton.length - 1; rita(); }
      catch (e) { bort.disabled = false; bort.textContent = `Fel: ${e.message}`; }
    };
  };
  // Flytta fotot: THT, runda och bildtext
  const andraForm = async (f) => {
    const plats = ov.querySelector('.fl-text') ?? ov.appendChild(Object.assign(document.createElement('div'), { className: 'fl-text' }));
    plats.innerHTML = '<p class="muted">Laddar …</p>';
    let val;
    try { val = await andra.val(); } catch (e) { plats.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    const deltOpt = (nr, did) => `<option value="">Hela THT:n</option>${(val.find((t) => t.nr === nr)?.delt ?? []).map((d) => `<option value="${d.id}" ${d.id === did ? 'selected' : ''}>R${d.ordning}${d.bana ? ' · ' + esc(d.bana) : ''}${d.datum ? ' · ' + d.datum : ''}</option>`).join('')}`;
    plats.innerHTML = `<form class="fl-form">
      <label><span class="meta">THT</span><select name="tht">${val.map((t) => `<option value="${t.nr}" ${t.nr === f.tht_nr ? 'selected' : ''}>THT ${t.nr} · ${esc(t.ort ?? '')} ${t.artal}</option>`).join('')}</select></label>
      <label><span class="meta">Runda</span><select name="did">${deltOpt(f.tht_nr, f.deltavling_id)}</select></label>
      <label class="fl-bred"><span class="meta">Bildtext</span><input name="text" maxlength="300" value="${esc(f.text ?? '')}" placeholder="Bildtext (valfritt)"></label>
      <span class="fl-formknappar"><button type="submit" class="btn small primary">Spara</button> <button type="button" class="link fl-avbryt">Avbryt</button> <span class="hint fl-msg" role="status"></span></span>
    </form>`;
    const form = plats.querySelector('form');
    form.tht.onchange = () => { form.did.innerHTML = deltOpt(Number(form.tht.value), null); };
    form.querySelector('.fl-avbryt').onclick = rita;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const nytt = { tht_nr: Number(form.tht.value), deltavling_id: form.did.value ? Number(form.did.value) : null, text: form.text.value.trim() || null };
      form.querySelector('.fl-msg').textContent = 'Sparar …';
      try {
        await andra.spara(f, nytt);
        Object.assign(f, nytt);
        if (andra.behall && !andra.behall(f)) { foton.splice(i, 1); onAndrat?.(foton); if (!foton.length) { stang(); return; } if (i >= foton.length) i = foton.length - 1; }
        else onAndrat?.(foton);
        rita();
      } catch (err) { form.querySelector('.fl-msg').textContent = `Kunde inte spara: ${err.message}`; }
    };
  };
  const steg = (d) => { i = (i + d + foton.length) % foton.length; rita(); };
  const tangent = (e) => {
    if (e.target.closest?.('.fl-form')) return;   // skriver i formuläret
    if (e.key === 'Escape') stang();
    else if (e.key === 'ArrowRight') steg(1);
    else if (e.key === 'ArrowLeft') steg(-1);
  };
  let x0 = null;
  ov.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  ov.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50 && foton.length > 1) steg(dx < 0 ? 1 : -1); });
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.classList.contains('fl-bild')) stang(); });
  function stang() {
    document.removeEventListener('keydown', tangent);
    window.removeEventListener('hashchange', stang);
    ov.remove(); document.body.classList.remove('ljus-oppen'); ljus = null;
  }
  document.addEventListener('keydown', tangent);
  window.addEventListener('hashchange', stang);
  ljus = { stang };
  rita();
}

// ---------- uppladdning ----------
// delt = THT:ns deltävlingar [{ id, ordning, namn, datum, bana }]; forval = deltävling att välja från början
// (annars väljs den efter bildens datum). ladda(p, did, text) laddar upp ett foto.
export function uppladdare(el, { delt, forval = null, ladda, klart }) {
  let rader = [];
  const dagFor = (t) => (t ? t.slice(0, 10) : null);
  const gissa = (t) => forval ?? (delt.find((d) => d.datum && d.datum === dagFor(t))?.id ?? '');
  el.innerHTML = `<div class="fu">
    <label class="btn fu-valj">＋ Välj foton<input type="file" accept="image/*" multiple hidden></label>
    <p class="hint">Bilderna krymps i telefonen innan de skickas (högst ca 300 kB). Deltävlingen väljs efter bildens datum när det går – ändra om det blev fel.</p>
    <div class="fu-lista"></div>
    <div class="fu-fot" hidden><button type="button" class="btn primary fu-skicka">Ladda upp</button> <span class="hint fu-msg" role="status"></span></div>
  </div>`;
  const lista = el.querySelector('.fu-lista'), fot = el.querySelector('.fu-fot'), skicka = el.querySelector('.fu-skicka'), msg = el.querySelector('.fu-msg');
  const val = (r) => `<select class="fu-delt" aria-label="Deltävling">
      <option value="">Hela THT:n</option>
      ${delt.map((d) => `<option value="${d.id}" ${String(r.did) === String(d.id) ? 'selected' : ''}>R${d.ordning}${d.bana ? ' · ' + esc(d.bana) : ''}${d.datum ? ' · ' + d.datum : ''}</option>`).join('')}
    </select>`;
  const ritaLista = () => {
    lista.innerHTML = rader.map((r, i) => `<div class="fu-rad ${r.status ?? ''}" data-i="${i}">
      ${r.url ? `<img src="${r.url}" alt="">` : '<span class="fu-tom"></span>'}
      <div class="fu-falt">
        <div class="meta">${esc(r.namn)}${r.p ? ` · ${Math.round(r.p.stor.size / 1000)} kB${r.p.tagen ? ' · ' + r.p.tagen.slice(0, 10) : ''}` : ''}${r.fel ? ` · <span class="err">${esc(r.fel)}</span>` : ''}${r.status === 'klar' ? ' · ✓ uppladdat' : r.status === 'laddar' ? ' · laddar upp …' : r.status === 'forbereder' ? ' · förbereder …' : ''}</div>
        ${r.p && r.status !== 'klar' ? `${val(r)}<input class="fu-text" maxlength="300" placeholder="Bildtext (valfritt)" value="${esc(r.text)}">` : ''}
      </div>
      ${r.status !== 'klar' && r.status !== 'laddar' ? '<button type="button" class="link fu-bort" aria-label="Ta bort ur listan">✕</button>' : ''}
    </div>`).join('');
    lista.querySelectorAll('.fu-rad').forEach((rad) => {
      const r = rader[Number(rad.dataset.i)];
      rad.querySelector('.fu-delt')?.addEventListener('change', (e) => { r.did = e.target.value; });
      rad.querySelector('.fu-text')?.addEventListener('input', (e) => { r.text = e.target.value; });
      rad.querySelector('.fu-bort')?.addEventListener('click', () => { if (r.url) URL.revokeObjectURL(r.url); rader = rader.filter((x) => x !== r); ritaLista(); });
    });
    const kvar = rader.filter((r) => r.p && r.status !== 'klar').length;
    fot.hidden = !rader.length;
    skicka.hidden = !kvar;
    skicka.textContent = `Ladda upp ${kvar} ${kvar === 1 ? 'foto' : 'foton'}`;
  };
  el.querySelector('input[type=file]').onchange = async (e) => {
    const filer = [...e.target.files]; e.target.value = '';
    const nya = filer.map((f) => ({ fil: f, namn: f.name, status: 'forbereder', text: '' }));
    rader.push(...nya); ritaLista();
    for (const r of nya) {
      try { r.p = await krymp(r.fil); r.url = URL.createObjectURL(r.p.liten); r.did = gissa(r.p.tagen); r.status = ''; }
      catch (err) { r.fel = err.message; r.status = 'fel'; }
      r.fil = null;
      ritaLista();
    }
  };
  skicka.onclick = async () => {
    skicka.disabled = true;
    let ok = 0, fel = 0;
    for (const r of rader.filter((x) => x.p && x.status !== 'klar')) {
      r.status = 'laddar'; r.fel = null; ritaLista();
      try { await ladda(r.p, r.did ? Number(r.did) : null, r.text.trim()); r.status = 'klar'; ok++; }
      catch (err) { r.status = 'fel'; r.fel = err.message; fel++; }
      ritaLista();
    }
    skicka.disabled = false;
    msg.textContent = fel ? `${ok} uppladdade, ${fel} misslyckades – tryck Ladda upp igen.` : ok === 1 ? 'Fotot är uppladdat.' : `${ok} foton är uppladdade.`;
    if (ok) klart?.();
  };
}

// ---------- sektion: galleri + uppladdning ----------
// Årssidan (hela THT:n), deltävlingssidan (did) och länksidan (lank = kod, bara spelarens egna).
export async function hamtaDelt(thtNr) {
  const rader = await api(`deltavling?tht_nr=eq.${thtNr}&order=ordning&select=id,ordning,namn,datum,banversion(bana(namn))`);
  return rader.map((d) => ({ id: d.id, ordning: d.ordning, namn: d.namn, datum: d.datum, bana: d.banversion?.bana?.namn ?? null }));
}
export function fotoInfo(delt) {
  return (f) => {
    const d = delt.find((x) => x.id === f.deltavling_id);
    const delar = [d ? `R${d.ordning}${d.bana ? ' · ' + esc(d.bana) : ''}` : '', f.person?.fornamn ? `foto ${esc(f.person.fornamn)}` : '', f.tagen ? f.tagen.slice(0, 10) : ''].filter(Boolean);
    return `${f.text ? `<div class="fl-bildtext">${esc(f.text)}</div>` : ''}${delar.length ? `<div class="meta">${delar.join(' · ')}</div>` : ''}`;
  };
}

export async function fotoSektion(el, { thtNr, did = null, lank = null, rubrik = 'Foton', niva = 'h2', delt = null, lankTht = null }) {
  delt ??= await hamtaDelt(thtNr);
  const skriv = !!lank || kanSkriva();
  let foton = [];
  const hamta = async (fresh) => {
    foton = lank ? (await rpc('foto_lank_info', { p_kod: lank })).filter((f) => f.tht_nr === thtNr)
      : await hamtaFoton(did ? `deltavling_id=eq.${did}` : `tht_nr=eq.${thtNr}`, fresh);
  };
  await hamta(false);
  const info = fotoInfo(delt);
  const gOpt = {
    info, taBort: skriv ? (lank ? lankTaBort(lank) : appTaBort) : null,
    // Flyttat foto försvinner härifrån om det inte längre hör till den här THT:n/rundan
    andra: skriv ? { spara: lank ? lankAndra(lank) : appAndra, val: () => flyttVal(lank ? lankTht : null), behall: (f) => f.tht_nr === thtNr && (!did || f.deltavling_id === did) } : null,
    onAndrat: () => {
      const n = el.querySelector('.foto-antal'); if (n) n.textContent = foton.length ? `(${foton.length})` : '';
      galleri(el.querySelector('.foto-g'), foton, gOpt);
    },
  };
  const rita = () => {
    if (!foton.length && !skriv) { el.innerHTML = ''; return; }
    el.innerHTML = `<${niva} class="foto-rubrik">${rubrik} <span class="muted foto-antal">${foton.length ? `(${foton.length})` : ''}</span></${niva}>
      <div class="foto-g"></div>
      ${!foton.length ? `<p class="muted foto-tom">${lank ? 'Du har inte laddat upp några foton hit ännu.' : 'Inga foton ännu.'}</p>` : ''}
      ${skriv ? `<details class="foto-ny"><summary>＋ Lägg till foton</summary><div class="foto-upp"></div></details>` : ''}`;
    galleri(el.querySelector('.foto-g'), foton, gOpt);
    const upp = el.querySelector('.foto-upp');
    if (upp) uppladdare(upp, {
      delt, forval: did, ladda: lank ? lankLadda(lank, thtNr) : appLadda(thtNr),
      klart: async () => { await hamta(true); gOpt.onAndrat(); el.querySelector('.foto-tom')?.remove(); },
    });
  };
  rita();
}
