-- 16: Lindesberga GK (2025) är samma bana som Linde GK (2007, 2013) – heter Lindesbergs GK (beslut Henrik 2026-10-17).
update public.banversion set bana_id = 26 where id = 74;
update public.ban_betyg set bana_id = 26 where bana_id = 74;
update public.bana set namn = 'Lindesbergs GK' where id = 26;
update public.banversion set kommentar = 'Hette Linde GK' where id in (27, 43) and kommentar is null;
-- Den tomma banan 74 tas bort i 15b.
