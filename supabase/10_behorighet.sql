-- 10: Två behörighetsnivåer och borttagna kolumner (2026-10-17)
--
-- admin  – kontot h.lundqvist+tht@gmail.com: får ändra allt (som tidigare)
-- markör – kontot h.lundqvist+thtmarkor@gmail.com (delat lösenord): får bara mata in
--          rundor och scorekort och sätta spelare i bollar, i den senaste THT:n och bara
--          så länge den inte är avslutad.
-- Rollen ligger i auth.users.raw_app_meta_data -> 'roll' och följer med i inloggningens JWT.
-- Inloggade konton utan roll får inte skriva något (stänger även för ev. självregistrerade konton).

create or replace function public.ar_admin() returns boolean
  language sql stable set search_path = ''
  as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'roll', '') = 'admin' $$;

create or replace function public.ar_markor() returns boolean
  language sql stable set search_path = ''
  as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'roll', '') = 'markor' $$;

-- Deltävlingen hör till den senaste THT:n och den är inte avslutad
create or replace function public.deltavling_oppen(did integer) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.deltavling d join public.tht t on t.nr = d.tht_nr
                       where d.id = did and not t.klar and t.nr = (select max(nr) from public.tht)) $$;

create or replace function public.runda_oppen(rid integer) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select coalesce((select public.deltavling_oppen(r.deltavling_id) from public.runda r where r.id = rid), false) $$;

-- Alla "inloggad kan …"-regler blir "admin kan …"
do $$
declare p record; villkor text;
begin
  for p in select tablename, policyname, cmd from pg_policies where schemaname = 'public' and policyname like 'inloggad %' loop
    villkor := case p.cmd
      when 'INSERT' then 'with check (public.ar_admin())'
      when 'UPDATE' then 'using (public.ar_admin()) with check (public.ar_admin())'
      else 'using (public.ar_admin())' end;
    execute format('alter policy %I on public.%I %s', p.policyname, p.tablename, villkor);
    execute format('alter policy %I on public.%I rename to %I', p.policyname, p.tablename, replace(p.policyname, 'inloggad ', 'admin '));
  end loop;
end $$;

-- Markör: rundor (bollar) och score i öppen THT
create policy "markör kan skriva" on public.runda for insert to authenticated
  with check (public.ar_markor() and public.deltavling_oppen(deltavling_id));
create policy "markör kan ändra" on public.runda for update to authenticated
  using (public.ar_markor() and public.deltavling_oppen(deltavling_id))
  with check (public.ar_markor() and public.deltavling_oppen(deltavling_id));
create policy "markör kan radera" on public.runda for delete to authenticated
  using (public.ar_markor() and public.deltavling_oppen(deltavling_id));

create policy "markör kan skriva" on public.score for insert to authenticated
  with check (public.ar_markor() and public.runda_oppen(runda_id));
create policy "markör kan ändra" on public.score for update to authenticated
  using (public.ar_markor() and public.runda_oppen(runda_id))
  with check (public.ar_markor() and public.runda_oppen(runda_id));
create policy "markör kan radera" on public.score for delete to authenticated
  using (public.ar_markor() and public.runda_oppen(runda_id));

-- Roller på kontona (markörkontot skapas av Henrik i Supabase; kör raden igen efteråt)
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || '{"roll":"admin"}'
  where email = 'h.lundqvist+tht@gmail.com';
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || '{"roll":"markor"}'
  where email = 'h.lundqvist+thtmarkor@gmail.com';
