create or replace function public.app_auth_uid() returns uuid
language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;

create or replace function public.access_company_id() returns uuid
language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'company_id', '')::uuid $$;

create or replace function public.access_role() returns text
language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'app_role', ''), 'anonymous') $$;

create or replace function public.access_customer_id() returns uuid
language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'customer_id', '')::uuid $$;

alter table public.case_sequences enable row level security;
alter table public.companies enable row level security;
alter table public.company_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.staff enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.import_cases enable row level security;
alter table public.stage_definitions enable row level security;
alter table public.company_stages enable row level security;
alter table public.import_stage_updates enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.payments enable row level security;
alter table public.documents enable row level security;
alter table public.tracking_updates enable row level security;
alter table public.notifications enable row level security;
alter table public.enquiries enable row level security;
alter table public.tax_rates enable row level security;
alter table public.customs_duty_bands enable row level security;
alter table public.audit_log enable row level security;

create policy "companies_member_read" on public.companies for select using (id = public.access_company_id());
create policy "companies_admin_update" on public.companies for update using (public.access_role() = 'admin' and id = public.access_company_id()) with check (public.access_role() = 'admin' and id = public.access_company_id());

create policy "company_settings_member_read" on public.company_settings for select using (company_id = public.access_company_id());
create policy "company_settings_admin_write" on public.company_settings for insert with check (public.access_role() = 'admin' and company_id = public.access_company_id());
create policy "company_settings_admin_update" on public.company_settings for update using (public.access_role() = 'admin' and company_id = public.access_company_id()) with check (public.access_role() = 'admin' and company_id = public.access_company_id());

create policy "profiles_self_read" on public.profiles for select using (id = public.app_auth_uid());
create policy "profiles_staff_read" on public.profiles for select using (
  public.access_role() in ('staff', 'admin')
  and (
    exists (
      select 1
      from public.staff s
      join public.staff me on me.user_id = public.app_auth_uid()
      where s.user_id = public.profiles.id
        and s.company_id = me.company_id
        and me.is_active
    )
    or exists (
      select 1
      from public.customers cu
      where cu.user_id = public.profiles.id
        and cu.company_id = (select me2.company_id from public.staff me2 where me2.user_id = public.app_auth_uid() and me2.is_active)
    )
  )
);
create policy "profiles_self_insert" on public.profiles for insert with check (id = public.app_auth_uid());
create policy "profiles_self_update" on public.profiles for update using (id = public.app_auth_uid());

create policy "staff_admin_read" on public.staff for select using (public.access_role() = 'admin' and company_id = public.access_company_id());
create policy "staff_admin_insert" on public.staff for insert with check (public.access_role() = 'admin' and company_id = public.access_company_id());
create policy "staff_admin_update" on public.staff for update using (public.access_role() = 'admin' and company_id = public.access_company_id()) with check (public.access_role() = 'admin' and company_id = public.access_company_id());
create policy "staff_admin_delete" on public.staff for delete using (public.access_role() = 'admin' and company_id = public.access_company_id());

create policy "customers_member_read" on public.customers for select using (
  (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id())
  or id = public.access_customer_id()
);
create policy "customers_staff_insert" on public.customers for insert with check (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id());
create policy "customers_staff_update" on public.customers for update using (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id()) with check (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id());
create policy "customers_staff_delete" on public.customers for delete using (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id());

create policy "vehicles_member_read" on public.vehicles for select using (
  (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id())
  or exists (select 1 from public.import_cases c where c.vehicle_id = public.vehicles.id and c.company_id = public.access_company_id() and c.customer_id = public.access_customer_id())
);
create policy "vehicles_staff_insert" on public.vehicles for insert with check (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id());
create policy "vehicles_staff_update" on public.vehicles for update using (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id()) with check (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id());
create policy "vehicles_staff_delete" on public.vehicles for delete using (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id());

create policy "import_cases_member_read" on public.import_cases for select using (
  (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id())
  or (company_id = public.access_company_id() and customer_id = public.access_customer_id())
);
create policy "import_cases_staff_insert" on public.import_cases for insert with check (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id());

create policy "stage_definitions_read" on public.stage_definitions for select using (public.access_role() in ('staff', 'admin'));

create policy "company_stages_member_read" on public.company_stages for select using (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id());
create policy "company_stages_admin_insert" on public.company_stages for insert with check (public.access_role() = 'admin' and company_id = public.access_company_id());
create policy "company_stages_admin_update" on public.company_stages for update using (public.access_role() = 'admin' and company_id = public.access_company_id()) with check (public.access_role() = 'admin' and company_id = public.access_company_id());
create policy "company_stages_admin_delete" on public.company_stages for delete using (public.access_role() = 'admin' and company_id = public.access_company_id());

create policy "isu_member_read" on public.import_stage_updates for select using (
  (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id())
  or exists (select 1 from public.import_cases c where c.id = public.import_stage_updates.case_id and c.company_id = public.access_company_id() and c.customer_id = public.access_customer_id())
);

create policy "quotations_member_read" on public.quotations for select using (
  (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id())
  or exists (select 1 from public.import_cases c where c.id = public.quotations.case_id and c.company_id = public.access_company_id() and c.customer_id = public.access_customer_id())
);

create policy "quotation_items_member_read" on public.quotation_items for select using (exists (
  select 1 from public.quotations q
  where q.id = public.quotation_items.quotation_id
    and (
      (public.access_role() in ('staff', 'admin') and q.company_id = public.access_company_id())
      or exists (select 1 from public.import_cases c where c.id = q.case_id and c.company_id = public.access_company_id() and c.customer_id = public.access_customer_id())
    )
));
create policy "payments_member_read" on public.payments for select using (
  (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id())
  or exists (select 1 from public.import_cases c where c.id = public.payments.case_id and c.company_id = public.access_company_id() and c.customer_id = public.access_customer_id())
);

create policy "documents_member_read" on public.documents for select using (
  (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id())
  or exists (select 1 from public.import_cases c where c.id = public.documents.case_id and c.company_id = public.access_company_id() and c.customer_id = public.access_customer_id())
);
create policy "documents_staff_insert" on public.documents for insert with check (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id());
create policy "documents_staff_update" on public.documents for update using (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id()) with check (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id());

create policy "tracking_member_read" on public.tracking_updates for select using (
  (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id())
  or exists (select 1 from public.import_cases c where c.id = public.tracking_updates.case_id and c.company_id = public.access_company_id() and c.customer_id = public.access_customer_id())
);
create policy "tracking_staff_insert" on public.tracking_updates for insert with check (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id());
create policy "tracking_staff_update" on public.tracking_updates for update using (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id()) with check (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id());

create policy "notifications_self_read" on public.notifications for select using (user_id = public.app_auth_uid());
create policy "notifications_self_update" on public.notifications for update using (user_id = public.app_auth_uid());

create policy "enquiries_member_read" on public.enquiries for select using (
  (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id())
  or exists (select 1 from public.customers cu where cu.id = public.enquiries.customer_id and cu.id = public.access_customer_id())
);
create policy "enquiries_customer_insert" on public.enquiries for insert with check (
  public.access_role() = 'customer'
  and customer_id = public.access_customer_id()
  and company_id = public.access_company_id()
);
create policy "enquiries_staff_update" on public.enquiries for update using (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id()) with check (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id());

create policy "tax_rates_staff_read" on public.tax_rates for select using (public.access_role() in ('staff', 'admin'));
create policy "tax_rates_admin_insert" on public.tax_rates for insert with check (public.access_role() = 'admin');
create policy "tax_rates_admin_update" on public.tax_rates for update using (public.access_role() = 'admin');

create policy "duty_bands_staff_read" on public.customs_duty_bands for select using (public.access_role() in ('staff', 'admin'));
create policy "duty_bands_admin_insert" on public.customs_duty_bands for insert with check (public.access_role() = 'admin');
create policy "duty_bands_admin_update" on public.customs_duty_bands for update using (public.access_role() = 'admin');
create policy "duty_bands_admin_delete" on public.customs_duty_bands for delete using (public.access_role() = 'admin');

create policy "audit_log_staff_read" on public.audit_log for select using (public.access_role() in ('staff', 'admin') and company_id = public.access_company_id());

revoke all on table public.case_sequences from anon;
revoke all on table public.case_sequences from authenticated;
revoke all on table public.case_sequences from public;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
revoke all on table public.case_sequences from anon;
revoke all on table public.case_sequences from authenticated;