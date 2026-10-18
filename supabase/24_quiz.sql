-- 24: Quiz och flashcards (önskemål Henrik 2026-10-18). Bara admin läser och skriver.
-- Frågorna sparas som en ögonblicksbild (jsonb) när quizen skapas – ändras inte om statistiken ändras.
-- fragor = [{ "fraga": text, "svar": text, "fel": [text, …] (0–3, tomt = bara flashcard),
--             "info": text (förklaring efter svaret), "amne": text, "egen": bool }, …]
create table public.quiz (
  id      integer generated always as identity primary key,
  namn    text not null check (length(btrim(namn)) between 1 and 100),
  fragor  jsonb not null default '[]'::jsonb check (jsonb_typeof(fragor) = 'array'),
  skapad  timestamptz not null default now(),
  andrad  timestamptz not null default now()
);
comment on table public.quiz is 'Sparade quiz/flashcards (admin)';
alter table public.quiz enable row level security;
create policy "admin kan läsa" on public.quiz for select to authenticated using (public.ar_admin());
create policy "admin kan skriva" on public.quiz for insert to authenticated with check (public.ar_admin());
create policy "admin kan ändra" on public.quiz for update to authenticated using (public.ar_admin()) with check (public.ar_admin());
create policy "admin kan ta bort" on public.quiz for delete to authenticated using (public.ar_admin());
grant select, insert, update, delete on public.quiz to authenticated;
