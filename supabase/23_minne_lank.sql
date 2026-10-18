-- 23: Minnesvärt moment via den personliga länken (önskemål Henrik 2026-10-18).
-- Spelaren får skriva ETT eget minnesvärt moment per deltävling – bara om sin egen runda, inte om andra.
-- Markeras fran_lank = true. Admin och markör kan fortfarande skriva fler (och ändra/ta bort spelarens).
-- Övningen (THT 0) visas inte via länken.

alter table public.kommentar add column fran_lank boolean not null default false;
comment on column public.kommentar.fran_lank is 'Skrivet av spelaren själv via den personliga länken (högst ett per runda)';
create unique index kommentar_en_per_lank on public.kommentar (runda_id) where fran_lank;

-- Spelarens deltävlingar (nyast först) med det egna momentet
create or replace function public.minne_lank_info(p_kod text)
  returns json
  language sql stable security definer set search_path = ''
  as $$
    select coalesce(json_agg(json_build_object(
        'deltavling_id', d.id, 'tht_nr', t.nr, 'artal', t.artal, 'ort', t.ort, 'ordning', d.ordning, 'bana', b.namn,
        'text', (select k.text from public.kommentar k where k.runda_id = r.id and k.fran_lank))
      order by t.artal desc, d.ordning), '[]'::json)
    from public.spelar_lank l
    join public.runda r on r.person_id = l.person_id
    join public.deltavling d on d.id = r.deltavling_id
    join public.tht t on t.nr = d.tht_nr
    left join public.banversion bv on bv.id = d.banversion_id
    left join public.bana b on b.id = bv.bana_id
    where l.kod = p_kod and t.nr > 0
  $$;

-- Spara eller ta bort (tom text) det egna momentet för en deltävling
create or replace function public.lamna_minne(p_kod text, p_deltavling_id integer, p_text text)
  returns void
  language plpgsql security definer set search_path = ''
  as $$
  declare pid integer; rid integer; txt text := btrim(coalesce(p_text, ''));
  begin
    select person_id into pid from public.spelar_lank where kod = p_kod;
    if pid is null then raise exception 'Länken finns inte eller har tagits bort'; end if;
    select r.id into rid from public.runda r join public.deltavling d on d.id = r.deltavling_id
      where r.person_id = pid and r.deltavling_id = p_deltavling_id and d.tht_nr > 0;
    if rid is null then raise exception 'Du spelade inte den deltävlingen'; end if;
    if txt = '' then
      delete from public.kommentar where runda_id = rid and fran_lank;
    elsif length(txt) > 500 then
      raise exception 'Högst 500 tecken';
    else
      insert into public.kommentar (deltavling_id, runda_id, text, fran_lank) values (p_deltavling_id, rid, txt, true)
        on conflict (runda_id) where fran_lank do update set text = excluded.text;
    end if;
    update public.spelar_lank set anvand = now() where kod = p_kod;
  end $$;

-- Banbetygslänken visar inte övningen
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
        where t.nr > 0 and exists (select 1 from public.runda r join public.deltavling d on d.id = r.deltavling_id
                      where d.tht_nr = t.nr and r.person_id = l.person_id)), '[]'::json))
    from public.spelar_lank l
    join public.person p on p.id = l.person_id
    where l.kod = p_kod
  $$;
