-- 10b: Kolumner som inte används längre (beslut Henrik 2026-10-17).
-- Värdena sparade först i ~/Dokument/Claude/THT/backup/borttagna-kolumner-2026-10-17.sql
-- Körs av Henrik i Supabase SQL Editor (borttagning kräver bekräftelse).
alter table public.person drop column if exists hcp;
alter table public.person_kontakt drop column if exists adress, drop column if exists telefon;
