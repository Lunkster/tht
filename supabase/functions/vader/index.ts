// Edge-funktion vader (migrering 29, önskemål Henrik 2026-11-10): hämtar vädret 09–15 lokal tid för deltävlingens
// datum och banans koordinater från Open-Meteo och sparar det i tabellen vader. Anropas utan inloggning:
// POST { deltavling_ids: [1, 2, …] } (högst 40). Hämtar bara det som saknas eller är en äldre prognos;
// framtida deltävlingar hoppas över. Returnerar raderna som finns efteråt.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const svar = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const TIMMAR = [9, 10, 11, 12, 13, 14, 15];
const VARIABLER = 'temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation';
const dagar = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const r1 = (v: number | null) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const snitt = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

// Dagens kod: åska om det åskat; nederbörd om minst två timmar haft det och det blivit minst 1 mm (vanligaste koden,
// vid lika den kraftigaste) – ERA5 anger lätt duggregn redan vid några tiondels mm; dimma om de flesta timmarna;
// annars molnigheten: klart < 20 %, halvklart < 50 %, molnigt < 80 %, mulet.
function dagkod(koder: number[], moln: number | null, mm: number): number | null {
  if (!koder.length && moln == null) return null;
  const aska = koder.filter((k) => k >= 95);
  if (aska.length) return Math.max(...aska);
  const ned = koder.filter((k) => k >= 51);
  if (ned.length >= 2 && mm >= 1) {
    const antal = new Map<number, number>(); ned.forEach((k) => antal.set(k, (antal.get(k) ?? 0) + 1));
    return [...antal.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  }
  if (koder.filter((k) => k === 45 || k === 48).length >= 4) return 45;
  if (moln == null) return Math.max(...koder.filter((k) => k <= 3), 0);
  return moln < 20 ? 0 : moln < 50 ? 1 : moln < 80 ? 2 : 3;
}

async function hamta(lat: number, lon: number, datum: string, idag: string) {
  const gammal = dagar(datum, idag) > 6;
  const bas = gammal ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
  const url = `${bas}?latitude=${lat}&longitude=${lon}&start_date=${datum}&end_date=${datum}&hourly=${VARIABLER}&timezone=auto&wind_speed_unit=ms`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const h = (await r.json()).hourly;
  const timmar = TIMMAR.map((t) => {
    const i = (h.time as string[]).findIndex((x) => x.endsWith(`T${String(t).padStart(2, '0')}:00`));
    return i < 0 ? null : { h: t, temp: r1(h.temperature_2m[i]), kod: h.weather_code[i], moln: h.cloud_cover[i], vind: r1(h.wind_speed_10m[i]), byar: r1(h.wind_gusts_10m[i]), riktning: h.wind_direction_10m[i], nederbord: r1(h.precipitation[i]) };
  }).filter((x) => x && x.temp != null) as Record<string, number>[];
  if (!timmar.length) return null;
  const temp = timmar.map((x) => x.temp), moln = snitt(timmar.map((x) => x.moln));
  const mm = timmar.reduce((a, x) => a + (x.nederbord ?? 0), 0);
  // Medelriktning som vektor (så att 350° och 10° blir 0°, inte 180°)
  const sx = timmar.reduce((a, x) => a + (x.vind ?? 0) * Math.sin((x.riktning ?? 0) * Math.PI / 180), 0);
  const cx = timmar.reduce((a, x) => a + (x.vind ?? 0) * Math.cos((x.riktning ?? 0) * Math.PI / 180), 0);
  return {
    kalla: gammal ? 'arkiv' : 'prognos',
    temp: r1(snitt(temp)), temp_min: r1(Math.min(...temp)), temp_max: r1(Math.max(...temp)),
    moln: moln == null ? null : Math.round(moln),
    vind: r1(snitt(timmar.map((x) => x.vind))),
    byar: r1(Math.max(...timmar.map((x) => x.byar ?? 0))),
    vindriktning: sx || cx ? Math.round((Math.atan2(sx, cx) * 180 / Math.PI + 360) % 360) : null,
    nederbord: r1(mm),
    kod: dagkod(timmar.map((x) => x.kod).filter((k) => k != null), moln, mm),
    timmar,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return svar({ message: 'Bara POST' }, 405);
  let ids: number[] = [];
  try { ids = ((await req.json()).deltavling_ids ?? []).map(Number).filter((x: number) => Number.isInteger(x) && x > 0); } catch { /* tom */ }
  ids = [...new Set(ids)].slice(0, 40);
  if (!ids.length) return svar({ rader: [], fel: [] });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const [{ data: delt, error }, { data: finns }] = await Promise.all([
    db.from('deltavling').select('id,datum,tht_nr,banversion(bana(lat,lon))').in('id', ids),
    db.from('vader').select('deltavling_id,kalla,hamtad').in('deltavling_id', ids),
  ]);
  if (error) return svar({ message: error.message }, 500);
  const idag = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
  const har = new Map((finns ?? []).map((v) => [v.deltavling_id, v]));
  const fel: string[] = [];
  for (const d of delt ?? []) {
    // deno-lint-ignore no-explicit-any
    const b = (d as any).banversion?.bana;
    if (!d.datum || d.tht_nr === 0 || d.datum > idag || b?.lat == null || b?.lon == null) continue;
    const v = har.get(d.id);
    // Arkivdata hämtas en gång; en prognos hämtas om när dagen blivit historik eller efter en timme
    if (v && (v.kalla === 'arkiv' || (dagar(d.datum, idag) <= 6 && Date.now() - Date.parse(v.hamtad) < 3600000))) continue;
    try {
      const w = await hamta(b.lat, b.lon, d.datum, idag);
      if (!w) continue;
      const { error: e } = await db.from('vader').upsert({ deltavling_id: d.id, datum: d.datum, lat: b.lat, lon: b.lon, hamtad: new Date().toISOString(), ...w });
      if (e) fel.push(`${d.id}: ${e.message}`);
    } catch (e) { fel.push(`${d.id}: ${(e as Error).message}`); }
  }
  const { data: rader } = await db.from('vader').select('*').in('deltavling_id', ids);
  return svar({ rader: rader ?? [], fel });
});
