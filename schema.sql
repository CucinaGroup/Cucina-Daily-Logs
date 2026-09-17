-- =====================================================================
-- Cucina Food Safety Logbook — Supabase schema
-- Run this in Supabase → SQL Editor → New query → Run
-- =====================================================================

-- ---------- SITES (the 15-site register; feeds every dropdown) --------
create table if not exists sites (
  id         bigint generated always as identity primary key,
  code       text not null,
  name       text not null,
  brand      text,
  location   text,
  active     boolean default true,
  created_at timestamptz default now()
);

-- ---------- 1. DELIVERIES --------------------------------------------
create table if not exists deliveries (
  id                bigint generated always as identity primary key,
  entry_date        date not null,
  entry_time        time,
  site_id           bigint references sites(id) on delete set null,
  supplier          text,
  item              text,            -- BEEF/CHICKEN/PORK/SEAFOOD/OTHER
  temp              numeric,
  best_before       date,
  accept            text,            -- Y / N
  invoice_no        text,
  weight            numeric,
  receiver          text,
  driver            text,
  recorded_by       text,
  corrective_action text,
  created_at        timestamptz default now()
);

-- ---------- 2. FRIDGE / FREEZER --------------------------------------
create table if not exists fridge_freezer (
  id                bigint generated always as identity primary key,
  entry_date        date not null,
  entry_time        time,
  site_id           bigint references sites(id) on delete set null,
  area              text,            -- FOH / BOH
  unit              text,            -- e.g. Walk-in Fridge 1
  type              text,            -- Fridge / Freezer
  temp              numeric,
  within_range      boolean generated always as (
                      case when type = 'Freezer' then temp <= -18 else temp <= 5 end
                    ) stored,
  recorded_by       text,
  corrective_action text,
  created_at        timestamptz default now()
);

-- ---------- 3-5. PROCESS LOGS (MEP / Risky / Freezer share one table)-
create table if not exists process_logs (
  id                bigint generated always as identity primary key,
  entry_date        date not null,
  entry_time        time,
  site_id           bigint references sites(id) on delete set null,
  category          text not null,   -- MEP / Risky / Freezer
  food_item         text,
  cook_temp         numeric,
  reheat_temp       numeric,
  hot_holding_temp  numeric,
  process_time      text,
  temp              numeric,
  recorded_by       text,
  corrective_action text,
  created_at        timestamptz default now()
);

-- ---------- 6. FOOD WASTE --------------------------------------------
create table if not exists food_waste (
  id                bigint generated always as identity primary key,
  entry_date        date not null,
  entry_time        time,
  site_id           bigint references sites(id) on delete set null,
  recorded_by       text,
  item_description  text,
  loss_reason       text,
  quantity          numeric,
  unit              text,            -- kg / L / ea
  cost              numeric,
  verified_by       text,
  created_at        timestamptz default now()
);

-- helpful indexes for filtering by site + date
create index if not exists idx_del_site_date  on deliveries(site_id, entry_date);
create index if not exists idx_ff_site_date   on fridge_freezer(site_id, entry_date);
create index if not exists idx_proc_site_date on process_logs(site_id, entry_date, category);
create index if not exists idx_fw_site_date   on food_waste(site_id, entry_date);

-- =====================================================================
-- ROW LEVEL SECURITY — only logged-in users can read/write
-- =====================================================================
alter table sites          enable row level security;
alter table deliveries     enable row level security;
alter table fridge_freezer enable row level security;
alter table process_logs   enable row level security;
alter table food_waste     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sites','deliveries','fridge_freezer','process_logs','food_waste']
  loop
    execute format('drop policy if exists "read_auth"  on %I;', t);
    execute format('drop policy if exists "write_auth" on %I;', t);
    execute format('drop policy if exists "upd_auth"   on %I;', t);
    execute format('drop policy if exists "del_auth"   on %I;', t);
    execute format('create policy "read_auth"  on %I for select to authenticated using (true);', t);
    execute format('create policy "write_auth" on %I for insert to authenticated with check (true);', t);
    execute format('create policy "upd_auth"   on %I for update to authenticated using (true) with check (true);', t);
    execute format('create policy "del_auth"   on %I for delete to authenticated using (true);', t);
  end loop;
end $$;

-- =====================================================================
-- SEED 15 SITES (rename these later — in-app or here)
-- =====================================================================
insert into sites (code, name, brand, location) values
 ('01','Site 01','Flappy''s Fried Chicken',''),
 ('02','Site 02','Burger Point',''),
 ('03','Site 03','Sir Manong',''),
 ('04','Site 04','Masa',''),
 ('05','Site 05','Flappy''s Fried Chicken',''),
 ('06','Site 06','Burger Point',''),
 ('07','Site 07','Sir Manong',''),
 ('08','Site 08','Masa',''),
 ('09','Site 09','Flappy''s Fried Chicken',''),
 ('10','Site 10','Burger Point',''),
 ('11','Site 11','Sir Manong',''),
 ('12','Site 12','Masa',''),
 ('13','Site 13','Flappy''s Fried Chicken',''),
 ('14','Site 14','Burger Point',''),
 ('15','Site 15','Sir Manong','')
on conflict do nothing;
