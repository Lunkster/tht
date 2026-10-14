// Tolkar ett inklistrat scorekort (från Excel, webbsida eller handskrivet) till par, index och längder.
// Två format känns igen automatiskt:
//  A) en rad per hål:          "1  4  7  345  320"  (hålnummer valfritt, sedan par, index, längder per tee)
//  B) en rad per egenskap:     "Par 4 3 5 4 …"  /  "Index 7 17 1 …"  /  "Gul 345 150 480 …"
//     Summakolumner (Ut/In/Tot) tas bort om de finns med.
// Ren funktion utan DOM så att den kan testas i node.

const TAL = (t) => {
  const v = Number(String(t).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

function delaRad(rad) {
  const tokens = rad.split(/[\t;|]+|\s+/).filter(Boolean);
  const nums = [], label = [];
  for (const t of tokens) {
    const v = TAL(t);
    if (v === null) { if (!nums.length) label.push(t); }
    else nums.push(v);
  }
  return { label: label.join(' '), nums };
}

const arPar = (xs) => xs.length > 0 && xs.every((v) => Number.isInteger(v) && v >= 3 && v <= 6);
const arIndex = (xs) => xs.length > 0 && xs.every((v) => Number.isInteger(v) && v >= 1 && v <= 18) && new Set(xs).size === xs.length;
const arLangd = (xs) => xs.length > 0 && xs.every((v) => v > 0) && Math.max(...xs) > 40;
const arHalnr = (xs) => xs.every((v, i) => v === i + 1);
const SUMMA = /^(ut|in|out|tot|total|summa|sum|s:a)\b/i;

// Ta bort summakolumner ur en rad med 18 hål (eller 9).
function utanSummor(nums) {
  const n = nums.length;
  const sum = (a, b) => nums.slice(a, b).reduce((s, v) => s + v, 0);
  if (n === 21 && nums[9] === sum(0, 9) && nums[19] === sum(10, 19)) return [...nums.slice(0, 9), ...nums.slice(10, 19)];
  if (n === 20 && nums[9] === sum(0, 9) && nums[19] === sum(10, 19)) return [...nums.slice(0, 9), ...nums.slice(10, 19)];
  if (n === 19 && nums[18] === sum(0, 18)) return nums.slice(0, 18);
  if (n === 11 && nums[9] === sum(0, 9)) return nums.slice(0, 9);
  if (n === 10 && nums[9] === sum(0, 9)) return nums.slice(0, 9);
  return nums.slice(0, 18);
}

export function tolkaScorekort(text, teeNamn = []) {
  const rader = String(text || '').split(/\r?\n/).map((r) => r.trim()).filter(Boolean).map(delaRad).filter((r) => r.nums.length);
  const ut = { par: [], index: [], langd: teeNamn.map(() => []), extraLangd: 0, antalHal: 0, info: [], varningar: [] };
  if (!rader.length) { ut.varningar.push('Hittade inga tal i texten.'); return ut; }

  const breda = rader.filter((r) => r.nums.length >= 9);
  const format = breda.length && breda.length <= 10 && breda.length >= rader.length / 2 ? 'B' : 'A';

  // Kolumner/rader att fördela: [{label, varden}]
  let serier = [];
  if (format === 'B') {
    serier = breda
      .map((r) => ({ label: r.label, varden: utanSummor(r.nums) }))
      .filter((s) => !(/^(h[åa]l|hole|nr)/i.test(s.label) || (!s.label && arHalnr(s.varden) && s.varden.length >= 9)));
  } else {
    let hal = rader.filter((r) => !SUMMA.test(r.label) && r.nums.length >= 2);
    // Summarader utan etikett: sista raden kan vara totalsumma – ta bara de första 18
    hal = hal.slice(0, 18);
    const bredd = Math.max(...hal.map((r) => r.nums.length));
    let kolumner = Array.from({ length: bredd }, (_, k) => hal.map((r) => r.nums[k] ?? null));
    if (kolumner.length >= 3 && arHalnr(kolumner[0])) kolumner = kolumner.slice(1);
    serier = kolumner.map((varden) => ({ label: '', varden }));
  }

  // Fördela serierna: etikett först, annars efter värdena.
  const teeLedig = teeNamn.map(() => true);
  const satt = (s, typ, ti) => {
    const v = s.varden.slice(0, 18);
    if (typ === 'par') ut.par = v;
    else if (typ === 'index') ut.index = v;
    else if (typ === 'langd') {
      if (ti === undefined) ti = teeLedig.findIndex(Boolean);
      if (ti === -1) { ut.extraLangd++; return; }
      teeLedig[ti] = false; ut.langd[ti] = v;
    }
  };
  const kvar = [];
  for (const s of serier) {
    const l = s.label.toLowerCase();
    const giltiga = s.varden.filter((v) => v !== null);
    if (/^par\b/.test(l)) satt(s, 'par');
    else if (/^(hcp|index|idx|si|handicap|slag)/.test(l)) satt(s, 'index');
    else if (l && teeNamn.some((t) => t && l.includes(String(t).toLowerCase()))) {
      satt(s, 'langd', teeNamn.findIndex((t) => t && l.includes(String(t).toLowerCase())));
    } else if (!ut.par.length && arPar(giltiga)) satt(s, 'par');
    else if (!ut.index.length && arIndex(giltiga)) satt(s, 'index');
    else if (arLangd(giltiga)) kvar.push(s);
  }
  kvar.forEach((s) => satt(s, 'langd'));

  ut.antalHal = Math.max(ut.par.length, ut.index.length, ...ut.langd.map((x) => x.length), 0);
  if (ut.par.length) ut.info.push(`par för ${ut.par.filter((v) => v !== null).length} hål`);
  if (ut.index.length) ut.info.push(`index för ${ut.index.filter((v) => v !== null).length} hål`);
  ut.langd.forEach((x, i) => { if (x.length) ut.info.push(`längd från tee ${teeNamn[i]}`); });
  if (ut.extraLangd) ut.varningar.push(`${ut.extraLangd} kolumn(er) med längder fick ingen tee – lägg till tee:n först och klistra in igen.`);
  if (ut.par.length && !arPar(ut.par.filter((v) => v !== null))) ut.varningar.push('Några par-värden ligger utanför 3–6.');
  if (ut.index.length) {
    const ix = ut.index.filter((v) => v !== null);
    if (new Set(ix).size !== ix.length) ut.varningar.push('Något index förekommer två gånger.');
  }
  if (!ut.info.length) ut.varningar.push('Kunde inte känna igen par, index eller längder.');
  return ut;
}

// Kontroll av ifyllda hål innan sparning. hal: [{nr, par, index}] (null = tomt)
export function kontrolleraHal(hal) {
  const fel = [], varn = [];
  hal.forEach((h) => {
    if ((h.par === null) !== (h.index === null)) fel.push(`Hål ${h.nr}: fyll i både par och index.`);
    if (h.par !== null && !(Number.isInteger(h.par) && h.par >= 3 && h.par <= 6)) fel.push(`Hål ${h.nr}: par ska vara 3–6.`);
    if (h.index !== null && !(Number.isInteger(h.index) && h.index >= 1 && h.index <= 18)) fel.push(`Hål ${h.nr}: index ska vara 1–18.`);
  });
  const ifyllda = hal.filter((h) => h.index !== null);
  const sedda = {};
  ifyllda.forEach((h) => { (sedda[h.index] ??= []).push(h.nr); });
  Object.entries(sedda).filter(([, nr]) => nr.length > 1).forEach(([ix, nr]) => varn.push(`Index ${ix} finns på hål ${nr.join(' och ')}.`));
  if (ifyllda.length && ifyllda.length !== 18 && ifyllda.length !== 9) varn.push(`${ifyllda.length} hål är ifyllda – brukar vara 18.`);
  return { fel, varn };
}
