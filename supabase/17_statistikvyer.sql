-- 17: Statistikvyer för All-time, årssidan och bansidan (önskemål Henrik 2026-10-17, F-33–F-35, F-40, rekord).
-- Allt beräknas från v_score (slag med tak par + 5). Läses av alla (security_invoker, samma regler som tabellerna).

-- Resultatfördelning per spelare och THT: eagle eller bättre … quint (par + 5, struket hål)
create or replace view public.v_stat_fordelning with (security_invoker = true) as
select s.tht_nr, s.artal, s.person_id, p.fornamn,
  count(distinct s.runda_id) as rundor,
  count(*) as hal,
  count(*) filter (where s.slag_tak - s.par <= -2) as eagle,
  count(*) filter (where s.slag_tak - s.par = -1) as birdie,
  count(*) filter (where s.slag_tak - s.par = 0) as par,
  count(*) filter (where s.slag_tak - s.par = 1) as bogey,
  count(*) filter (where s.slag_tak - s.par = 2) as dubbel,
  count(*) filter (where s.slag_tak - s.par = 3) as trippel,
  count(*) filter (where s.slag_tak - s.par = 4) as quad,
  count(*) filter (where s.slag_tak - s.par >= 5) as quint
from public.v_score s
join public.person p on p.id = s.person_id
where s.slag is not null
group by s.tht_nr, s.artal, s.person_id, p.fornamn;

-- Poäng och slag per hålpar (3/4/5) per spelare och THT
create or replace view public.v_stat_par with (security_invoker = true) as
select s.tht_nr, s.artal, s.person_id, p.fornamn, s.par,
  count(*) as hal, sum(s.poang) as poang, sum(s.slag_tak) as slag
from public.v_score s
join public.person p on p.id = s.person_id
where s.slag is not null
group by s.tht_nr, s.artal, s.person_id, p.fornamn, s.par;

-- Hålvinster på slag: lägst antal slag på hålet i deltävlingen (minst två spelare). Delad = flera med samma.
create or replace view public.v_stat_halvinst with (security_invoker = true) as
with h as (
  select s.deltavling_id, s.tht_nr, s.artal, s.hal_nr, s.person_id, s.slag_tak,
         min(s.slag_tak) over (partition by s.deltavling_id, s.hal_nr) as basta,
         count(*) over (partition by s.deltavling_id, s.hal_nr) as spelare
  from public.v_score s where s.slag is not null
), v as (
  select h.*, count(*) over (partition by h.deltavling_id, h.hal_nr) as vinnare
  from h where h.slag_tak = h.basta and h.spelare >= 2
)
select v.tht_nr, v.artal, v.person_id, p.fornamn,
  count(*) as alla, count(*) filter (where v.vinnare = 1) as ensamma
from v join public.person p on p.id = v.person_id
group by v.tht_nr, v.artal, v.person_id, p.fornamn;

-- Per runda: antal birdies eller bättre och längsta svit av hål på par eller bättre
create or replace view public.v_stat_runda with (security_invoker = true) as
with s as (
  select s.runda_id, s.hal_nr, (s.slag_tak <= s.par) as bra, (s.slag_tak < s.par) as birdie
  from public.v_score s where s.slag is not null
), b as (
  select runda_id, count(*) filter (where birdie) as birdies from s group by runda_id
), svit as (
  select runda_id, max(langd) as basta_svit from (
    select runda_id, count(*) as langd
    from (select runda_id, hal_nr, hal_nr - row_number() over (partition by runda_id order by hal_nr) as grp from s where bra) x
    group by runda_id, grp) y
  group by runda_id
)
select r.runda_id, r.deltavling_id, r.tht_nr, r.artal, r.ordning, r.person_id, r.fornamn,
  coalesce(b.birdies, 0) as birdies, coalesce(svit.basta_svit, 0) as basta_svit
from public.v_runda r
left join b on b.runda_id = r.runda_id
left join svit on svit.runda_id = r.runda_id
where r.antal_hal > 0;

-- Svåraste och lättaste hålen per bana (hål med samma nummer och par slås ihop över banversioner)
create or replace view public.v_stat_hal with (security_invoker = true) as
select bv.bana_id, b.namn as bana, s.hal_nr, s.par,
  count(*) as spelade,
  round(avg(s.slag_tak - s.par), 2) as over_par,
  round(avg(s.poang), 2) as poang
from public.v_score s
join public.deltavling d on d.id = s.deltavling_id
join public.banversion bv on bv.id = d.banversion_id
join public.bana b on b.id = bv.bana_id
where s.slag is not null
group by bv.bana_id, b.namn, s.hal_nr, s.par;

grant select on public.v_stat_fordelning, public.v_stat_par, public.v_stat_halvinst, public.v_stat_runda, public.v_stat_hal to anon, authenticated;
