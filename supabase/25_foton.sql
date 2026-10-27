-- 25: Foton (önskemål Henrik 2026-10-27, se Obsidian THT-golfapp → Vägval: foton).
-- Bilderna ligger i Supabase Storage (bucket "foton", publik läsning) och krymps i webbläsaren innan
-- uppladdning: en stor bild (ca 300 kB, högst 1600 px) och en liten för gallerier (<namn>-liten.jpg).
-- Tabellen foto knyter varje bild till en THT och gärna en deltävling. Alla får ladda upp:
--   * admin och markör i appen (alltid, även avslutade THT – som minnesvärda moment),
--   * spelarna via sin personliga länk (#/betyg/<kod>) till THT de har spelat. Ingen granskning.
-- Flöde: rad skapas (klar = false) → filerna laddas upp → raden markeras klar. Bara klara rader syns.
-- Via länken tas inga rader bort (Supabase-kopplingen kräver då ett godkännande): spelarens borttagning
-- sätter borttagen och raden döljs. Admin och markör tar bort rader på riktigt i appen.
-- Kördes som tre migreringar 2026-10-27: 25a_foton_tabell, 25b_foton_lagring, 25c_foton_lank.

-- ---------- bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foton', 'foton', true, 600000, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 600000, allowed_mime_types = array['image/jpeg'];

-- ---------- tabell ----------
create table public.foto (
  id            integer generated always as identity primary key,
  tht_nr        integer not null references public.tht (nr) on delete cascade,
  deltavling_id integer references public.deltavling (id) on delete set null,
  person_id     integer references public.person (id) on delete set null,   -- uppladdat via personlig länk; null = admin/markör
  fil           text not null unique,                                        -- namn i bucketen, t.ex. 29/<uuid>.jpg
  bredd         integer,
  hojd          integer,
  tagen         timestamptz,                                                 -- ur bildens EXIF, om den finns
  text          text check (text is null or length(text) <= 300),
  klar          boolean not null default false,
  skapad        timestamptz not null default now(),
  borttagen     timestamptz                                                  -- borttaget via länken: döljs, filerna tas bort
);
comment on table public.foto is 'Foton från THT – filerna ligger i Storage-bucketen foton (fil = namnet där, liten bild = <fil utan .jpg>-liten.jpg)';
create index foto_tht_idx on public.foto (tht_nr);
create index foto_deltavling_idx on public.foto (deltavling_id);
create index foto_person_idx on public.foto (person_id);

-- Liten bild hör alltid till den stora
create or replace function public.foto_liten(p_fil text) returns text
  language sql immutable set search_path = ''
  as $$ select regexp_replace(p_fil, '\.jpg$', '-liten.jpg') $$;

-- Deltävlingen bestämmer THT:n
create or replace function public.foto_synka() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if new.deltavling_id is not null then
    select d.tht_nr into new.tht_nr from public.deltavling d where d.id = new.deltavling_id;
  end if;
  if new.text is not null and btrim(new.text) = '' then new.text := null; end if;
  return new;
end $$;
create trigger foto_synka before insert or update on public.foto
  for each row execute function public.foto_synka();

alter table public.foto enable row level security;
create policy "alla ser klara foton" on public.foto for select to anon, authenticated
  using ((klar and borttagen is null) or public.ar_admin() or public.ar_markor());
create policy "admin och markör kan lägga till" on public.foto for insert to authenticated with check (public.ar_admin() or public.ar_markor());
create policy "admin och markör kan ändra" on public.foto for update to authenticated using (public.ar_admin() or public.ar_markor()) with check (public.ar_admin() or public.ar_markor());
create policy "admin och markör kan ta bort" on public.foto for delete to authenticated using (public.ar_admin() or public.ar_markor());
grant select on public.foto to anon, authenticated;
grant insert, update, delete on public.foto to authenticated;

-- ---------- Storage-regler ----------
-- Filen väntar på uppladdning via länk: en rad som inte är klar, skapad nyss
create or replace function public.foto_vantar(p_namn text) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.foto f where not f.klar and f.person_id is not null
                        and f.skapad > now() - interval '1 hour'
                        and p_namn in (f.fil, public.foto_liten(f.fil))) $$;
-- Filen saknar rad (borttagen eller aldrig klar) – då får den tas bort av vem som helst
create or replace function public.foto_utan_rad(p_namn text) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select not exists (select 1 from public.foto f where f.borttagen is null and p_namn in (f.fil, public.foto_liten(f.fil))) $$;

create policy "foton: alla kan läsa" on storage.objects for select to anon, authenticated
  using (bucket_id = 'foton');
create policy "foton: admin och markör laddar upp" on storage.objects for insert to authenticated
  with check (bucket_id = 'foton' and (public.ar_admin() or public.ar_markor()));
create policy "foton: uppladdning via länk" on storage.objects for insert to anon
  with check (bucket_id = 'foton' and public.foto_vantar(name));
create policy "foton: admin och markör tar bort" on storage.objects for delete to authenticated
  using (bucket_id = 'foton' and (public.ar_admin() or public.ar_markor()));
create policy "foton: filer utan rad tas bort" on storage.objects for delete to anon
  using (bucket_id = 'foton' and public.foto_utan_rad(name));

-- ---------- via personlig länk ----------
-- Spelarens egna foton
create or replace function public.foto_lank_info(p_kod text)
  returns json
  language sql stable security definer set search_path = ''
  as $$
    select coalesce(json_agg(json_build_object('id', f.id, 'tht_nr', f.tht_nr, 'deltavling_id', f.deltavling_id,
             'fil', f.fil, 'text', f.text, 'tagen', f.tagen) order by f.tht_nr desc, f.tagen nulls last, f.id), '[]'::json)
    from public.spelar_lank l join public.foto f on f.person_id = l.person_id
    where l.kod = p_kod and f.klar and f.borttagen is null
  $$;

-- Skapa raden och få filnamnet att ladda upp till (gäller en timme)
create or replace function public.foto_lank_reservera(p_kod text, p_tht_nr integer, p_deltavling_id integer,
    p_bredd integer, p_hojd integer, p_tagen timestamptz, p_text text)
  returns json
  language plpgsql security definer set search_path = ''
  as $$
  declare pid integer; nytt public.foto;
  begin
    select person_id into pid from public.spelar_lank where kod = p_kod;
    if pid is null then raise exception 'Länken finns inte eller har tagits bort'; end if;
    if p_tht_nr <= 0 or not exists (select 1 from public.runda r join public.deltavling d on d.id = r.deltavling_id
                                    where d.tht_nr = p_tht_nr and r.person_id = pid) then
      raise exception 'Du var inte med på den THT:n';
    end if;
    if p_deltavling_id is not null and not exists (select 1 from public.deltavling where id = p_deltavling_id and tht_nr = p_tht_nr) then
      raise exception 'Deltävlingen hör inte till THT:n';
    end if;
    if (select count(*) from public.foto where person_id = pid and tht_nr = p_tht_nr and borttagen is null) >= 200 then
      raise exception 'Högst 200 foton per THT';
    end if;
    insert into public.foto (tht_nr, deltavling_id, person_id, fil, bredd, hojd, tagen, text)
      values (p_tht_nr, p_deltavling_id, pid, p_tht_nr || '/' || gen_random_uuid() || '.jpg', p_bredd, p_hojd, p_tagen, left(p_text, 300))
      returning * into nytt;
    update public.spelar_lank set anvand = now() where kod = p_kod;
    return json_build_object('id', nytt.id, 'fil', nytt.fil);
  end $$;

-- Uppladdat: markera klar (bara om den stora filen finns)
create or replace function public.foto_lank_klar(p_kod text, p_id integer)
  returns void
  language plpgsql security definer set search_path = ''
  as $$
  begin
    update public.foto f set klar = true
      from public.spelar_lank l
      where l.kod = p_kod and f.id = p_id and f.person_id = l.person_id
        and exists (select 1 from storage.objects o where o.bucket_id = 'foton' and o.name = f.fil);
    if not found then raise exception 'Fotot kunde inte sparas'; end if;
  end $$;

-- Ta bort eget foto: raden markeras borttagen (döljs), sedan tar appen bort filerna
create or replace function public.foto_lank_ta_bort(p_kod text, p_id integer)
  returns text
  language plpgsql security definer set search_path = ''
  as $$
  declare f text;
  begin
    update public.foto x set borttagen = now() from public.spelar_lank l
      where l.kod = p_kod and x.id = p_id and x.person_id = l.person_id and x.borttagen is null
      returning x.fil into f;
    if f is null then raise exception 'Fotot finns inte'; end if;
    return f;
  end $$;

revoke execute on function public.foto_lank_info(text), public.foto_lank_reservera(text, integer, integer, integer, integer, timestamptz, text),
  public.foto_lank_klar(text, integer), public.foto_lank_ta_bort(text, integer) from public;
grant execute on function public.foto_lank_info(text), public.foto_lank_reservera(text, integer, integer, integer, integer, timestamptz, text),
  public.foto_lank_klar(text, integer), public.foto_lank_ta_bort(text, integer) to anon, authenticated;
