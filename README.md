# THT golfapp

Webbapp för den årliga THT-tävlingen: resultatinmatning (live och i efterhand), statistik och bandata.

- **Databas:** Supabase-projektet `tht` (eu-north-1, ref `nlvgisjssbjethumvgdz`)
- **Frontend:** statisk webbapp på GitHub Pages (inte påbörjad)
- **Dokumentation:** Obsidian `Projekt/THT/` – [[THT golfapp]] och [[THT-krav]]

## Struktur

| Sökväg | Innehåll |
| --- | --- |
| `supabase/01_schema.sql` | Tabeller, index, Row Level Security |
| `supabase/02_vyer.sql` | Beräkningsvyer: `v_score`, `v_runda`, `v_tht_resultat`, `v_tht_kurva` |
| `migrering/migrera.py` | Engångsmigrering från gamla MySQL-dumpen (2025-01-06) |

## Principer
- Standard-Postgres, ingen logik som bara finns i Supabase → lätt att flytta.
- Poäng, eagle/birdie, hålvinster m.m. beräknas i vyer, lagras aldrig.
- Slag per hål har tak par + 5 (i vyerna). Vid lika poäng vinner lägst spel-HCP.
- `person_kontakt` (Golf-ID, adress, e-post, telefon) har RLS utan policies = bara admin.
