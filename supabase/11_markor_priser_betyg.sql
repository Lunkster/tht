-- 11: Markör även för närmast hål/longest drive och banbetyg (önskemål Henrik 2026-10-17).
-- Regeln: öppen (inte avslutad) THT = markör får ändra slag, puttar, bollar, banbetyg och priser.
-- Avslutad THT, banor, hål, THT och deltävlingar i övrigt = bara admin.

-- Öppen = THT:n är inte avslutad (tidigare krävdes även att det var den senaste)
create or replace function public.tht_oppen(nr integer) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.tht t where t.nr = tht_oppen.nr and not t.klar) $$;

create or replace function public.deltavling_oppen(did integer) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.deltavling d join public.tht t on t.nr = d.tht_nr
                       where d.id = did and not t.klar) $$;

-- Priser (vinnare)
create policy "markör kan skriva" on public.pris for insert to authenticated
  with check (public.ar_markor() and public.deltavling_oppen(deltavling_id));
create policy "markör kan ändra" on public.pris for update to authenticated
  using (public.ar_markor() and public.deltavling_oppen(deltavling_id))
  with check (public.ar_markor() and public.deltavling_oppen(deltavling_id));
create policy "markör kan radera" on public.pris for delete to authenticated
  using (public.ar_markor() and public.deltavling_oppen(deltavling_id));

-- Banbetyg
create policy "markör kan skriva" on public.ban_betyg for insert to authenticated
  with check (public.ar_markor() and public.tht_oppen(tht_nr));
create policy "markör kan ändra" on public.ban_betyg for update to authenticated
  using (public.ar_markor() and public.tht_oppen(tht_nr))
  with check (public.ar_markor() and public.tht_oppen(tht_nr));
create policy "markör kan ta bort" on public.ban_betyg for delete to authenticated
  using (public.ar_markor() and public.tht_oppen(tht_nr));

-- Deltävling: markör får bara ändra prishålen (närmast hål, longest drive)
create policy "markör kan ändra prishål" on public.deltavling for update to authenticated
  using (public.ar_markor() and public.deltavling_oppen(id))
  with check (public.ar_markor() and public.deltavling_oppen(id));

create or replace function public.markor_bara_prishal() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if public.ar_markor() and (to_jsonb(new) - 'narmast_hal' - 'longest_hal') is distinct from (to_jsonb(old) - 'narmast_hal' - 'longest_hal') then
      raise exception 'Markör får bara ändra hålen för närmast hål och longest drive';
    end if;
    return new;
  end $$;

create trigger markor_bara_prishal before update on public.deltavling
  for each row execute function public.markor_bara_prishal();
