// Export av en quiz till Kahoots importmall (v0.38.2): Kahoot → Skapa → Lägg till fråga → Importera kalkylblad.
// Mallens upplägg: rubrikrad på rad 8, frågorna från rad 9 – kolumn A löpnummer, B fråga (max 95 tecken),
// C–F svar 1–4 (max 60 tecken), G tidsgräns i sekunder, H rätt svar (svarets nummer).
// Filen byggs här i webbläsaren som en okomprimerad zip (xlsx) – inget bibliotek behövs.

export const MAX_FRAGA = 95, MAX_SVAR = 60, TID = 20;   // Kahoots gränser 2026 (förut 120/75)

const korta = (t, max) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s; };
const blanda = (xs) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Gör om quizens frågor till Kahoot-rader. Flashcards (utan fel svar) kan inte importeras och hoppas över.
export function kahootRader(fragor) {
  const rader = [], hoppade = [], kortade = [];
  fragor.forEach((f, i) => {
    const fel = (f.fel ?? []).filter((x) => String(x ?? '').trim()).slice(0, 3);
    if (!fel.length) { hoppade.push(i + 1); return; }
    const svar = blanda([f.svar, ...fel]);
    const rad = { fraga: korta(f.fraga, MAX_FRAGA), svar: svar.map((x) => korta(x, MAX_SVAR)), ratt: svar.indexOf(f.svar) + 1, tid: TID };
    if (String(f.fraga).trim().length > MAX_FRAGA || svar.some((x) => String(x).trim().length > MAX_SVAR)) kortade.push(i + 1);
    rader.push(rad);
  });
  return { rader, hoppade, kortade };
}

// ---------- xlsx ----------
const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const kol = (i) => String.fromCharCode(65 + i);

export function kahootXlsxFiler(namn, rader) {
  const strangar = [], idx = new Map();
  const s = (t) => { t = String(t); if (!idx.has(t)) { idx.set(t, strangar.length); strangar.push(t); } return idx.get(t); };
  const cell = (r, c, v) => (typeof v === 'number' ? `<c r="${kol(c)}${r}"><v>${v}</v></c>` : `<c r="${kol(c)}${r}" t="s"><v>${s(v)}</v></c>`);
  const rows = [];
  rows.push(`<row r="2">${cell(2, 1, namn)}</row>`);
  rows.push(`<row r="8">${['Question - max 95 characters', 'Answer 1 - max 60 characters', 'Answer 2 - max 60 characters', 'Answer 3 - max 60 characters', 'Answer 4 - max 60 characters', 'Time limit (sec) – 5, 10, 20, 30, 60 or 120 secs', 'Correct answer(s) - choose at least one'].map((h, i) => cell(8, i + 1, h)).join('')}</row>`);
  rader.forEach((q, i) => {
    const r = 9 + i;
    const celler = [cell(r, 0, i + 1), cell(r, 1, q.fraga)];
    q.svar.forEach((a, k) => celler.push(cell(r, 2 + k, a)));
    celler.push(cell(r, 6, q.tid), cell(r, 7, q.ratt));
    rows.push(`<row r="${r}">${celler.join('')}</row>`);
  });
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}</sheetData></worksheet>`;
  const sst = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strangar.length}" uniqueCount="${strangar.length}">${strangar.map((t) => `<si><t xml:space="preserve">${xmlEsc(t)}</t></si>`).join('')}</sst>`;
  return {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Kahoot" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheet,
    'xl/sharedStrings.xml': sst,
  };
}

// ---------- okomprimerad zip ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function zip(filer) {
  const enc = new TextEncoder(), delar = [], central = [];
  let off = 0;
  for (const [namn, innehall] of Object.entries(filer)) {
    const n = enc.encode(namn), d = typeof innehall === 'string' ? enc.encode(innehall) : innehall, c = crc32(d);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, c, true); lh.setUint32(18, d.length, true); lh.setUint32(22, d.length, true);
    lh.setUint16(26, n.length, true); lh.setUint16(28, 0, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, c, true); ch.setUint32(20, d.length, true); ch.setUint32(24, d.length, true);
    ch.setUint16(28, n.length, true); ch.setUint32(42, off, true);
    delar.push(new Uint8Array(lh.buffer), n, d); central.push(new Uint8Array(ch.buffer), n);
    off += 30 + n.length + d.length;
  }
  const storlek = central.reduce((a, x) => a + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, central.length / 2, true); end.setUint16(10, central.length / 2, true);
  end.setUint32(12, storlek, true); end.setUint32(16, off, true);
  const ut = new Uint8Array(off + storlek + 22); let p = 0;
  for (const x of [...delar, ...central, new Uint8Array(end.buffer)]) { ut.set(x, p); p += x.length; }
  return ut;
}

// Laddar ned quizen som Kahoot-fil. Returnerar { antal, hoppade, kortade } för meddelandet.
export function laddaNedKahoot(namn, fragor) {
  const { rader, hoppade, kortade } = kahootRader(fragor);
  if (!rader.length) return { antal: 0, hoppade, kortade };
  const blob = new Blob([zip(kahootXlsxFiler(namn, rader))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${String(namn).replace(/[\\/:*?"<>|]+/g, '').trim() || 'quiz'} – Kahoot.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return { antal: rader.length, hoppade, kortade };
}
