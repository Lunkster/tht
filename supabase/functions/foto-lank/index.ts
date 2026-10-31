// Edge-funktion foto-lank (migrering 27, önskemål Henrik 2026-10-31): spelarens egna foton på den personliga
// länken, med tillfälliga bildlänkar. Bucketen foton är privat; funktionen kontrollerar koden och skapar
// signerade länkar (12 timmar) bara för spelarens egna, klara foton. Anropas utan inloggning: POST { kod }.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const svar = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return svar({ message: 'Bara POST' }, 405);
  let kod = '';
  try { kod = String((await req.json()).kod ?? ''); } catch { /* tom */ }
  if (!/^[0-9a-f]{16,64}$/i.test(kod)) return svar({ message: 'Länken finns inte eller har tagits bort' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: lank } = await db.from('spelar_lank').select('person_id').eq('kod', kod).maybeSingle();
  if (!lank) return svar({ message: 'Länken finns inte eller har tagits bort' }, 404);
  const { data: foton, error } = await db.from('foto')
    .select('id,tht_nr,deltavling_id,fil,text,tagen')
    .eq('person_id', lank.person_id).eq('klar', true).is('borttagen', null)
    .order('tht_nr', { ascending: false }).order('id');
  if (error) return svar({ message: error.message }, 500);
  if (!foton?.length) return svar([]);
  const liten = (f: string) => f.replace(/\.jpg$/, '-liten.jpg');
  const vagar = foton.flatMap((f) => [f.fil, liten(f.fil)]);
  const { data: signerade, error: fel } = await db.storage.from('foton').createSignedUrls(vagar, 12 * 3600);
  if (fel) return svar({ message: fel.message }, 500);
  const url = Object.fromEntries((signerade ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
  return svar(foton.map((f) => ({ ...f, url: url[f.fil] ?? null, liten_url: url[liten(f.fil)] ?? null })));
});
