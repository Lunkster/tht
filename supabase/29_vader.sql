-- 29: Väder på deltävlingen (önskemål Henrik 2026-11-10, punkt 39).
-- Hämtas av edge-funktionen `vader` från Open-Meteo (historik ERA5, nyare dagar från prognos-API:t) för banans
-- koordinater och deltävlingens datum, timmarna 09–15 lokal tid. Sparas en gång per deltävling – det är extern
-- data, inte härledd ur databasen. Bara funktionen (service role) skriver; alla får läsa, som resultaten.
create table if not exists public.vader (
  deltavling_id integer primary key references public.deltavling(id) on delete cascade,
  datum         date not null,
  lat           double precision not null,
  lon           double precision not null,
  kalla         text not null check (kalla in ('arkiv', 'prognos')),   -- prognos = de senaste dagarna, hämtas om senare
  hamtad        timestamptz not null default now(),
  temp          numeric(4,1),   -- snitt 09–15, °C
  temp_min      numeric(4,1),
  temp_max      numeric(4,1),
  moln          smallint,       -- snitt molnighet, %
  vind          numeric(4,1),   -- snitt vindhastighet 10 m, m/s
  byar          numeric(4,1),   -- högsta byvind, m/s
  vindriktning  smallint,       -- medelriktning, grader (varifrån)
  nederbord     numeric(5,1),   -- summa 09–15, mm
  kod           smallint,       -- WMO-väderkod som sammanfattar dagen
  timmar        jsonb           -- [{ h, temp, kod, moln, vind, byar, riktning, nederbord }] för 09–15
);
alter table public.vader enable row level security;
create policy "alla kan läsa väder" on public.vader for select to anon, authenticated using (true);
grant select on public.vader to anon, authenticated;
