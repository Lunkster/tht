-- 21b: Ta bort gamla kolumnen runda.kommentar (körs av Henrik i SQL Editor efter att 21 är körd).
-- Kontroll först – ska ge 0 (alla gamla kommentarer finns i tabellen kommentar):
select count(*) from public.runda r
where coalesce(btrim(r.kommentar), '') <> ''
  and not exists (select 1 from public.kommentar k where k.runda_id = r.id and k.text = btrim(r.kommentar));
-- Sedan:
alter table public.runda drop column kommentar;
