# Tester

Webbläsartester med [Playwright](https://playwright.dev). Supabase ersätts av attrapper (`page.route`), så testerna rör aldrig den riktiga databasen.

## Köra

```bash
cd ~/Dokument/Claude/THT/kod/tht/tests
npm init -y >/dev/null && npm i -D playwright && npx playwright install chromium   # en gång
cd .. && python3 -m http.server 8765 &                                          # appen på localhost:8765
cd tests && ./kor-alla.sh
```

Varje test skriver ut vad det ser och sparar skärmbilder (`*.png`) i mappen. `kor-alla.sh` räknar fel (sidfel, timeout) per test – `0` överallt = grönt.

| Test | Vad |
| --- | --- |
| `parse.test.mjs` | Inklistrade scorekort (`banparse.js`) – körs med bara Node |
| `backup.test.mjs` | Backupens SQL (`byggBackup`) – skriver en fil att läsa in i en tom Postgres |
| `foton.mjs`, `karusell.mjs` | Låsning med visningskoden (anon ser låsruta, läsare ser allt), foton (krympning, EXIF-datum → deltävling, uppladdning via länk och som markör, flytta till annan runda/THT, ta bort, galleri på år/deltävling/Minnen) och karusellen på tv:n |
| övriga `*.mjs` | Sidorna: start, år, leaderboard, all-time, statistik, inbördes möten och duell, minnesvärda moment (även via länk och All-time → Minnen), övningsrunda, quiz (skapa, redigera, storskärm), deltävlingssida, spelare, bana, hål, runda, karta, årsrapport, inmatning, scorekort i efterhand, admin, markör, banbetyg/länkar, nyheter, ihopfällbara rubriker |
