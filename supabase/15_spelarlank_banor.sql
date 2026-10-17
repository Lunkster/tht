-- 15: (a) Banbetygslänken gäller per spelare för alla år, (b) dubblettbanor blir versioner av samma bana.
-- Önskemål Henrik 2026-10-17.

-- (a) En personlig länk per spelare (inte per THT)
create table public.spelar_lank (
  kod       text primary key default replace(gen_random_uuid()::text, '-', ''),
  person_id integer not null unique references public.person (id),
  skapad    timestamptz not null default now(),
  anvand    timestamptz
);
comment on table public.spelar_lank is 'Personlig länk för banbetyg, en per spelare för alla år – koden är hemlig och läses bara av admin och markör';
alter table public.spelar_lank enable row level security;
create policy "admin och markör kan läsa" on public.spelar_lank for select to authenticated using (public.ar_admin() or public.ar_markor());
create policy "admin och markör kan skapa" on public.spelar_lank for insert to authenticated with check (public.ar_admin() or public.ar_markor());
create policy "admin och markör kan ta bort" on public.spelar_lank for delete to authenticated using (public.ar_admin() or public.ar_markor());

-- Redan skapade länkar per THT fortsätter fungera: samma kod blir spelarens länk
insert into public.spelar_lank (kod, person_id, skapad, anvand)
  select distinct on (person_id) kod, person_id, skapad, anvand from public.betyg_lank order by person_id, skapad
  on conflict do nothing;

-- Allt för länken: förnamn och varje THT spelaren har rundor i (nyast först) med banor och egna betyg
create or replace function public.betyg_lank_info(p_kod text)
  returns json
  language sql stable security definer set search_path = ''
  as $$
    select json_build_object(
      'fornamn', p.fornamn,
      'tht', coalesce((
        select json_agg(json_build_object('tht_nr', t.nr, 'artal', t.artal, 'ort', t.ort,
          'banor', (select json_agg(json_build_object('bana_id', s.bana_id, 'namn', s.namn, 'betyg', bb.betyg))
                    from public.spelade_banor(t.nr, l.person_id) s
                    left join public.ban_betyg bb on bb.tht_nr = t.nr and bb.person_id = l.person_id and bb.bana_id = s.bana_id))
          order by t.artal desc)
        from public.tht t
        where exists (select 1 from public.runda r join public.deltavling d on d.id = r.deltavling_id
                      where d.tht_nr = t.nr and r.person_id = l.person_id)), '[]'::json))
    from public.spelar_lank l
    join public.person p on p.id = l.person_id
    where l.kod = p_kod
  $$;

-- Spara: p_betyg = [{"tht_nr": 29, "bana_id": 80, "betyg": 4}, …]; betyg null tar bort. Bara spelade banor.
create or replace function public.lamna_banbetyg(p_kod text, p_betyg json)
  returns integer
  language plpgsql security definer set search_path = ''
  as $$
  declare pid integer; x json; nr integer; bid integer; v integer; n integer := 0;
  begin
    select person_id into pid from public.spelar_lank where kod = p_kod;
    if pid is null then raise exception 'Länken finns inte eller har tagits bort'; end if;
    for x in select * from json_array_elements(p_betyg) loop
      nr := (x ->> 'tht_nr')::integer;
      bid := (x ->> 'bana_id')::integer;
      v := nullif(x ->> 'betyg', '')::integer;
      if not exists (select 1 from public.spelade_banor(nr, pid) s where s.bana_id = bid) then
        raise exception 'Banan hör inte till dina rundor';
      end if;
      if v is null then
        delete from public.ban_betyg where tht_nr = nr and bana_id = bid and person_id = pid;
      elsif v between 1 and 5 then
        insert into public.ban_betyg (tht_nr, bana_id, person_id, betyg) values (nr, bid, pid, v)
          on conflict (tht_nr, bana_id, person_id) do update set betyg = excluded.betyg;
      else
        raise exception 'Betyget ska vara 1–5';
      end if;
      n := n + 1;
    end loop;
    update public.spelar_lank set anvand = now() where kod = p_kod;
    return n;
  end $$;

-- (b) Dubblettbanor → versioner av samma bana (den med banbetyg behålls)
update public.banversion set bana_id = 28 where id = 70;   -- Kristinehamns GK 2021 → Kristinehamns GK
update public.banversion set bana_id = 26 where id = 43;   -- Linde GK 2013 → Linde GK
update public.banversion set bana_id = 27 where id = 76;   -- Nora Golfbana 2025 → Nora GK
update public.bana set namn = 'Nora Golfbana' where id = 27;
update public.banversion set kommentar = 'Hette Nora GK' where id = 28 and kommentar is null;
-- Lagans GK 1999 R5 saknade hål (inga scorekort): kopplas till Lagans GK:s version med hål
update public.deltavling set banversion_id = 4 where tht_nr = 2 and ordning = 5 and banversion_id = 62;
-- De tomma banorna 70, 40, 76 och 61 (med tomma versionen 62) tas bort av Henrik, se 15b.
