-- 30: Spela quiz i telefonen (önskemål Henrik 2026-11-10, punkt 41). Quizen visas på tv:n, alla svarar i sin telefon
-- och resultaten sparas per person. Beslut Henrik 2026-11-10:
--  * Spelare väljer sitt namn och värden (admin) godkänner första gången; telefonen kommer sedan ihåg personen.
--    Den personliga länken fungerar som reserv och går med direkt.
--  * Gäster skriver sitt namn, godkänns likadant, och deras resultat sparas (kan kopplas till en spelare i efterhand).
--  * Bara admin startar och styr en omgång.
-- Säkerhet: telefonerna når bara funktionerna nedan (security definer), som kontrollerar spelkod och telefonens
-- hemliga nyckel. Rätt svar skickas inte till telefonen förrän frågan är slut, och svarstid och poäng räknas här.

-- En omgång av en sparad quiz. fragor är en ögonblicksbild med blandade alternativ: [{ fraga, alt: [..], ratt, info }]
create table public.quiz_spel (
  id          serial primary key,
  quiz_id     integer references public.quiz(id) on delete set null,
  namn        text not null,
  kod         text not null,                      -- sexsiffrig spelkod
  status      text not null default 'lobby' check (status in ('lobby', 'fraga', 'svar', 'slut')),
  fraga_nr    integer not null default -1,         -- aktuell fråga (0-baserad), -1 före start
  fraga_start timestamptz,
  tid_s       smallint not null default 20 check (tid_s between 5 and 120),
  fragor      jsonb not null,
  skapad      timestamptz not null default now(),
  avslutad    timestamptz
);
create unique index quiz_spel_aktiv_kod on public.quiz_spel (kod) where status <> 'slut';

-- En telefon som spelat: hemlig nyckel som telefonen sparar. betrodd = godkänd för personen/namnet en gång,
-- och går därefter med direkt.
create table public.quiz_enhet (
  nyckel     text primary key,
  person_id  integer references public.person(id) on delete cascade,
  gast_namn  text,
  betrodd    boolean not null default false,
  skapad     timestamptz not null default now(),
  senast     timestamptz not null default now(),
  check ((person_id is null) <> (gast_namn is null))
);

-- Deltagare i en omgång. En godkänd rad per person och omgång; väntande förfrågningar är egna rader tills admin
-- godkänner (då flyttas telefonen till personens rad) eller nekar.
create table public.quiz_deltagare (
  id         serial primary key,
  spel_id    integer not null references public.quiz_spel(id) on delete cascade,
  person_id  integer references public.person(id) on delete set null,
  gast_namn  text,
  enhet      text not null references public.quiz_enhet(nyckel) on delete cascade,
  godkand    boolean not null default false,
  skapad     timestamptz not null default now(),
  check (person_id is not null or gast_namn is not null)
);
create unique index quiz_deltagare_en_per_person on public.quiz_deltagare (spel_id, person_id) where godkand and person_id is not null;

create table public.quiz_svar (
  deltagare_id integer not null references public.quiz_deltagare(id) on delete cascade,
  fraga_nr     integer not null,
  svar         smallint not null,
  ratt         boolean not null,
  ms           integer not null,
  poang        integer not null,
  primary key (deltagare_id, fraga_nr)
);

alter table public.quiz_spel enable row level security;
alter table public.quiz_enhet enable row level security;
alter table public.quiz_deltagare enable row level security;
alter table public.quiz_svar enable row level security;
create policy "admin allt" on public.quiz_spel for all to authenticated using (public.ar_admin()) with check (public.ar_admin());
create policy "admin allt" on public.quiz_enhet for all to authenticated using (public.ar_admin()) with check (public.ar_admin());
create policy "admin allt" on public.quiz_deltagare for all to authenticated using (public.ar_admin()) with check (public.ar_admin());
create policy "admin allt" on public.quiz_svar for all to authenticated using (public.ar_admin()) with check (public.ar_admin());
grant select, insert, update, delete on public.quiz_spel, public.quiz_enhet, public.quiz_deltagare, public.quiz_svar to authenticated;
grant usage on sequence public.quiz_spel_id_seq, public.quiz_deltagare_id_seq to authenticated;

-- ---------- telefonen ----------

-- Gå med. Med p_lank (personliga länken) eller en betrodd p_enhet går man med direkt; annars väntar man på admin.
-- p_person_id = vald spelare, p_gast_namn = gäst. Returnerar { enhet, deltagare_id, godkand, namn }.
create or replace function public.quiz_ga_med(p_kod text, p_enhet text, p_person_id integer, p_gast_namn text, p_lank text)
  returns json language plpgsql security definer set search_path = '' as $$
declare
  s public.quiz_spel; e public.quiz_enhet; pid integer; gast text; nyckel text; d public.quiz_deltagare; finns public.quiz_deltagare; direkt boolean := false;
begin
  select * into s from public.quiz_spel qs where qs.kod = p_kod and qs.status <> 'slut';
  if s.id is null then raise exception 'Ingen pågående quiz med den koden'; end if;
  gast := nullif(left(trim(coalesce(p_gast_namn, '')), 30), '');
  if p_lank is not null and p_lank <> '' then
    select l.person_id into pid from public.spelar_lank l where l.kod = p_lank;
    if pid is null then raise exception 'Den personliga länken finns inte'; end if;
    direkt := true; gast := null;
  elsif p_person_id is not null then
    select p.id into pid from public.person p where p.id = p_person_id and p.aktiv; gast := null;
    if pid is null then raise exception 'Spelaren finns inte'; end if;
  elsif gast is null then raise exception 'Välj ditt namn eller skriv ett gästnamn';
  end if;
  -- Telefonens nyckel: återanvänd om den gäller samma person/gäst, annars en ny
  if p_enhet is not null then select * into e from public.quiz_enhet qe where qe.nyckel = p_enhet; end if;
  if e.nyckel is not null and ((pid is not null and e.person_id = pid) or (pid is null and e.gast_namn = gast)) then
    nyckel := e.nyckel; direkt := direkt or e.betrodd;
    update public.quiz_enhet qe set senast = now(), betrodd = qe.betrodd or direkt where qe.nyckel = e.nyckel;
  else
    nyckel := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into public.quiz_enhet (nyckel, person_id, gast_namn, betrodd) values (nyckel, pid, case when pid is null then gast end, direkt);
  end if;
  -- Redan med i omgången från den här telefonen?
  select * into d from public.quiz_deltagare qd where qd.spel_id = s.id and qd.enhet = nyckel order by qd.godkand desc, qd.id limit 1;
  if d.id is null then
    if (select count(*) from public.quiz_deltagare qd where qd.spel_id = s.id and not qd.godkand) >= 30 then raise exception 'För många väntande – be värden godkänna först'; end if;
    insert into public.quiz_deltagare (spel_id, person_id, gast_namn, enhet, godkand) values (s.id, pid, case when pid is null then gast end, nyckel, false) returning * into d;
  end if;
  if direkt and not d.godkand then
    -- Personen har redan en godkänd plats (t.ex. från en annan telefon): flytta platsen hit
    select * into finns from public.quiz_deltagare qd where qd.spel_id = s.id and qd.person_id = pid and qd.godkand and pid is not null;
    if finns.id is not null then
      update public.quiz_deltagare qd set enhet = nyckel where qd.id = finns.id;
      delete from public.quiz_deltagare qd where qd.id = d.id; d := finns;
    else
      update public.quiz_deltagare qd set godkand = true where qd.id = d.id; d.godkand := true;
    end if;
  end if;
  return json_build_object('enhet', nyckel, 'deltagare_id', d.id, 'godkand', d.godkand,
    'namn', coalesce((select p.fornamn from public.person p where p.id = pid), gast));
end $$;

-- Läget för telefonen: frågan utan rätt svar medan den pågår; rätt svar, eget svar och poäng när den är slut.
create or replace function public.quiz_lage(p_kod text, p_enhet text)
  returns json language plpgsql stable security definer set search_path = '' as $$
declare s public.quiz_spel; d public.quiz_deltagare; f jsonb; mitt public.quiz_svar; tot integer; plac integer; antal integer;
begin
  select * into s from public.quiz_spel qs where qs.kod = p_kod order by qs.id desc limit 1;
  if s.id is null then return json_build_object('status', 'saknas'); end if;
  select * into d from public.quiz_deltagare qd where qd.spel_id = s.id and qd.enhet = p_enhet order by qd.godkand desc, qd.id limit 1;
  if d.id is null then return json_build_object('status', 'ej_med'); end if;
  if not d.godkand then return json_build_object('status', 'vantar', 'namn', s.namn); end if;
  -- Ställning: summa poäng per godkänd deltagare
  with st as (select qd.id, coalesce(sum(x.poang), 0) as p from public.quiz_deltagare qd left join public.quiz_svar x on x.deltagare_id = qd.id
              where qd.spel_id = s.id and qd.godkand group by qd.id)
  select st.p, (select count(*) + 1 from st s2 where s2.p > st.p), (select count(*) from st) into tot, plac, antal from st where st.id = d.id;
  f := case when s.fraga_nr >= 0 then s.fragor -> s.fraga_nr end;
  select * into mitt from public.quiz_svar x where x.deltagare_id = d.id and x.fraga_nr = s.fraga_nr;
  return json_build_object('status', s.status, 'namn', s.namn, 'fraga_nr', s.fraga_nr, 'antal_fragor', jsonb_array_length(s.fragor),
    'fraga', f -> 'fraga', 'alt', f -> 'alt', 'tid_s', s.tid_s,
    'kvar_ms', case when s.status = 'fraga' then greatest(0, s.tid_s * 1000 - (extract(epoch from now() - s.fraga_start) * 1000)::int) end,
    'mitt_svar', mitt.svar, 'ratt', case when s.status in ('svar', 'slut') then (f ->> 'ratt')::int end,
    'poang', case when s.status in ('svar', 'slut') then mitt.poang end,
    'totalt', tot, 'placering', plac, 'deltagare', antal);
end $$;

-- Svara på aktuell fråga. Tiden räknas från när frågan visades på tv:n (en sekunds marginal för nätet).
-- Rätt svar ger 500–1 000 poäng beroende på hur snabbt, fel svar 0.
create or replace function public.quiz_svara(p_kod text, p_enhet text, p_fraga_nr integer, p_svar integer)
  returns json language plpgsql security definer set search_path = '' as $$
declare s public.quiz_spel; d public.quiz_deltagare; ms integer; r boolean; p integer;
begin
  select * into s from public.quiz_spel qs where qs.kod = p_kod and qs.status = 'fraga';
  if s.id is null or s.fraga_nr <> p_fraga_nr then raise exception 'Frågan är redan slut'; end if;
  select * into d from public.quiz_deltagare qd where qd.spel_id = s.id and qd.enhet = p_enhet and qd.godkand;
  if d.id is null then raise exception 'Du är inte med i quizen'; end if;
  ms := (extract(epoch from now() - s.fraga_start) * 1000)::int;
  if ms > s.tid_s * 1000 + 1000 then raise exception 'Tiden är ute'; end if;
  ms := least(greatest(ms, 0), s.tid_s * 1000);
  r := p_svar = ((s.fragor -> s.fraga_nr) ->> 'ratt')::int;
  p := case when r then round(1000 - 500.0 * ms / (s.tid_s * 1000)) else 0 end;
  insert into public.quiz_svar (deltagare_id, fraga_nr, svar, ratt, ms, poang) values (d.id, p_fraga_nr, p_svar, r, ms, p)
    on conflict do nothing;
  return json_build_object('ok', true);
end $$;

-- Spelare att välja bland när man går med (bara aktiva, bara förnamn)
create or replace function public.quiz_spelare(p_kod text)
  returns json language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.quiz_spel qs where qs.kod = p_kod and qs.status <> 'slut')
    then (select coalesce(json_agg(json_build_object('id', p.id, 'fornamn', p.fornamn) order by p.fornamn), '[]'::json) from public.person p where p.aktiv)
  end
$$;

-- ---------- tv:n (admin) ----------

-- Byt läge: fraga (nästa fråga, tiden startar nu), svar (visa rätt svar), slut. Tiden sätts av databasen.
create or replace function public.quiz_styr(p_spel_id integer, p_status text, p_fraga_nr integer)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.ar_admin() then raise exception 'Bara admin'; end if;
  update public.quiz_spel qs set status = p_status, fraga_nr = p_fraga_nr,
    fraga_start = case when p_status = 'fraga' then now() else qs.fraga_start end,
    avslutad = case when p_status = 'slut' then now() end
  where qs.id = p_spel_id;
end $$;

-- Godkänn eller neka en väntande deltagare. Godkänd telefon blir betrodd för personen/gästen.
create or replace function public.quiz_godkann(p_deltagare_id integer, p_ja boolean)
  returns void language plpgsql security definer set search_path = '' as $$
declare d public.quiz_deltagare; finns public.quiz_deltagare;
begin
  if not public.ar_admin() then raise exception 'Bara admin'; end if;
  select * into d from public.quiz_deltagare qd where qd.id = p_deltagare_id and not qd.godkand;
  if d.id is null then return; end if;
  if not p_ja then delete from public.quiz_deltagare qd where qd.id = d.id; return; end if;
  update public.quiz_enhet qe set betrodd = true where qe.nyckel = d.enhet;
  select * into finns from public.quiz_deltagare qd where qd.spel_id = d.spel_id and qd.person_id = d.person_id and qd.godkand and d.person_id is not null;
  if finns.id is not null then
    update public.quiz_deltagare qd set enhet = d.enhet where qd.id = finns.id;   -- ny telefon tar över platsen
    delete from public.quiz_deltagare qd where qd.id = d.id;
  else
    update public.quiz_deltagare qd set godkand = true where qd.id = d.id;
  end if;
end $$;

revoke all on function public.quiz_ga_med, public.quiz_lage, public.quiz_svara, public.quiz_spelare, public.quiz_styr, public.quiz_godkann from public;
grant execute on function public.quiz_ga_med, public.quiz_lage, public.quiz_svara, public.quiz_spelare to anon, authenticated;
grant execute on function public.quiz_styr, public.quiz_godkann to authenticated;

-- ---------- resultat (öppna, som övrig statistik) ----------
-- Slutresultat per avslutad omgång: poäng, rätt svar och placering per deltagare.
create or replace function public.quiz_resultat()
  returns table (spel_id integer, namn text, datum date, antal_fragor integer, deltagare_id integer, person_id integer,
                 gast_namn text, fornamn text, poang integer, ratt integer, svarade integer, placering integer, antal_deltagare integer)
  language sql stable security definer set search_path = '' as $$
  with r as (
    select s.id as spel_id, s.namn, (s.avslutad at time zone 'Europe/Stockholm')::date as datum, jsonb_array_length(s.fragor) as antal_fragor,
           d.id as deltagare_id, d.person_id, d.gast_namn, p.fornamn,
           coalesce(sum(q.poang), 0)::int as poang, count(*) filter (where q.ratt)::int as ratt, count(q.fraga_nr)::int as svarade
    from public.quiz_spel s
    join public.quiz_deltagare d on d.spel_id = s.id and d.godkand
    left join public.person p on p.id = d.person_id
    left join public.quiz_svar q on q.deltagare_id = d.id
    where s.status = 'slut'
    group by s.id, d.id, p.fornamn)
  select r.*, (rank() over (partition by r.spel_id order by r.poang desc))::int, (count(*) over (partition by r.spel_id))::int from r
  order by r.datum desc, r.spel_id desc, r.poang desc
$$;
grant execute on function public.quiz_resultat() to anon, authenticated;
