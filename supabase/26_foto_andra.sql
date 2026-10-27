-- 26: Ändra ett foto i efterhand – fel runda eller fel år (önskemål Henrik 2026-10-28).
-- Admin och markör ändrar direkt i tabellen (regeln "admin och markör kan ändra" från migrering 25).
-- Spelaren ändrar sina egna foton via den personliga länken, och bara till THT:er hen själv spelat.
-- Filnamnet (som börjar med THT-numret vid uppladdningen) ändras inte – det är bara ett namn.

create or replace function public.foto_lank_andra(p_kod text, p_id integer, p_tht_nr integer, p_deltavling_id integer, p_text text)
  returns void
  language plpgsql security definer set search_path = ''
  as $$
  declare pid integer;
  begin
    select person_id into pid from public.spelar_lank where kod = p_kod;
    if pid is null then raise exception 'Länken finns inte eller har tagits bort'; end if;
    if not exists (select 1 from public.foto where id = p_id and person_id = pid and borttagen is null) then
      raise exception 'Fotot finns inte';
    end if;
    if p_tht_nr <= 0 or not exists (select 1 from public.runda r join public.deltavling d on d.id = r.deltavling_id
                                    where d.tht_nr = p_tht_nr and r.person_id = pid) then
      raise exception 'Du var inte med på den THT:n';
    end if;
    if p_deltavling_id is not null and not exists (select 1 from public.deltavling where id = p_deltavling_id and tht_nr = p_tht_nr) then
      raise exception 'Deltävlingen hör inte till THT:n';
    end if;
    update public.foto set tht_nr = p_tht_nr, deltavling_id = p_deltavling_id, text = left(p_text, 300)
      where id = p_id;
    update public.spelar_lank set anvand = now() where kod = p_kod;
  end $$;

revoke execute on function public.foto_lank_andra(text, integer, integer, integer, text) from public;
grant execute on function public.foto_lank_andra(text, integer, integer, integer, text) to anon, authenticated;
