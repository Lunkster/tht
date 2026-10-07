-- THT golfapp – beräkningsvyer v1 (2026-10-07)
-- All statistik härleds från slag per hål (N-32). security_invoker = vyerna följer tabellernas RLS.

-- Ett hål för en spelare: par, index, extraslag, poäng (Stableford), slag med tak par + 5.
create view v_score with (security_invoker = true) as
select
  s.runda_id, r.deltavling_id, d.tht_nr, t.artal, d.ordning, r.person_id, r.boll_nr,
  s.hal_nr, h.par, h.hcp_index, r.spel_hcp,
  -- extraslag: fungerar även för plushandicap (negativt spel-HCP)
  (floor(r.spel_hcp / 18.0)::int
     + case when h.hcp_index <= ((r.spel_hcp % 18) + 18) % 18 then 1 else 0 end) as extraslag,
  s.slag,
  least(s.slag, h.par + 5) as slag_tak,
  s.puttar,
  case when s.slag is null then null
       else greatest(0, h.par
              + floor(r.spel_hcp / 18.0)::int
              + case when h.hcp_index <= ((r.spel_hcp % 18) + 18) % 18 then 1 else 0 end
              + 2 - s.slag) end as poang,
  case when s.slag is null then null
       when s.slag = 1 then 'hole in one'
       when least(s.slag, h.par + 5) - h.par <= -3 then 'albatross'
       when least(s.slag, h.par + 5) - h.par = -2 then 'eagle'
       when least(s.slag, h.par + 5) - h.par = -1 then 'birdie'
       when least(s.slag, h.par + 5) - h.par = 0 then 'par'
       when least(s.slag, h.par + 5) - h.par = 1 then 'bogey'
       when least(s.slag, h.par + 5) - h.par = 2 then 'dubbelbogey'
       when least(s.slag, h.par + 5) - h.par = 3 then 'trippelbogey'
       else 'kvadrupel+' end as resultat
from score s
join runda r       on r.id = s.runda_id
join deltavling d  on d.id = r.deltavling_id
join tht t         on t.nr = d.tht_nr
join hal h         on h.banversion_id = d.banversion_id and h.nr = s.hal_nr;

-- En runda: summor och placering i deltävlingen.
create view v_runda with (security_invoker = true) as
select
  r.id as runda_id, r.deltavling_id, d.tht_nr, t.artal, d.ordning, d.namn as deltavling,
  r.person_id, p.fornamn, r.spel_hcp, r.boll_nr,
  count(vs.slag)               as antal_hal,
  sum(vs.slag_tak)             as slag,
  sum(vs.poang)                as poang,
  sum(vs.puttar)               as puttar,
  count(vs.puttar)             as hal_med_puttar,
  rank() over (partition by r.deltavling_id
               order by sum(vs.poang) desc nulls last, r.spel_hcp asc) as placering
from runda r
join deltavling d on d.id = r.deltavling_id
join tht t        on t.nr = d.tht_nr
join person p     on p.id = r.person_id
left join v_score vs on vs.runda_id = r.id
group by r.id, d.id, t.artal, p.fornamn;

-- En THT: totalresultat per spelare. Lika poäng -> lägst handicap vinner (F-37b).
-- Antagande: jämför genomsnittligt spel-HCP över THT:ns rundor.
create view v_tht_resultat with (security_invoker = true) as
select
  tht_nr, artal, person_id, fornamn,
  count(*)                     as rundor,
  sum(poang)                   as poang,
  sum(slag)                    as slag,
  round(sum(puttar)::numeric / nullif(sum(hal_med_puttar), 0) * 18, 1) as puttar_per_runda,
  round(avg(spel_hcp), 1)      as snitt_spel_hcp,
  rank() over (partition by tht_nr order by sum(poang) desc nulls last, avg(spel_hcp) asc) as placering
from v_runda
group by tht_nr, artal, person_id, fornamn;

-- THT-grafen (F-32): kumulativ poäng hål för hål över hela THT, även relativt "2 poäng per hål".
create view v_tht_kurva with (security_invoker = true) as
select
  tht_nr, artal, person_id, ordning, hal_nr,
  row_number() over w                         as hal_i_tht,
  sum(poang) over w                           as poang_ack,
  sum(poang - 2) over w                       as poang_ack_mot_hcp
from v_score
where poang is not null
window w as (partition by tht_nr, person_id order by ordning, hal_nr);
