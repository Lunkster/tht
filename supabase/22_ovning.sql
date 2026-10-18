-- 22: Övningsrunda / sandlåda (önskemål Henrik 2026-10-18, beslut: töms med en knapp för admin).
-- THT nr 0 "Övning" med en deltävling. Den är alltid öppen för markören och syns aldrig i statistiken:
-- v_score och v_runda filtrerar bort THT 0, och allt annat bygger på dem. v_runda_alla (med övningen)
-- används bara för ställningen när man matar in. Priser och banbetyg går inte att ange för övningen.

-- Grundvyerna med allt (även övningen) …
create or replace view public.v_score_alla with (security_invoker = true) as
SELECT s.runda_id, r.deltavling_id, d.tht_nr, t.artal, d.ordning, r.person_id, r.boll_nr, s.hal_nr, h.par, h.hcp_index, r.spel_hcp,
    floor(r.spel_hcp::numeric / 18.0)::integer + CASE WHEN h.hcp_index <= ((r.spel_hcp::integer % 18 + 18) % 18) THEN 1 ELSE 0 END AS extraslag,
    s.slag,
    LEAST(s.slag::integer, h.par + 5) AS slag_tak,
    s.puttar,
    CASE WHEN s.slag IS NULL THEN NULL::integer
         ELSE GREATEST(0, h.par + floor(r.spel_hcp::numeric / 18.0)::integer + CASE WHEN h.hcp_index <= ((r.spel_hcp::integer % 18 + 18) % 18) THEN 1 ELSE 0 END + 2 - s.slag) END AS poang,
    CASE WHEN s.slag IS NULL THEN NULL::text
         WHEN s.slag = 1 THEN 'hole in one'::text
         WHEN (LEAST(s.slag::integer, h.par + 5) - h.par) <= '-3'::integer THEN 'albatross'::text
         WHEN (LEAST(s.slag::integer, h.par + 5) - h.par) = '-2'::integer THEN 'eagle'::text
         WHEN (LEAST(s.slag::integer, h.par + 5) - h.par) = '-1'::integer THEN 'birdie'::text
         WHEN (LEAST(s.slag::integer, h.par + 5) - h.par) = 0 THEN 'par'::text
         WHEN (LEAST(s.slag::integer, h.par + 5) - h.par) = 1 THEN 'bogey'::text
         WHEN (LEAST(s.slag::integer, h.par + 5) - h.par) = 2 THEN 'dubbelbogey'::text
         WHEN (LEAST(s.slag::integer, h.par + 5) - h.par) = 3 THEN 'trippelbogey'::text
         ELSE 'kvadrupel+'::text END AS resultat,
    s.slag >= (h.par + 5) AS struket,
    s.puttar AS puttar_raknas
FROM public.score s
JOIN public.runda r ON r.id = s.runda_id
JOIN public.deltavling d ON d.id = r.deltavling_id
JOIN public.tht t ON t.nr = d.tht_nr
JOIN public.hal h ON h.banversion_id = d.banversion_id AND h.nr = s.hal_nr;

create or replace view public.v_runda_alla with (security_invoker = true) as
SELECT r.id AS runda_id, r.deltavling_id, d.tht_nr, t.artal, d.ordning, d.namn AS deltavling, r.person_id, p.fornamn, r.spel_hcp, r.boll_nr,
    count(vs.slag) AS antal_hal,
    sum(vs.slag_tak) AS slag,
    sum(vs.poang) AS poang,
    sum(vs.puttar_raknas) AS puttar,
    count(vs.puttar_raknas) AS hal_med_puttar,
    rank() OVER (PARTITION BY r.deltavling_id ORDER BY (sum(vs.poang)) DESC NULLS LAST, r.spel_hcp) AS placering,
    round(avg(vs.puttar_raknas), 2) AS puttar_per_hal
FROM public.runda r
JOIN public.deltavling d ON d.id = r.deltavling_id
JOIN public.tht t ON t.nr = d.tht_nr
JOIN public.person p ON p.id = r.person_id
LEFT JOIN public.v_score_alla vs ON vs.runda_id = r.id
GROUP BY r.id, d.id, t.artal, p.fornamn;

-- … och de vanliga utan övningen (samma kolumner, så alla beroende vyer fortsätter fungera)
create or replace view public.v_score with (security_invoker = true) as select * from public.v_score_alla where tht_nr <> 0;
create or replace view public.v_runda with (security_invoker = true) as select * from public.v_runda_alla where tht_nr <> 0;
grant select on public.v_score_alla, public.v_runda_alla to anon, authenticated;

-- Övnings-THT:n och dess deltävling (banan kan bytas under Admin → THT och deltävlingar → THT 0)
insert into public.tht (nr, artal, ort, klar) values (0, 0, 'Övning', false) on conflict (nr) do nothing;
insert into public.deltavling (tht_nr, ordning, namn, datum, banversion_id, tee_id)
select 0, 1, 'Övningsrunda', date '2000-01-01', d.banversion_id, d.tee_id
from public.deltavling d where d.tht_nr > 0 order by d.datum desc limit 1;

-- Markören får alltid mata in i övningen
create or replace function public.deltavling_oppen(did integer) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.deltavling d join public.tht t on t.nr = d.tht_nr
                       where d.id = did and (t.nr = 0 or (not t.klar and t.nr = (select max(nr) from public.tht)))) $$;

-- Inga priser eller banbetyg i övningen
create or replace function public.inte_ovning() returns trigger
  language plpgsql set search_path = ''
as $$
declare nr integer;
begin
  if tg_table_name = 'ban_betyg' then
    nr := (to_jsonb(new) ->> 'tht_nr')::integer;
  else
    select d.tht_nr into nr from public.deltavling d where d.id = (to_jsonb(new) ->> 'deltavling_id')::integer;
  end if;
  if nr = 0 then raise exception 'Övningsrundan har inga priser eller banbetyg'; end if;
  return new;
end $$;
create trigger inte_ovning before insert or update on public.pris for each row execute function public.inte_ovning();
create trigger inte_ovning before insert or update on public.ban_betyg for each row execute function public.inte_ovning();
