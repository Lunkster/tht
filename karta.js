// Kartor med Leaflet + OpenStreetMap (gratis, ingen nyckel). Leaflet laddas först när en karta behövs.
//  - renderKarta(artal?)   – helsida #/karta[/år]: alla spelade banor och övernattningar, filter per år
//  - miniKarta(el, artal)  – liten karta på årssidan
//  - kartvaljare(latEl, lonEl) – "Välj på karta" i admin: klicka/sök för att fylla i koordinater
import { api, esc, nuNav, aktuell } from './lib.js?v=0.33.0';

const app = document.getElementById('app');
const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';
const GULD = '#e3c278', BLA = '#3987e5', MORK = '#121110';
const ATTR_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

let laddar = null;
export function laddaLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (laddar) return laddar;
  laddar = new Promise((ok, fel) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = LEAFLET + 'leaflet.js';
    js.onload = () => ok(window.L);
    js.onerror = () => { laddar = null; fel(new Error('Kunde inte ladda kartan (ingen kontakt med unpkg.com).')); };
    document.head.appendChild(js);
  });
  return laddar;
}

// Bakgrundskarta: vanliga OpenStreetMap-rutor (ingen nyckel). Mörkas med CSS-filtret .osm-mork så att den passar appen.
const morkLager = (L) => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: ATTR_OSM, className: 'osm-mork' });
// Vanlig OSM-karta (visar golfbanor tydligt) för att välja plats.
const osmLager = (L) => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: ATTR_OSM });

// ---------- data ----------
async function hamtaPlatser() {
  const [banor, over, thts] = await Promise.all([
    api('bana?select=id,namn,lat,lon,banversion(deltavling(ordning,datum,tht_nr))&order=namn'),
    api('overnattning?select=id,tht_nr,platsnamn,antal_natter,organisator,lat,lon'),
    api('tht?select=nr,artal,ort&order=artal'),
  ]);
  const thtMap = Object.fromEntries(thts.map((t) => [t.nr, t]));
  const bp = banor.map((b) => {
    const spel = b.banversion.flatMap((v) => v.deltavling).map((d) => ({ ...d, artal: thtMap[d.tht_nr]?.artal })).filter((d) => d.artal).sort((a, c) => a.datum.localeCompare(c.datum));
    return { typ: 'bana', id: b.id, namn: b.namn, lat: b.lat, lon: b.lon, spel, ar: [...new Set(spel.map((s) => s.artal))] };
  }).filter((b) => b.spel.length);
  const op = over.map((o) => ({ typ: 'over', ...o, namn: o.platsnamn, ar: thtMap[o.tht_nr] ? [thtMap[o.tht_nr].artal] : [], ort: thtMap[o.tht_nr]?.ort }));
  return { banor: bp, over: op, thts };
}

function markor(L, p) {
  if (p.typ === 'bana') {
    const r = Math.min(14, 6 + 2 * (p.spel.length - 1));
    return L.circleMarker([p.lat, p.lon], { radius: r, color: MORK, weight: 2, fillColor: GULD, fillOpacity: 0.95 })
      .bindPopup(`<strong><a href="#/bana/${p.id}">${esc(p.namn)}</a></strong><br>${p.spel.map((s) => `<a href="#/ar/${s.artal}">${s.artal}</a> R${s.ordning}`).join(' · ')}`);
  }
  return L.circleMarker([p.lat, p.lon], { radius: 6, color: MORK, weight: 2, fillColor: BLA, fillOpacity: 0.95 })
    .bindPopup(`<strong>${esc(p.namn)}</strong><br>Övernattning <a href="#/ar/${p.ar[0]}">${p.ar[0]}</a>${p.ort ? ' · ' + esc(p.ort) : ''}${p.antal_natter ? ` · ${p.antal_natter} nätter` : ''}${p.organisator ? `<br>Ordnat av ${esc(p.organisator)}` : ''}`);
}

// ---------- helsida ----------
export async function renderKarta(artal = null) {
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Laddar karta …</p>';
  const [L, data] = await Promise.all([laddaLeaflet(), hamtaPlatser()]);
  if (!aktuell(myNav)) return;
  const arMedData = [...new Set([...data.banor.flatMap((b) => b.ar), ...data.over.flatMap((o) => o.ar)])].sort((a, b) => b - a);
  const utanKoord = data.banor.filter((b) => b.lat == null).length + data.over.filter((o) => o.lat == null).length;
  app.innerHTML = `
    <div class="row-between"><h1>Karta</h1>
      <select id="kartar" aria-label="Välj år"><option value="">Alla år</option>${arMedData.map((a) => `<option value="${a}" ${a === artal ? 'selected' : ''}>${a} · ${esc(data.thts.find((t) => t.artal === a)?.ort ?? '')}</option>`).join('')}</select>
    </div>
    <p class="sub" id="kartsub"></p>
    <div class="kartlegend"><span><i style="background:${GULD}"></i>Bana (större = spelad fler gånger)</span><span><i style="background:${BLA}"></i>Övernattning</span></div>
    <div id="karta" class="karta stor"></div>
    ${utanKoord ? `<p class="hint">${utanKoord} platser saknar koordinater och syns inte – lägg in dem under <a href="#/admin/banor">Admin → Banor</a> eller Övernattningar.</p>` : ''}`;
  const karta = L.map('karta', { scrollWheelZoom: true });
  morkLager(L).addTo(karta);
  const grupp = L.featureGroup().addTo(karta);
  // Knapp som zoomar ut till alla synliga platser igen
  const Hela = L.Control.extend({ options: { position: 'topleft' }, onAdd() {
    const k = L.DomUtil.create('a', 'leaflet-bar kartknapp'); k.href = '#'; k.title = 'Visa alla platser'; k.setAttribute('role', 'button'); k.setAttribute('aria-label', 'Visa alla platser'); k.textContent = '⤢';
    L.DomEvent.on(k, 'click', (e) => { L.DomEvent.preventDefault(e); L.DomEvent.stopPropagation(e); if (grupp.getLayers().length) karta.fitBounds(grupp.getBounds(), { padding: [30, 30], maxZoom: 11 }); });
    return k;
  } });
  new Hela().addTo(karta);
  const rita = () => {
    const a = Number(document.getElementById('kartar').value) || null;
    grupp.clearLayers();
    const synliga = [...data.banor, ...data.over].filter((p) => p.lat != null && (!a || p.ar.includes(a)));
    // Övernattningar under banorna så att banornas popup går att nå
    synliga.sort((x, y) => (x.typ === 'over' ? -1 : 1) - (y.typ === 'over' ? -1 : 1)).forEach((p) => markor(L, p).addTo(grupp));
    const nb = synliga.filter((p) => p.typ === 'bana').length, no = synliga.length - nb;
    document.getElementById('kartsub').textContent = `${nb} banor · ${no} övernattningar${a ? ` · ${a}` : ' · alla år sedan 1998'}`;
    if (synliga.length) karta.fitBounds(grupp.getBounds(), { padding: [30, 30], maxZoom: 11 });
    else karta.setView([60, 15], 5);
    history.replaceState(null, '', a ? `#/karta/${a}` : '#/karta');
  };
  document.getElementById('kartar').onchange = rita;
  rita();
}

// ---------- liten karta på årssidan ----------
export async function miniKarta(el, artal) {
  try {
    const [L, data] = await Promise.all([laddaLeaflet(), hamtaPlatser()]);
    if (!document.body.contains(el)) return;
    const synliga = [...data.banor, ...data.over].filter((p) => p.lat != null && p.ar.includes(artal));
    if (!synliga.length) { el.closest('.minikarta')?.remove(); return; }
    // Zoomknappar så att man kan zooma ut igen (skrollhjulet är av så att sidan går att skrolla förbi kartan)
    const karta = L.map(el, { scrollWheelZoom: false, dragging: !L.Browser.mobile, zoomControl: true, attributionControl: true });
    morkLager(L).addTo(karta);
    const grupp = L.featureGroup(synliga.map((p) => markor(L, p))).addTo(karta);
    karta.fitBounds(grupp.getBounds(), { padding: [24, 24], maxZoom: 11 });
  } catch { el.closest('.minikarta')?.remove(); }
}

// ---------- välj plats i admin ----------
// Lägger en knapp "Välj på karta" efter fälten. Klick i kartan fyller i lat/lon; sökrutan använder Nominatim (OSM).
export function kartvaljare(latEl, lonEl) {
  const falt = latEl.closest('.adm-falt') ?? latEl.parentElement;
  const wrap = document.createElement('div');
  wrap.className = 'kartval';
  wrap.innerHTML = `<button type="button" class="link kartval-knapp">📍 Välj på karta</button>
    <div class="kartval-box" hidden>
      <div class="kartval-sok"><input type="text" placeholder="Sök plats, t.ex. Lindesberga golfklubb" aria-label="Sök plats" autocomplete="off"><button type="button" class="btn">Sök</button></div>
      <div class="karta liten"></div>
      <p class="hint">Klicka där platsen ligger – latitud och longitud fylls i. Dra i kartan för att flytta, zooma med +/−.</p>
    </div>`;
  falt.after(wrap);
  const box = wrap.querySelector('.kartval-box'), kartEl = wrap.querySelector('.karta');
  let karta = null, mark = null;
  const satt = (L, lat, lon, flytta = false) => {
    if (mark) mark.setLatLng([lat, lon]); else mark = L.marker([lat, lon]).addTo(karta);
    if (flytta) karta.setView([lat, lon], Math.max(karta.getZoom(), 14));
  };
  wrap.querySelector('.kartval-knapp').onclick = async () => {
    box.hidden = !box.hidden;
    if (box.hidden || karta) { karta?.invalidateSize(); return; }
    let L;
    try { L = await laddaLeaflet(); } catch (e) { box.querySelector('.hint').textContent = e.message; return; }
    const lat = Number(latEl.value.replace(',', '.')), lon = Number(lonEl.value.replace(',', '.'));
    const har = latEl.value && lonEl.value && Number.isFinite(lat) && Number.isFinite(lon);
    karta = L.map(kartEl).setView(har ? [lat, lon] : [61, 15], har ? 14 : 5);
    osmLager(L).addTo(karta);
    if (har) satt(L, lat, lon);
    karta.on('click', (e) => {
      latEl.value = e.latlng.lat.toFixed(6); lonEl.value = e.latlng.lng.toFixed(6);
      latEl.dispatchEvent(new Event('input', { bubbles: true }));
      satt(L, e.latlng.lat, e.latlng.lng);
    });
    const sokInp = wrap.querySelector('.kartval-sok input'), hint = box.querySelector('.hint');
    const sok = async () => {
      const q = sokInp.value.trim(); if (!q) return;
      hint.textContent = 'Söker …';
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=sv&q=${encodeURIComponent(q)}`);
        const [hit] = await r.json();
        if (!hit) { hint.textContent = 'Hittade ingen plats – prova ett annat namn eller zooma själv.'; return; }
        karta.setView([Number(hit.lat), Number(hit.lon)], 15);
        hint.textContent = `${hit.display_name.split(',').slice(0, 3).join(',')} – klicka exakt där platsen ligger.`;
      } catch { hint.textContent = 'Sökningen fungerade inte just nu – zooma och klicka själv.'; }
    };
    wrap.querySelector('.kartval-sok button').onclick = sok;
    sokInp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); sok(); } };
  };
}

// ---------- en enda plats (bansidan) ----------
export async function punktKarta(el, lat, lon) {
  try {
    const L = await laddaLeaflet();
    if (!document.body.contains(el)) return;
    const karta = L.map(el, { scrollWheelZoom: false, dragging: !L.Browser.mobile }).setView([lat, lon], 13);
    morkLager(L).addTo(karta);
    L.circleMarker([lat, lon], { radius: 9, color: MORK, weight: 2, fillColor: GULD, fillOpacity: 0.95 }).addTo(karta);
  } catch { el.closest('.minikarta')?.remove(); }
}
