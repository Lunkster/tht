-- 27: Foton, karuseller, minnesvärda moment och krönikor bakom lösenord (önskemål Henrik 2026-10-31).
-- Ny roll "lasare": ett tredje delat konto med en gemensam visningskod. Läsaren får se allt men inte skriva.
-- Inloggad = admin, markör eller läsare. Resultat och statistik är fortfarande öppna för alla.
--   * foto: bara inloggade läser. Bucketen foton blir privat – appen hämtar tillfälliga bildlänkar (signed URLs).
--   * kommentar (minnesvärda moment): bara inloggade läser.
--   * tht.kronika: anon får läsa alla kolumner utom krönikan.
-- Den personliga länken fungerar som förut (funktionerna är security definer). Spelarens egna foton på
-- länksidan visas via edge-funktionen foto-lank, som skapar bildlänkar efter att ha kontrollerat koden.
-- Kontot för läsaren skapas av Henrik i Supabase (Authentication → Users); rollen sätts sedan med
--   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"roll":"lasare"}' where email = 'h.lundqvist+thtlasare@gmail.com';

create or replace function public.ar_lasare() returns boolean
  language sql stable set search_path = ''
  as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'roll', '') = 'lasare' $$;

create or replace function public.ar_inloggad() returns boolean
  language sql stable set search_path = ''
  as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'roll', '') in ('admin', 'markor', 'lasare') $$;

-- Foton
alter policy "alla ser klara foton" on public.foto to authenticated
  using ((klar and borttagen is null and public.ar_inloggad()) or public.ar_admin() or public.ar_markor());
revoke select on public.foto from anon;

-- Minnesvärda moment
alter policy "alla kan läsa" on public.kommentar to authenticated using (public.ar_inloggad());
revoke select on public.kommentar from anon;

-- Krönikan: anon läser alla kolumner i tht utom kronika
revoke select on public.tht from anon;
grant select (nr, artal, ort, start, klar) on public.tht to anon;

-- Bilderna: privat bucket, bara inloggade läser. Anon får bara se filer som håller på att laddas upp
-- via länken eller saknar synlig rad (behövs för att Storage ska låta länken ladda upp och ta bort).
update storage.buckets set public = false where id = 'foton';
alter policy "foton: alla kan läsa" on storage.objects to authenticated
  using (bucket_id = 'foton' and public.ar_inloggad());
create policy "foton: länken ser filer på väg in eller ut" on storage.objects for select to anon
  using (bucket_id = 'foton' and (public.foto_vantar(name) or public.foto_utan_rad(name)));
