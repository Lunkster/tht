-- 08: en THT är "klar" (avslutad/godkänd) först när admin markerar den – då utses vinnare.
-- Innan dess visar appen "Leder" i stället för vinnare och all-time räknar inte segrar/pall.
alter table tht add column if not exists klar boolean not null default false;
comment on column tht.klar is 'THT:n är avslutad och godkänd – först då utses vinnare (pall, segrar i all-time).';
update tht set klar = true where artal <= 2025;
