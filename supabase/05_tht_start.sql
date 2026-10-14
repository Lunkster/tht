-- 05: planerat startdatum för en THT, så att startsidan kan räkna ned innan
-- deltävlingarna är inlagda. Tomt = används inte; då gäller första deltävlingens datum.
alter table tht add column if not exists start date;
comment on column tht.start is 'Planerat startdatum (valfritt). Startsidan räknar ned mot detta eller första deltävlingens datum.';
