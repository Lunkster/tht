-- 28: Lika poäng i totalen avgörs av spel-HCP i spelarens sista runda (Henrik 2026-11-03).
-- Deltävlingar avgörs som förut av spel-HCP i just den rundan (v_runda_alla).
-- Kontrollerat före ändringen: ingen totalplacering 1998–2026 ändras.
create or replace view public.v_tht_resultat with (security_invoker = true) as
 select tht_nr, artal, person_id, fornamn,
    count(*) as rundor,
    sum(poang) as poang,
    sum(slag) as slag,
    round(sum(puttar) / nullif(sum(hal_med_puttar), 0::numeric) * 18::numeric, 1) as puttar_per_runda,
    round(avg(spel_hcp), 1) as snitt_spel_hcp,
    rank() over (partition by tht_nr order by sum(poang) desc nulls last,
      (array_agg(spel_hcp order by ordning desc) filter (where spel_hcp is not null))[1] nulls last) as placering,
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
