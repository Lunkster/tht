-- 06: identitetssekvenserna låg efter efter migreringen (bana: 73 mot max 76).
-- Ställ alla till max(id) så att nya rader från admin-sidorna inte krockar.
select setval(pg_get_serial_sequence('public.bana', 'id'),         (select max(id) from bana));
select setval(pg_get_serial_sequence('public.person', 'id'),       (select max(id) from person));
select setval(pg_get_serial_sequence('public.banversion', 'id'),   (select max(id) from banversion));
select setval(pg_get_serial_sequence('public.hal', 'id'),          (select max(id) from hal));
select setval(pg_get_serial_sequence('public.tee', 'id'),          (select max(id) from tee));
select setval(pg_get_serial_sequence('public.deltavling', 'id'),   (select max(id) from deltavling));
select setval(pg_get_serial_sequence('public.runda', 'id'),        (select max(id) from runda));
select setval(pg_get_serial_sequence('public.overnattning', 'id'), (select max(id) from overnattning));
