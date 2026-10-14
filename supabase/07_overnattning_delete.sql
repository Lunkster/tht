-- 07: övernattningar kan tas bort av inloggad (felinlagda rader, eller planer som ändrats).
create policy "inloggad kan ta bort" on public.overnattning for delete to authenticated using (true);
