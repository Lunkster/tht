-- 21: Minnesvärda moment (önskemål Henrik 2026-10-18) – kommentarer i en egen tabell.
-- Flera per deltävling. Gäller hela deltävlingen (runda_id och boll_nr tomma), en boll (boll_nr)
-- eller en spelares runda (runda_id). Admin och markör får skriva, ändra och ta bort ALLTID –
-- även i avslutade THT (låset gäller slag och poäng, inte minnen). Alla får läsa.

create table public.kommentar (
  id            integer generated always as identity primary key,
  deltavling_id integer not null references public.deltavling (id) on delete cascade,
  runda_id      integer references public.runda (id) on delete cascade,
  boll_nr       integer,
  text          text not null check (length(btrim(text)) between 1 and 500),
  skapad        timestamptz not null default now(),
  andrad        timestamptz
);
comment on table public.kommentar is 'Minnesvärda moment: kommentarer för en deltävling, en boll eller en runda';
create index kommentar_deltavling_idx on public.kommentar (deltavling_id);
create index kommentar_runda_idx on public.kommentar (runda_id);

-- En rundkommentar hör alltid till rundans deltävling; bollen läses från rundan (kan bytas i efterhand)
create or replace function public.kommentar_synka() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if new.runda_id is not null then
    select r.deltavling_id into new.deltavling_id from public.runda r where r.id = new.runda_id;
    new.boll_nr := null;
  end if;
  if tg_op = 'UPDATE' then new.andrad := now(); new.skapad := old.skapad; end if;
  return new;
end $$;
create trigger kommentar_synka before insert or update on public.kommentar
  for each row execute function public.kommentar_synka();

alter table public.kommentar enable row level security;
create policy "alla kan läsa" on public.kommentar for select to anon, authenticated using (true);
create policy "admin och markör kan skriva" on public.kommentar for insert to authenticated with check (public.ar_admin() or public.ar_markor());
create policy "admin och markör kan ändra" on public.kommentar for update to authenticated using (public.ar_admin() or public.ar_markor()) with check (public.ar_admin() or public.ar_markor());
create policy "admin och markör kan ta bort" on public.kommentar for delete to authenticated using (public.ar_admin() or public.ar_markor());
grant select on public.kommentar to anon, authenticated;
grant insert, update, delete on public.kommentar to authenticated;

-- Flytta de gamla rundkommentarerna (runda.kommentar) – tidpunkt = deltävlingens datum
insert into public.kommentar (deltavling_id, runda_id, text, skapad)
select r.deltavling_id, r.id, btrim(r.kommentar), d.datum::timestamptz + interval '18 hours'
from public.runda r join public.deltavling d on d.id = r.deltavling_id
where coalesce(btrim(r.kommentar), '') <> ''
order by d.datum, r.id;
-- Kolumnen runda.kommentar används inte längre av appen. Henrik tar bort den med 21b_ta_bort_runda_kommentar.sql.
