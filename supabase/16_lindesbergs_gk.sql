-- 16: Lindesberga GK (2025) är samma bana som Linde GK (2007, 2013) – heter Lindesbergs GK (beslut Henrik 2026-10-17).
update public.banversion set bana_id = 26 where id = 74;
update public.ban_betyg set bana_id = 26 where bana_id = 74;
update public.bana set namn = 'Lindesbergs GK' where id = 26;
update public.banversion set kommentar = 'Hette Linde GK' where id in (27, 43) and kommentar is null;
-- Den tomma banan 74 tas bort i 15b.

-- 16b: Lagans GK 1999 R5 pekade fortfarande på teen i den tomma versionen 62 – kopplad till version 4:s tee (gul).
update public.deltavling set tee_id = 4 where id = 26 and tee_id = 7;
