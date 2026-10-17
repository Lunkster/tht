-- 09: Golf-ID – inloggad (admin) får läsa och ändra person_kontakt. Anonyma ser fortfarande ingenting.
create policy "inloggad kan läsa" on public.person_kontakt for select to authenticated using (true);
create policy "inloggad kan skriva" on public.person_kontakt for insert to authenticated with check (true);
create policy "inloggad kan ändra" on public.person_kontakt for update to authenticated using (true) with check (true);
-- Banbetyg kan tas bort (tömt betyg i admin).
create policy "inloggad kan ta bort" on public.ban_betyg for delete to authenticated using (true);
