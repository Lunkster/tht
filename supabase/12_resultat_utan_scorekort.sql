-- 12: Resultat utan scorekort (önskemål Henrik 2026-10-17, THT 1999).
-- För år där scorekorten saknas men totalresultatet och deltävlingsvinnarna är kända.
-- Statistik per runda (snitt, slag, puttar) påverkas inte – bara placering, poäng och segrar.

create table public.tht_resultat_utan_kort (
  tht_nr    integer not null references public.tht (nr),
  person_id integer not null references public.person (id),
  poang     integer not null,
  primary key (tht_nr, person_id)
);
comment on table public.tht_resultat_utan_kort is 'Totalresultat för THT där scorekorten saknas (t.ex. 1999)';

alter table public.deltavling add column vinnare_utan_kort integer references public.person (id);
comment on column public.deltavling.vinnare_utan_kort is 'Känd vinnare när scorekorten saknas';

alter table public.tht_resultat_utan_kort enable row level security;
create policy "alla kan läsa" on public.tht_resultat_utan_kort for select to anon, authenticated using (true);
create policy "admin kan skriva" on public.tht_resultat_utan_kort for insert to authenticated with check (public.ar_admin());
create policy "admin kan ändra" on public.tht_resultat_utan_kort for update to authenticated using (public.ar_admin()) with check (public.ar_admin());
create policy "admin kan ta bort" on public.tht_resultat_utan_kort for delete to authenticated using (public.ar_admin());

-- v_tht_resultat: rundor från scorekort + totalresultat utan scorekort (bara THT utan rundor)
create or replace view public.v_tht_resultat with (security_invoker = true) as
 select tht_nr, artal, person_id, fornamn,
    count(*) as rundor,
    sum(poang) as poang,
    sum(slag) as slag,
    round(sum(puttar) / nullif(sum(hal_med_puttar), 0::numeric) * 18::numeric, 1) as puttar_per_runda,
    round(avg(spel_hcp), 1) as snitt_spel_hcp,
    rank() over (partition by tht_nr order by sum(poang) desc nulls last, avg(spel_hcp)) as placering,
    round(sum(puttar) / nullif(sum(hal_med_puttar), 0::numeric), 2) as puttar_per_hal
   from public.v_runda
  group by tht_nr, artal, person_id, fornamn
 union all
 select u.tht_nr, t.artal, u.person_id, p.fornamn,
    (select count(*) from public.deltavling d where d.tht_nr = u.tht_nr),
    u.poang::numeric, null::numeric, null::numeric, null::numeric,
    rank() over (partition by u.tht_nr order by u.poang desc),
    null::numeric
   from public.tht_resultat_utan_kort u
   join public.tht t on t.nr = u.tht_nr
   join public.person p on p.id = u.person_id
  where not exists (select 1 from public.v_runda r where r.tht_nr = u.tht_nr);

-- THT 1999 (THT 2, Alvesta): Robert 159, Marcus 146, Jörgen 144, Johan 138.
-- Deltävlingar: Johan R1 och R5, Marcus R2, Robert R3 och R4.
insert into public.tht_resultat_utan_kort (tht_nr, person_id, poang) values (2, 3, 159), (2, 2, 146), (2, 1, 144), (2, 5, 138);
update public.deltavling set vinnare_utan_kort = case ordning when 1 then 5 when 2 then 2 when 3 then 3 when 4 then 3 when 5 then 5 end where tht_nr = 2;
