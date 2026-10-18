-- 20: Inbördes möten (F-39, beslut Henrik 2026-10-18).
-- Ett möte = en deltävling där båda spelarna har en hel runda (18 hål inmatade).
-- Poäng: flest poäng vinner, lika = oavgjort (ingen HCP-skiljning i inbördes möten).
-- Slag: minst antal slag (tak par + 5) vinner, lika = oavgjort.
-- En rad per spelare och motståndare och deltävling (varje möte finns alltså två gånger, en från vardera hållet).
create or replace view public.v_inbordes with (security_invoker = true) as
select a.deltavling_id, a.tht_nr, a.artal, a.ordning,
  a.person_id, b.person_id as mot_id,
  a.runda_id, b.runda_id as mot_runda_id,
  a.poang, b.poang as mot_poang,
  a.slag, b.slag as mot_slag,
  sign(a.poang - b.poang)::int as res_poang,   -- 1 vinst, 0 oavgjort, -1 förlust
  sign(b.slag - a.slag)::int as res_slag
from public.v_runda a
join public.v_runda b on b.deltavling_id = a.deltavling_id and b.person_id <> a.person_id
where a.antal_hal = 18 and b.antal_hal = 18;

-- Summa per spelare och motståndare (spelarsidan och matrisen i All-time)
create or replace view public.v_inbordes_summa with (security_invoker = true) as
select i.person_id, p.fornamn, i.mot_id, m.fornamn as mot_fornamn,
  count(*) as moten,
  count(*) filter (where res_poang = 1)  as vinster,
  count(*) filter (where res_poang = 0)  as oavgjort,
  count(*) filter (where res_poang = -1) as forluster,
  count(*) filter (where res_slag = 1)   as vinster_slag,
  count(*) filter (where res_slag = 0)   as oavgjort_slag,
  count(*) filter (where res_slag = -1)  as forluster_slag,
  sum(i.poang - i.mot_poang) as poang_diff,
  max(i.artal) as senast
from public.v_inbordes i
join public.person p on p.id = i.person_id
join public.person m on m.id = i.mot_id
group by i.person_id, p.fornamn, i.mot_id, m.fornamn;

grant select on public.v_inbordes, public.v_inbordes_summa to anon, authenticated;
