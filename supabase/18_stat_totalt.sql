-- 18: Totaltabell per spelare (önskemål Henrik 2026-10-18): rundor, banor, hål, poäng, slag, puttar och meter.
-- Slag = verkliga slag (utan tak). Meter = hålets längd från den tee deltävlingen spelades från.
create or replace view public.v_stat_totalt with (security_invoker = true) as
select s.person_id, p.fornamn,
  count(distinct s.tht_nr) as tht,
  count(distinct s.runda_id) as rundor,
  count(distinct bv.bana_id) as banor,
  count(*) as hal,
  sum(s.poang) as poang,
  sum(s.slag) as slag,
  sum(s.puttar) as puttar,
  count(s.puttar) as hal_med_puttar,
  sum(hl.langd) as meter,
  count(hl.langd) as hal_med_langd
from public.v_score s
join public.person p on p.id = s.person_id
join public.runda r on r.id = s.runda_id
join public.deltavling d on d.id = s.deltavling_id
join public.banversion bv on bv.id = d.banversion_id
join public.hal h on h.banversion_id = d.banversion_id and h.nr = s.hal_nr
left join public.hal_langd hl on hl.hal_id = h.id and hl.tee_id = coalesce(r.tee_id, d.tee_id)
where s.slag is not null
group by s.person_id, p.fornamn;
grant select on public.v_stat_totalt to anon, authenticated;
