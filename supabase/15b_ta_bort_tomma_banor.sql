-- 15b: Ta bort de tomma dubblettbanorna efter sammanslagningen i 15 och 16 (körs av Henrik i SQL Editor).
-- Kontroll först – ska ge 0:
select count(*) from public.deltavling d join public.banversion bv on bv.id = d.banversion_id where bv.bana_id in (70, 40, 76, 61, 74);
-- Sedan (tar även bort den tomma versionen 62 och dess tee):
delete from public.bana where id in (70, 40, 76, 61, 74);
