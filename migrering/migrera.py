#!/usr/bin/env python3
"""
Migrerar THT-historiken från MySQL-dumpen (Dump20250106.sql) till Supabase-schemat v1.
Skriver SQL-filer i ut/ som körs i ordning (01_grunddata.sql, 02_rundor.sql, 03_score_*.sql).

    python3 migrera.py <sökväg till Dump20250106.sql>

Regler:
- Gamla id:n behålls (THTnr, PID, BID, DID, RID).
- Hal.Skapad blir en banversion. Deltävlingen kopplas till senaste version som skapats
  senast 60 dagar efter speldatum, annars tidigaste versionen.
- Tee-namn normaliseras till gemener. Hållängder kopplas till tee:n i första deltävlingen
  som spelat banversionen (annars "gul").
- Puttar: om en runda bara har 0/NULL i puttar räknas de som ej registrerade (NULL).
- Score utan matchande runda hoppas över och rapporteras.
- Koordinater: WGS84 om det finns, annars omräknat från SWEREF99 TM.

Manuella justeringar vid körningen 2026-10-07 (gjorda direkt i SQL, inte i skriptet):
- Person 99 finns i Runda men inte i Personer -> skapad som "Gäst" (inaktiv).
- Övernattning 35 pekade på THTnr 27 som inte finns -> satt till 31 (Praia Del Rey 2024).
- BanBetyg-dubbletter (samma THT/bana/person) -> första värdet behålls.
"""
import math, os, re, sys
from collections import defaultdict
from datetime import date, timedelta

DUMP = sys.argv[1] if len(sys.argv) > 1 else "Dump20250106.sql"
UT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ut")
s = open(DUMP, encoding="utf-8", errors="replace").read()


def rows(t):
    body = " ".join(m.group(1) for m in re.finditer(r"INSERT INTO `%s` VALUES (.*?);\n" % t, s, re.S))
    out = []
    for r in re.findall(r"\(((?:'(?:[^'\\]|\\.)*'|[^()'])*)\)", body):
        vals = []
        for a, b, c in re.findall(r"'((?:[^'\\]|\\.)*)'|(NULL)|([^,]+)", r):
            vals.append(None if b else (c.strip() if c else a.replace("\\'", "'")))
        out.append(vals)
    return out


def q(v):
    if v is None or v == "":
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def i(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def sweref_till_wgs84(n, e):
    """SWEREF99 TM -> WGS84 (Gauss-Krüger, Lantmäteriets formler)."""
    a, fl = 6378137.0, 1 / 298.257222101
    k0, lon0, fn, fe = 0.9996, math.radians(15.0), 0.0, 500000.0
    e2 = fl * (2 - fl); nn = fl / (2 - fl)
    ah = a / (1 + nn) * (1 + nn ** 2 / 4 + nn ** 4 / 64)
    d1 = nn / 2 - 2 * nn ** 2 / 3 + 37 * nn ** 3 / 96 - nn ** 4 / 360
    d2 = nn ** 2 / 48 + nn ** 3 / 15 - 437 * nn ** 4 / 1440
    d3 = 17 * nn ** 3 / 480 - 37 * nn ** 4 / 840
    d4 = 4397 * nn ** 4 / 161280
    xi = (n - fn) / (k0 * ah); eta = (e - fe) / (k0 * ah)
    xp = xi - d1 * math.sin(2 * xi) * math.cosh(2 * eta) - d2 * math.sin(4 * xi) * math.cosh(4 * eta) \
        - d3 * math.sin(6 * xi) * math.cosh(6 * eta) - d4 * math.sin(8 * xi) * math.cosh(8 * eta)
    ep = eta - d1 * math.cos(2 * xi) * math.sinh(2 * eta) - d2 * math.cos(4 * xi) * math.sinh(4 * eta) \
        - d3 * math.cos(6 * xi) * math.sinh(6 * eta) - d4 * math.cos(8 * xi) * math.sinh(8 * eta)
    phis = math.asin(math.sin(xp) / math.cosh(ep))
    dl = math.atan(math.sinh(ep) / math.cos(xp))
    A = e2 + e2 ** 2 + e2 ** 3 + e2 ** 4
    B = -(7 * e2 ** 2 + 17 * e2 ** 3 + 30 * e2 ** 4) / 6
    C = (224 * e2 ** 3 + 889 * e2 ** 4) / 120
    D = -(4279 * e2 ** 4) / 1260
    sp = math.sin(phis)
    phi = phis + sp * math.cos(phis) * (A + B * sp ** 2 + C * sp ** 4 + D * sp ** 6)
    return round(math.degrees(phi), 6), round(math.degrees(lon0 + dl), 6)


def main():
    os.makedirs(UT, exist_ok=True)
    rapport = []
    g = []  # grunddata-sql

    tht = rows("THT")
    g.append("insert into tht (nr, artal, ort) values\n" +
             ",\n".join(f"({i(r[0])}, {i(r[1])}, {q(r[2])})" for r in tht) + ";")

    pers = rows("Personer")
    g.append("insert into person (id, fornamn, efternamn, hcp) overriding system value values\n" +
             ",\n".join(f"({i(r[0])}, {q(r[1])}, {q(r[2])}, {q(f(r[4]))})" for r in pers) + ";")
    g.append("insert into person_kontakt (person_id, golf_id, adress, epost, telefon) values\n" +
             ",\n".join(f"({i(r[0])}, {q(r[3])}, {q(r[5])}, {q(r[6])}, {q(r[7])})" for r in pers) + ";")

    banor = rows("Bana")
    bv = []
    for r in banor:
        lat, lon = f(r[7]), f(r[8])
        if (not lat) and i(r[5]):
            lat, lon = sweref_till_wgs84(i(r[5]), i(r[6]))
        slope = f(r[2]) or None
        bv.append(f"({i(r[0])}, {q(r[1])}, {q(slope)}, {q(r[3] == '1')}, {q(r[4] == '1')}, {q(lat)}, {q(lon)})")
    g.append("insert into bana (id, namn, slope, restaurang, rattigheter, lat, lon) overriding system value values\n" +
             ",\n".join(bv) + ";")

    # banversioner
    hal = rows("Hal")
    # ofullständiga versioner (håldata inmatad över flera datum) slås ihop till senaste datum
    per_bana = defaultdict(lambda: defaultdict(set))
    for r in hal:
        per_bana[r[1]][r[6]].add(r[2])
    for b, dd in per_bana.items():
        if any(len(x) < 18 for x in dd.values()):
            senast = max(dd)
            for r in hal:
                if r[1] == b:
                    r[6] = senast
            rapport.append(f"Bana {b}: håldata från {sorted(dd)} sammanslagen till en version ({senast})")
    versioner = defaultdict(set)
    for r in hal:
        versioner[i(r[1])].add(r[6])
    dv = rows("Deltavling")
    for r in dv:  # banor utan hål (t.ex. Lagans GK id 61) får en tom version
        b = i(r[1])
        if b not in versioner:
            versioner[b].add(r[6])
            rapport.append(f"Bana {b} saknar håldata – tom banversion skapad (deltävling {r[0]} får inga poäng)")
    vid = {}
    n = 0
    vrader = []
    for b in sorted(versioner):
        for d in sorted(versioner[b]):
            n += 1
            vid[(b, d)] = n
            vrader.append(f"({n}, {b}, {q(d)})")
    g.append("insert into banversion (id, bana_id, giltig_fran) overriding system value values\n" + ",\n".join(vrader) + ";")

    def version_for(b, datum):
        ds = sorted(versioner[b])
        dd = date.fromisoformat(datum)
        ok = [d for d in ds if date.fromisoformat(d) <= dd + timedelta(days=60)]
        return vid[(b, ok[-1] if ok else ds[0])]

    # tee per deltävling, och vilken tee hållängderna hör till
    tee_id = {}
    tee_rader = []
    dv_tee = {}
    forsta_tee = {}
    for r in sorted(dv, key=lambda r: r[6]):
        v = version_for(i(r[1]), r[6])
        namn = (r[2] or "gul").strip().lower()
        if (v, namn) not in tee_id:
            tee_id[(v, namn)] = len(tee_id) + 1
            tee_rader.append(f"({tee_id[(v, namn)]}, {v}, {q(namn)})")
        dv_tee[r[0]] = (v, tee_id[(v, namn)])
        forsta_tee.setdefault(v, tee_id[(v, namn)])
    for v in set(vid.values()) - set(forsta_tee):
        tee_id[(v, "gul")] = len(tee_id) + 1
        tee_rader.append(f"({tee_id[(v, 'gul')]}, {v}, 'gul')")
        forsta_tee[v] = tee_id[(v, "gul")]
    g.append("insert into tee (id, banversion_id, namn) overriding system value values\n" + ",\n".join(tee_rader) + ";")

    # hål och längder kompakt: en rad per banversion med arrayer (index = hålnummer)
    hv = defaultdict(dict)
    for r in hal:
        hv[vid[(i(r[1]), r[6])]][i(r[2])] = (i(r[3]), i(r[4]), i(r[5]))
    arr = lambda d, k: "'{" + ",".join("NULL" if d.get(n) is None or not d[n][k] else str(d[n][k]) for n in range(1, 19)) + "}'"
    hrader = [f"({v},{arr(d, 0)},{arr(d, 1)},{forsta_tee[v]},{arr(d, 2)})" for v, d in sorted(hv.items())]
    g.append("create temp table _hal (v int, p text, x text, t int, l text);\n"
             "insert into _hal values\n" + ",\n".join(hrader) + ";\n"
             "insert into hal (banversion_id, nr, par, hcp_index)\n"
             "  select v, n, (p::int[])[n], (x::int[])[n] from _hal, generate_series(1, 18) n where (p::int[])[n] is not null;\n"
             "insert into hal_langd (hal_id, tee_id, langd)\n"
             "  select h.id, _hal.t, (l::int[])[h.nr] from _hal join hal h on h.banversion_id = _hal.v\n"
             "  where (l::int[])[h.nr] is not null;\n"
             "drop table _hal;")
    hrader = hal

    drader = []
    for r in dv:
        v, t = dv_tee[r[0]]
        drader.append(f"({i(r[0])}, {i(r[3])}, {v}, {t}, {i(r[4])}, {q(r[5].strip())}, {q(r[6])}, "
                      f"{q(i(r[7]) if 1 <= (i(r[7]) or 0) <= 18 else None)}, {q(i(r[8]) if 1 <= (i(r[8]) or 0) <= 18 else None)})")
    g.append("insert into deltavling (id, tht_nr, banversion_id, tee_id, ordning, namn, datum, narmast_hal, longest_hal) "
             "overriding system value values\n" + ",\n".join(drader) + ";")

    pr = []
    for typ, t in (("narmast", "NarmastHal"), ("longest", "LongestDrive")):
        for r in rows(t):
            if i(r[1]):
                pr.append(f"({i(r[0])}, '{typ}', {i(r[1])})")
    g.append("insert into pris (deltavling_id, typ, person_id) values\n" + ",\n".join(pr) + "\non conflict do nothing;")

    bb = [f"({i(r[1])}, {i(r[2])}, {i(r[3])}, {q(f(r[4]))})" for r in rows("BanBetyg")
          if i(r[1]) and i(r[2]) and i(r[3]) and f(r[4]) is not None]
    g.append("insert into ban_betyg (tht_nr, bana_id, person_id, betyg) values\n" + ",\n".join(bb) + "\non conflict do nothing;")

    ov = []
    for r in rows("Overnattningar"):
        lat, lon = f(r[7]), f(r[8])
        if not lat and i(r[2]):
            lat, lon = sweref_till_wgs84(i(r[2]), i(r[3]))
        ov.append(f"({i(r[0])}, {i(r[1])}, {q(r[5])}, {q(i(r[4]))}, {q(r[6])}, {q(lat)}, {q(lon)})")
    g.append("insert into overnattning (id, tht_nr, platsnamn, antal_natter, organisator, lat, lon) overriding system value values\n"
             + ",\n".join(ov) + ";")
    open(os.path.join(UT, "01_grunddata.sql"), "w").write("\n\n".join(g) + "\n")

    # rundor
    ru = rows("Runda")
    rid = {}
    rr = []
    for r in ru:
        rid[(r[0], r[1])] = i(r[3])
        rr.append(f"({i(r[3])}, {i(r[0])}, {i(r[1])}, {i(r[2])}, {q(i(r[5]))}, {q((r[4] or '').strip() or None)})")
    open(os.path.join(UT, "02_rundor.sql"), "w").write(
        "insert into runda (id, deltavling_id, person_id, spel_hcp, boll_nr, kommentar) overriding system value values\n"
        + ",\n".join(rr) + ";\n")

    # score – kompakt: en rad per runda med arrayer
    per = defaultdict(dict)
    gamla_poang = {}
    for r in rows("Score"):
        k = (r[0], r[1])
        if k not in rid:
            rapport.append(f"Score utan runda hoppas över: DID={r[0]} PID={r[1]} hål={r[2]}")
            continue
        per[rid[k]][i(r[2])] = (i(r[3]), i(r[5]))
        gamla_poang[(rid[k], i(r[2]))] = i(r[4])
    vals = []
    for runda, h in sorted(per.items()):
        if all(not p for _, p in h.values()):
            h = {k: (sl, None) for k, (sl, _) in h.items()}
        sl = ",".join("NULL" if h.get(n, (None,))[0] is None else str(h[n][0]) for n in range(1, 19))
        pu = ",".join("NULL" if h.get(n, (None, None))[1] is None else str(h[n][1]) for n in range(1, 19))
        pu = "null" if set(pu.split(",")) == {"NULL"} else f"'{{{pu}}}'"
        vals.append(f"({runda},'{{{sl}}}',{pu})")
    for k in range(0, len(vals), 220):
        open(os.path.join(UT, f"03_score_{k // 220 + 1}.sql"), "w").write(
            "insert into score (runda_id, hal_nr, slag, puttar)\n"
            "select v.r, n, (v.s::int[])[n], (v.p::int[])[n] from (values\n" + ",\n".join(vals[k:k + 220]) +
            "\n) v(r, s, p), generate_series(1, 18) n\nwhere (v.s::int[])[n] is not null or (v.p::int[])[n] is not null;\n")
    # gamla lagrade poäng, för kontroll mot de beräknade
    gp = [f"({r},{h},{p})" for (r, h), p in gamla_poang.items() if p is not None]
    open(os.path.join(UT, "kontroll_gamla_poang.csv"), "w").write("runda_id,hal_nr,poang\n" +
                                                                  "\n".join(x[1:-1] for x in gp) + "\n")
    open(os.path.join(UT, "rapport.txt"), "w").write("\n".join(rapport) + "\n")
    print(f"Klart: {len(tht)} THT, {len(pers)} personer, {len(banor)} banor, {len(vid)} banversioner, "
          f"{len(hrader)} hål, {len(dv)} deltävlingar, {len(rr)} rundor, {len(vals)} rundor med score")
    print("\n".join(rapport[:20]))


if __name__ == "__main__":
    main()
