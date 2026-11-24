-- LadangKita · Stage 1 · tables
-- One database serves many plantations; every row carries plantation_id.

create extension if not exists pgcrypto;

-- ---------- plantation and people ----------
create table public.plantations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ssm_no text,
  business_type text,
  started_on date,
  fy_start_month int check (fy_start_month between 1 and 12),
  address text,
  district_state text,
  gps text,
  area_acres numeric(8,2),
  length_m numeric(8,1),
  width_m numeric(8,1),
  landowner text,
  rent_amount numeric(12,2),
  rent_period text,
  lease_ends_on date,
  currency text not null default 'MYR',
  phone text,
  email text,
  logo_path text,
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  display_name text not null,
  role text not null default 'partner' check (role in ('admin', 'partner')),
  phone text,
  capital numeric(14,2) not null default 0,
  joined_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (plantation_id, email)
);

-- Sensitive partner details: visible only to the admin and to the partner themself.
create table public.member_private (
  member_id uuid primary key references public.members(id) on delete cascade,
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  full_name text,
  ic_no text,
  address text,
  bank_name text,
  account_holder text,
  account_no text,
  next_of_kin text,
  updated_at timestamptz not null default now()
);

-- ---------- land and crop ----------
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  code text not null,
  name text not null,
  est_acres numeric(6,2),
  width_m numeric(6,1),
  notes text,
  sort int not null default 0,
  unique (plantation_id, code)
);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  no int not null,
  name text not null,
  planted_on date,
  finished_on date,
  plants int not null default 0,
  material text,
  variety text,
  source_note text,
  est_acres numeric(6,2),
  measured_acres numeric(6,2),
  notes text,
  unique (plantation_id, no)
);

create table public.batch_blocks (
  batch_id uuid not null references public.batches(id) on delete cascade,
  block_id uuid not null references public.blocks(id) on delete cascade,
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  plants int not null default 0,
  primary key (batch_id, block_id)
);

create table public.crop_templates (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  variety text not null,
  months_to_induction numeric(4,1),
  months_induction_to_harvest numeric(4,1),
  fruit_per_acre int,
  tasks jsonb not null default '[]'::jsonb,
  unique (plantation_id, variety)
);

-- ---------- lists ----------
create table public.cost_categories (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  grp text not null check (grp in ('Beli', 'Upah', 'Lain')),
  name text not null,
  sort int not null default 0,
  unique (plantation_id, name)
);

create table public.contractors (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  name text not null,
  ssm_or_ic text,
  phone text,
  address text,
  usual_rates text,
  bank_name text,
  account_no text,
  work_types text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.buyers (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  name text not null,
  phone text,
  address text,
  payment_terms text,
  grades_bought text,
  buyer_types text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  name text not null,
  phone text,
  notes text
);

-- ---------- agencies and grants ----------
create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  name text not null,
  type text,
  programme text,
  website text,
  officer text,
  phone text,
  email text,
  address text
);

create table public.agency_requirements (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  sort int not null default 0
);

create table public.grants (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  ref text not null,
  agency_id uuid references public.agencies(id) on delete set null,
  title text not null,
  status text not null default 'Applied' check (status in ('Applied', 'Approved', 'Received', 'Planted', 'Completed')),
  applied_on date,
  approved_on date,
  quantity text,
  value_note text,
  conditions text,
  unique (plantation_id, ref)
);

-- ---------- planting material ----------
create table public.material_receipts (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  ref text not null,
  received_on date,
  source text not null,
  how text not null check (how in ('Bought', 'Grant', 'Free')),
  type text not null check (type in ('Sulur', 'Jambul')),
  qty int not null,
  grant_id uuid references public.grants(id) on delete set null,
  notes text,
  unique (plantation_id, ref)
);

create table public.material_uses (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.material_receipts(id) on delete cascade,
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  batch_id uuid references public.batches(id) on delete set null,
  use text not null check (use in ('Planting', 'Sulam')),
  qty int not null
);

-- ---------- money: purchases and jobs ----------
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  ref text not null,
  category text not null,
  other_note text,
  item text,
  supplier text,
  amount numeric(12,2),
  purchased_on date,
  date_note text,
  for_batches text,
  paid_by text not null default 'From the pool',
  material_receipt_id uuid references public.material_receipts(id) on delete set null,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now(),
  unique (plantation_id, ref)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  ref text not null,
  category text not null,
  other_note text,
  contractor_id uuid references public.contractors(id) on delete set null,
  contractor_name text,
  start_on date,
  date_note text,
  status text not null default 'Planned' check (status in ('Planned', 'Quoted', 'In progress', 'Done', 'To pay', 'Paid')),
  price numeric(12,2),
  products text,
  method text,
  note text,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now(),
  unique (plantation_id, ref)
);

create table public.job_batches (
  job_id uuid not null references public.jobs(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  primary key (job_id, batch_id)
);

create table public.job_blocks (
  job_id uuid not null references public.jobs(id) on delete cascade,
  block_id uuid not null references public.blocks(id) on delete cascade,
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  primary key (job_id, block_id)
);

create table public.contractor_payments (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  ref text not null,
  contractor_id uuid references public.contractors(id) on delete set null,
  contractor_name text,
  paid_on date not null default current_date,
  paid_by text not null,
  method text not null,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now(),
  unique (plantation_id, ref)
);

create table public.payment_jobs (
  payment_id uuid not null references public.contractor_payments(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  primary key (payment_id, job_id),
  unique (job_id)
);

-- ---------- sales ----------
create table public.harvest_picks (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  ref text not null,
  picked_on date not null default current_date,
  buyer_id uuid references public.buyers(id) on delete set null,
  buyer_name text,
  grade_a int not null default 0,
  grade_b int not null default 0,
  grade_c int not null default 0,
  price_a numeric(8,2) not null default 0,
  price_b numeric(8,2) not null default 0,
  price_c numeric(8,2) not null default 0,
  note text,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now(),
  unique (plantation_id, ref)
);

create table public.pick_batches (
  pick_id uuid not null references public.harvest_picks(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  primary key (pick_id, batch_id)
);

create table public.buyer_receipts (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  ref text not null,
  buyer_id uuid references public.buyers(id) on delete set null,
  buyer_name text,
  received_on date not null default current_date,
  received_by text not null,
  method text not null,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now(),
  unique (plantation_id, ref)
);

create table public.receipt_picks (
  receipt_id uuid not null references public.buyer_receipts(id) on delete cascade,
  pick_id uuid not null references public.harvest_picks(id) on delete cascade,
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  primary key (receipt_id, pick_id),
  unique (pick_id)
);

-- ---------- partner expenses and claims ----------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  ref text not null,
  member_id uuid references public.members(id) on delete set null,
  paid_from_pool boolean not null default false,
  spent_on date not null default current_date,
  type text not null check (type in ('Transport', 'Meals', 'Miscellaneous')),
  what text,
  amount numeric(10,2) not null,
  created_at timestamptz not null default now(),
  unique (plantation_id, ref)
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  ref text not null,
  member_id uuid not null references public.members(id),
  submitted_on date not null default current_date,
  status text not null default 'Claimed' check (status in ('Claimed', 'Paid')),
  paid_on date,
  paid_by uuid references public.members(id),
  note text,
  unique (plantation_id, ref)
);

create table public.claim_expenses (
  claim_id uuid not null references public.claims(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  primary key (claim_id, expense_id),
  unique (expense_id)
);

-- ---------- alerts and map ----------
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  ref text not null,
  type text not null,
  location text,
  urgency text not null check (urgency in ('High', 'Critical')),
  description text,
  status text not null default 'Open' check (status in ('Open', 'Action taken', 'Closed')),
  reported_by uuid references public.members(id),
  reported_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.members(id),
  unique (plantation_id, ref)
);

create table public.alert_actions (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.alerts(id) on delete cascade,
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  member_id uuid references public.members(id),
  action text not null,
  created_at timestamptz not null default now()
);

create table public.map_marks (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  type text not null check (type in ('Issue', 'Fence', 'Water', 'Note')),
  x numeric(7,4),
  y numeric(7,4),
  lat numeric(9,6),
  lng numeric(9,6),
  note text,
  batch_id uuid references public.batches(id) on delete set null,
  alert_id uuid references public.alerts(id) on delete set null,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now()
);

-- ---------- files (photos, receipts, reports) ----------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  entity text not null,
  entity_id uuid not null,
  kind text not null default 'Photo' check (kind in ('Photo', 'Receipt', 'Document')),
  storage_path text not null,
  bytes int,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now()
);
create index attachments_entity_idx on public.attachments (entity, entity_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  name text not null,
  storage_path text not null,
  bytes int,
  made_by uuid references public.members(id),
  created_at timestamptz not null default now()
);

-- ---------- settings ----------
create table public.settings (
  plantation_id uuid primary key references public.plantations(id) on delete cascade,
  photo_size text not null default 'Small' check (photo_size in ('Small', 'Medium', 'Original')),
  keep_reports_months int not null default 12,
  weekly_backup boolean not null default true,
  weekly_backup_day text not null default 'Mon',
  notifications jsonb not null default '{}'::jsonb
);
