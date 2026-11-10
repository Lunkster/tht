// Väder på deltävlingen (v0.39.1, migrering 29): timmarna 09–15 från Open-Meteo, sparat i tabellen vader av
// edge-funktionen vader. Saknas vädret för en spelad deltävling hämtas det första gången någon tittar.
// Egna ikoner i appens färger (guld sol, krämvita moln, ljusblå nederbörd).
import { api, allaRader, funktion, fmt } from './lib.js?v=0.39.1';

// ---------- ikoner ----------
const SOL = (x, y, r) => `<g class="vi-sol"><circle cx="${x}" cy="${y}" r="${r}"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((g) => { const a = g * Math.PI / 180, r1 = r + 4, r2 = r + 9; return `<line x1="${(x + r1 * Math.cos(a)).toFixed(1)}" y1="${(y + r1 * Math.sin(a)).toFixed(1)}" x2="${(x + r2 * Math.cos(a)).toFixed(1)}" y2="${(y + r2 * Math.sin(a)).toFixed(1)}"/>`; }).join('')}</g>`;
const MOLN = (dx = 0, dy = 0, mork = false) => `<path class="vi-moln${mork ? ' vi-mork' : ''}" transform="translate(${dx} ${dy})" d="M18 50h30a10 10 0 0 0 1.5-19.9A14 14 0 0 0 22.6 27 11.5 11.5 0 0 0 18 50z"/>`;
const DROPPAR = (n = 3) => `<g class="vi-regn">${[[22, 54], [32, 56], [42, 54]].slice(0, n).map(([x, y]) => `<line x1="${x}" y1="${y}" x2="${x - 3}" y2="${y + 7}"/>`).join('')}</g>`;
const DUGG = `<g class="vi-dugg">${[[22, 57], [32, 59], [42, 57]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8"/>`).join('')}</g>`;
const SNO = `<g class="vi-sno">${[[22, 57], [33, 59], [44, 57]].map(([x, y]) => `<path d="M${x - 3} ${y}h6M${x} ${y - 3}v6M${x - 2.2} ${y - 2.2}l4.4 4.4M${x - 2.2} ${y + 2.2}l4.4-4.4"/>`).join('')}</g>`;
const BLIXT = '<path class="vi-blixt" d="M35 38l-10 13h7l-4 12 13-16h-7l5-9z"/>';
const DIMMA = `<g class="vi-dimma">${[41, 48, 55, 62].map((y, i) => `<line x1="${12 + (i % 2) * 4}" y1="${y}" x2="${52 - (i % 2) * 4}" y2="${y}"/>`).join('')}</g>`;

// WMO-kod → [kategori, text]
export function vaderTyp(kod) {
  if (kod == null) return ['okant', 'Okänt'];
  if (kod === 0) return ['klart', 'Klart'];
  if (kod === 1) return ['halvklart', 'Mestadels klart'];
  if (kod === 2) return ['halvklart', 'Halvklart'];
  if (kod === 3) return ['mulet', 'Mulet'];
  if (kod === 45 || kod === 48) return ['dimma', 'Dimma'];
  if (kod >= 51 && kod <= 57) return ['dugg', 'Duggregn'];
  if ((kod >= 61 && kod <= 67)) return ['regn', kod >= 65 ? 'Kraftigt regn' : 'Regn'];
  if (kod >= 71 && kod <= 77) return ['sno', 'Snö'];
  if (kod >= 80 && kod <= 82) return ['skurar', 'Regnskurar'];
  if (kod === 85 || kod === 86) return ['sno', 'Snöbyar'];
  if (kod >= 95) return ['aska', 'Åska'];
  return ['mulet', 'Molnigt'];
}

export function vaderIkon(kod, klass = '') {
  const [typ, text] = vaderTyp(kod);
  const inner = {
    klart: SOL(32, 32, 11),
    halvklart: SOL(24, 22, 8) + MOLN(4, 4),
    mulet: MOLN(-2, -4, true) + MOLN(4, 4),
    dimma: MOLN(0, -14) + DIMMA,
    dugg: MOLN(0, -8) + DUGG,
    regn: MOLN(0, -8, true) + DROPPAR(3),
    skurar: SOL(22, 16, 7) + MOLN(4, -6) + DROPPAR(2),
    sno: MOLN(0, -8) + SNO,
    aska: MOLN(0, -12, true) + BLIXT,
    okant: MOLN(0, 0),
  }[typ];
  return `<svg class="vi ${klass}" viewBox="0 0 64 64" role="img" aria-label="${text}"><title>${text}</title>${inner}</svg>`;
}

const RIKTNING = ['N', 'NO', 'O', 'SO', 'S', 'SV', 'V', 'NV'];
export const vindFran = (g) => (g == null ? '' : RIKTNING[Math.round(g / 45) % 8]);
const grader = (v) => `${fmt(v, 0)}°`;

// ---------- hämtning ----------
// Hämtar sparat väder; saknas det för spelade deltävlingar ber vi edge-funktionen hämta det. Returnerar { id: rad }.
export async function hamtaVader(deltavlingar, fyll = true) {
  const ids = deltavlingar.map((d) => d.id);
  if (!ids.length) return {};
  const rader = ids.length > 60 ? await allaRader('vader?select=*').catch(() => []) : await api(`vader?deltavling_id=in.(${ids.join(',')})&select=*`).catch(() => []);
  const per = Object.fromEntries(rader.map((v) => [v.deltavling_id, v]));
  const idag = new Date().toLocaleDateString('sv-SE');
  const saknas = deltavlingar.filter((d) => d.datum && d.datum <= idag && (!per[d.id] || per[d.id].kalla === 'prognos')).map((d) => d.id);
  if (fyll && saknas.length) {
    try {
      const svar = await funktion('vader', { deltavling_ids: saknas });
      (svar?.rader ?? []).forEach((v) => { per[v.deltavling_id] = v; });
    } catch (e) { console.warn('Väder:', e.message); }
  }
  return per;
}

// ---------- visning ----------
// Liten: ikon + temperatur, t.ex. på årssidans deltävlingslista
export const vaderMini = (v) => (v ? `<span class="vd-mini" title="${vaderTyp(v.kod)[1]}, ${fmt(v.temp, 0)} °C, vind ${fmt(v.vind, 0)} m/s – 09–15">${vaderIkon(v.kod)}${grader(v.temp)}</span>` : '');

// Kort för deltävlingssidan: dagens sammanfattning och timme för timme
export function vaderKort(v) {
  if (!v) return '';
  const [, text] = vaderTyp(v.kod);
  return `<div class="card vd-kort">
    <div class="vd-huvud">${vaderIkon(v.kod, 'vi-stor')}
      <div><div class="vd-temp">${fmt(v.temp, 0)} °C</div><div class="vd-text">${text}</div></div>
      <ul class="vd-fakta">
        <li><span>Temperatur</span>${fmt(v.temp_min, 0)}–${fmt(v.temp_max, 0)} °C</li>
        <li><span>Vind</span>${fmt(v.vind, 0)} m/s${v.vindriktning != null ? ` från ${vindFran(v.vindriktning)}` : ''}${v.byar ? ` · byar ${fmt(v.byar, 0)}` : ''}</li>
        <li><span>Moln</span>${fmt(v.moln)} %</li>
        <li><span>Nederbörd</span>${fmt(v.nederbord, 1)} mm</li>
      </ul></div>
    <div class="vd-timmar">${(v.timmar ?? []).map((t) => `<div class="vd-timme"><span class="vd-h">${String(t.h).padStart(2, '0')}</span>${vaderIkon(t.kod)}<span>${grader(t.temp)}</span>${t.nederbord > 0 ? `<span class="vd-mm">${fmt(t.nederbord, 1)}</span>` : ''}</div>`).join('')}</div>
    <p class="hint">Vädret kl. 09–15 vid banan enligt Open-Meteo${v.kalla === 'prognos' ? ' – preliminärt, uppdateras när dagen blivit historik' : ' (beräknad väderhistorik, ca 10–25 km upplösning)'}.</p>
  </div>`;
}
