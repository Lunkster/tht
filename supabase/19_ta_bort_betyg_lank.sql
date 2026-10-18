-- 19: Gamla tabellen betyg_lank (länk per spelare och THT, v0.19.0) ersattes av spelar_lank i migrering 15
-- och används inte längre. Körs av Henrik i Supabase SQL Editor (borttagning kräver bekräftelse).
drop table if exists public.betyg_lank;
