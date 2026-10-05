create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

do $$
begin
  execute 'grant anon, authenticated to ' || current_user;
end
$$;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  logo_url text,
  case_prefix text not null,
  contact_whatsapp text not null,
  primary_color text not null default '#1d4ed8',
  secondary_color text,
  default_port text not null default 'Durban' check (default_port in ('Durban', 'Beira', 'Walvis Bay')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  currency text not null default 'USD',
  payment_methods text[] not null default array['EcoCash', 'InnBucks', 'Bank'],
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  full_name text not null,
  phone_number text,
  whatsapp_ref text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.staff (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null default 'staff' check (role in ('staff', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  phone_number text not null,
  whatsapp_ref text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index customers_company_idx on public.customers (company_id);
create index customers_user_idx on public.customers (user_id);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vin_chassis text not null,
  engine_number text,
  engine_cc int,
  make text not null,
  model text not null,
  variant text,
  year int not null,
  source_country text not null default 'Japan',
  purchase_price numeric(14,2) not null default 0,
  yellow_book_value numeric(14,2),
  eaa_status text not null default 'none' check (eaa_status in ('none', 'pending', 'passed', 'failed', 'exempt')),
  is_commercial boolean not null default false,
  exemption_flag text not null default 'none' check (exemption_flag in ('none', 'deceased_estate', 'returning_resident', 'antique_classic')),
  import_licence_required boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, vin_chassis)
);
create index vehicles_vin_idx on public.vehicles (company_id, vin_chassis);

create table public.case_sequences (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_seq int not null default 0
);

create table public.import_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id text not null,
  customer_id uuid not null references public.customers(id),
  vehicle_id uuid not null references public.vehicles(id),
  current_stage text not null default 'enquiry',
  previous_stage text,
  status_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, case_id)
);
create index import_cases_company_customer_idx on public.import_cases (company_id, customer_id);
create index import_cases_company_stage_idx on public.import_cases (company_id, current_stage);
create index import_cases_vehicle_idx on public.import_cases (company_id, vehicle_id);

create table public.stage_definitions (
  key text primary key,
  label text not null,
  default_position int not null unique,
  is_default_enabled boolean not null default true
);

create table public.company_stages (
  company_id uuid not null references public.companies(id) on delete cascade,
  stage_key text not null references public.stage_definitions(key),
  position int not null,
  enabled boolean not null default true,
  custom_label text,
  primary key (company_id, stage_key),
  unique (company_id, position)
);

create table public.import_stage_updates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.import_cases(id) on delete cascade,
  stage_key text not null,
  status text not null,
  staff_id uuid references public.staff(user_id),
  note text,
  created_at timestamptz not null default now()
);
create index import_stage_updates_case_idx on public.import_stage_updates (case_id, created_at desc);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.import_cases(id) on delete cascade,
  version int not null default 1,
  valuation_basis text not null default 'max' check (valuation_basis in ('invoice', 'yellow_book', 'max')),
  cif_value numeric(14,2) not null default 0,
  customs_duty numeric(14,2) not null default 0,
  import_duty numeric(14,2) not null default 0,
  surtax numeric(14,2) not null default 0,
  vat numeric(14,2) not null default 0,
  carbon_tax numeric(14,2) not null default 0,
  total_due numeric(14,2) not null default 0,
  total_paid numeric(14,2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'issued', 'accepted', 'expired')),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, case_id, version)
);
create index quotations_case_version_idx on public.quotations (company_id, case_id, version desc);

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  item_key text not null check (item_key in ('purchase_price', 'shipping', 'insurance', 'port_storage', 'border_freight')),
  description text,
  amount numeric(14,2) not null default 0
);
create index quotation_items_q_idx on public.quotation_items (quotation_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.import_cases(id) on delete cascade,
  quotation_id uuid references public.quotations(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('EcoCash', 'InnBucks', 'Bank', 'Cash')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'refunded', 'reversed')),
  provider_ref text,
  proof_url text,
  recorded_by uuid references public.staff(user_id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, provider_ref)
);
create index payments_case_status_idx on public.payments (company_id, case_id, status);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.import_cases(id) on delete cascade,
  doc_type text not null check (doc_type in (
    'export_certificate', 'bill_of_lading', 'road_manifest', 'condition_report',
    'eaa_certificate', 'purchase_invoice', 'proof_of_payment', 'import_licence'
  )),
  object_key text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  verified boolean not null default false,
  uploaded_by uuid references public.staff(user_id),
  uploaded_at timestamptz not null default now()
);
create index documents_case_type_idx on public.documents (company_id, case_id, doc_type);

create table public.tracking_updates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.import_cases(id) on delete cascade,
  location text not null,
  lat numeric(9,6),
  lng numeric(9,6),
  source text not null default 'manual' check (source in ('manual', 'api')),
  note text,
  recorded_by uuid references public.staff(user_id),
  created_at timestamptz not null default now()
);
create index tracking_updates_case_idx on public.tracking_updates (company_id, case_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  case_id uuid references public.import_cases(id) on delete cascade,
  type text not null,
  title text,
  body text,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_read_idx on public.notifications (user_id, read_at);

create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  case_id uuid references public.import_cases(id) on delete set null,
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  whatsapp_ref text,
  message text not null,
  status text not null default 'open' check (status in ('open', 'replied', 'closed')),
  reply text,
  replied_by uuid references public.staff(user_id),
  created_at timestamptz not null default now()
);
create index enquiries_case_idx on public.enquiries (company_id, case_id);

create table public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'all' check (scope in ('all', 'company')),
  company_id uuid references public.companies(id) on delete cascade,
  effective_from date not null,
  effective_to date,
  vat_pct numeric(5,2) not null default 15,
  import_duty_pct numeric(5,2) not null default 20,
  surtax_threshold_years int not null default 5,
  surtax_pct numeric(5,2) not null default 25,
  carbon_tax_config jsonb not null default '[]'
);

create table public.customs_duty_bands (
  id uuid primary key default gen_random_uuid(),
  tax_rate_id uuid not null references public.tax_rates(id) on delete cascade,
  engine_cc_min int not null,
  engine_cc_max int,
  duty_pct numeric(5,2) not null
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies(id),
  actor_id uuid references public.profiles(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_company_idx on public.audit_log (company_id, created_at desc);

create or replace function public.next_case_ref(p_company_id uuid) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_seq int;
  v_prefix text;
begin
  insert into public.case_sequences (company_id, last_seq)
  values (p_company_id, 1)
  on conflict (company_id) do update set last_seq = public.case_sequences.last_seq + 1
  returning last_seq into v_seq;

  select case_prefix into v_prefix from public.companies where id = p_company_id;
  return v_prefix || lpad(v_seq::text, 4, '0');
end;
$$;

create or replace function public.trg_import_cases_set_case_id()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.case_id is null then
    new.case_id := public.next_case_ref(new.company_id);
  end if;
  return new;
end;
$$;

create trigger import_cases_set_case_id_trg
before insert on public.import_cases
for each row execute function public.trg_import_cases_set_case_id();