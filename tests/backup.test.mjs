// Kör byggBackup med rader som har den riktiga databasens kolumner och skriv SQL-filen.
globalThis.document = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } }; globalThis.window = { addEventListener() {} }; globalThis.localStorage = { getItem: () => null, setItem() {} }; globalThis.sessionStorage = globalThis.localStorage;
const { byggBackup } = await import('../admin.js');
const data = {
  tht: [{ nr: 1, artal: 1998, ort: "Hässleholm's", kronika: null, start: null, klar: true }],
  person: [{ id: 1, fornamn: 'Jörgen', efternamn: 'Nilsson', hcp: 14.4, aktiv: true }, { id: 99, fornamn: 'Gäst', efternamn: '(okänd)', hcp: null, aktiv: false }],
  bana: [{ id: 1, namn: 'Hässleholm GK', slope: null, restaurang: true, rattigheter: false, lat: 56.1, lon: 13.7, osm_id: 123456789012 }],
  banversion: [{ id: 1, bana_id: 1, giltig_fran: '1998-01-01', kommentar: "ombyggd 'nya' hål" }],
  tee: [{ id: 1, banversion_id: 1, namn: 'gul', slope: 128, course_rating: 70.2 }],
  hal: Array.from({ length: 18 }, (_, i) => ({ id: i + 1, banversion_id: 1, nr: i + 1, par: 4, hcp_index: i + 1 })),
  hal_langd: Array.from({ length: 18 }, (_, i) => ({ hal_id: i + 1, tee_id: 1, langd: 350 })),
  deltavling: [{ id: 1, tht_nr: 1, banversion_id: 1, tee_id: 1, ordning: 1, namn: 'R1', datum: '1998-07-30', narmast_hal: 3, longest_hal: null }],
  runda: [{ id: 1, deltavling_id: 1, person_id: 1, spel_hcp: 17, boll_nr: null, tee_id: null, kommentar: null, last: false }],
  score: Array.from({ length: 18 }, (_, i) => ({ runda_id: 1, hal_nr: i + 1, slag: 5, puttar: i % 3 ? 2 : null, andrad: '2026-10-15T20:11:05.123456+00:00' })),
  pris: [{ deltavling_id: 1, typ: 'narmast', person_id: 1 }],
  overnattning: [{ id: 1, tht_nr: 1, platsnamn: 'Stuga', antal_natter: 3, organisator: 'Robert', lat: null, lon: null }],
  ban_betyg: [{ tht_nr: 1, bana_id: 1, person_id: 1, betyg: 4 }],
};
const sql = byggBackup(data, new Date('2026-10-16T10:00:00'));
(await import('fs')).writeFileSync('/tmp/backup-test.sql', sql);
console.log(sql.split('\n').slice(0, 14).join('\n'));
process.exit(0);
