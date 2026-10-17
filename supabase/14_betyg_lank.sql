-- 14: Banbetyg via personlig länk (önskemål Henrik 2026-10-17).
-- Varje spelare får en egen hemlig länk per THT (#/betyg/<kod>) och kan utan inloggning
-- betygsätta de banor hen spelade det året. Länken ger inte rätt till något annat.

create table public.betyg_lank (
  kod       text primary key default replace(gen_random_uuid()::text, '-', ''),
  tht_nr    integer not null references public.tht (nr),
  person_id integer not null references public.person (id),
  skapad    timestamptz not null default now(),
  anvand    timestamptz,
  unique (tht_nr, person_id)
);
comment on table public.betyg_lank is 'Personliga länkar för banbetyg – koden är hemlig och läses bara av admin och markör';

alter table public.betyg_lank enable row level security;
create policy "admin och markör kan läsa" on public.betyg_lank for select to authenticated using (public.ar_admin() or public.ar_markor());
create policy "admin och markör kan skapa" on public.betyg_lank for insert to authenticated with check (public.ar_admin() or public.ar_markor());
create policy "admin och markör kan ta bort" on public.betyg_lank for delete to authenticated using (public.ar_admin() or public.ar_markor());

-- Banorna en spelare spelade en viss THT, i spelordning
create or replace function public.spelade_banor(p_tht integer, p_person integer)
  returns table (bana_id integer, namn text)
  language sql stable security definer set search_path = ''
  as $$
    select b.id, b.namn
    from public.runda r
    join public.deltavling d on d.id = r.deltavling_id
    join public.banversion bv on bv.id = d.banversion_id
    join public.bana b on b.id = bv.bana_id
    where d.tht_nr = p_tht and r.person_id = p_person
    group by b.id, b.namn
    order by min(d.ordning)
  $$;
revoke execute on function public.spelade_banor(integer, integer) from public, anon, authenticated;

-- Vad länken visar: THT, spelarens förnamn och banorna med ev. befintligt betyg
create or replace function public.betyg_lank_info(p_kod text)
  returns json
  language sql stable security definer set search_path = ''
  as $$
    select json_build_object(
      'tht_nr', l.tht_nr, 'artal', t.artal, 'ort', t.ort, 'fornamn', p.fornamn,
      'banor', coalesce((select json_agg(json_build_object('bana_id', s.bana_id, 'namn', s.namn, 'betyg', bb.betyg))
                         from public.spelade_banor(l.tht_nr, l.person_id) s
                         left join public.ban_betyg bb on bb.tht_nr = l.tht_nr and bb.person_id = l.person_id and bb.bana_id = s.bana_id), '[]'::json))
    from public.betyg_lank l
    join public.tht t on t.nr = l.tht_nr
    join public.person p on p.id = l.person_id
    where l.kod = p_kod
  $$;

-- Spara: p_betyg = [{"bana_id": 80, "betyg": 4}, …]; betyg null tar bort. Bara spelade banor.
create or replace function public.lamna_banbetyg(p_kod text, p_betyg json)
  returns integer
  language plpgsql security definer set search_path = ''
  as $$
  declare l public.betyg_lank; x json; bid integer; v integer; n integer := 0;
  begin
    select * into l from public.betyg_lank where kod = p_kod;
    if not found then raise exception 'Länken finns inte eller har tagits bort'; end if;
    for x in select * from json_array_elements(p_betyg) loop
      bid := (x ->> 'bana_id')::integer;
      v := nullif(x ->> 'betyg', '')::integer;
      if not exists (select 1 from public.spelade_banor(l.tht_nr, l.person_id) s where s.bana_id = bid) then
        raise exception 'Banan hör inte till dina rundor';
      end if;
      if v is null then
        delete from public.ban_betyg where tht_nr = l.tht_nr and bana_id = bid and person_id = l.person_id;
      elsif v between 1 and 5 then
        insert into public.ban_betyg (tht_nr, bana_id, person_id, betyg) values (l.tht_nr, bid, l.person_id, v)
          on conflict (tht_nr, bana_id, person_id) do update set betyg = excluded.betyg;
      else
        raise exception 'Betyget ska vara 1–5';
      end if;
      n := n + 1;
    end loop;
    update public.betyg_lank set anvand = now() where kod = p_kod;
    return n;
  end $$;

grant execute on function public.betyg_lank_info(text) to anon, authenticated;
grant execute on function public.lamna_banbetyg(text, json) to anon, authenticated;
