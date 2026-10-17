-- 13: Markör får ange banbetyg även för avslutade THT (önskemål Henrik 2026-10-17).
-- Övrigt i avslutade THT är fortfarande bara admins.
alter policy "markör kan skriva" on public.ban_betyg with check (public.ar_markor());
alter policy "markör kan ändra" on public.ban_betyg using (public.ar_markor()) with check (public.ar_markor());
alter policy "markör kan ta bort" on public.ban_betyg using (public.ar_markor());
