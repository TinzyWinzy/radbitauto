create or replace function public.carbon_tax_for(p_config jsonb, p_cc int) returns numeric
language sql immutable
as $$
  select coalesce(sum((band ->> 'amount')::numeric), 0)
  from jsonb_array_elements(p_config) band
  where (band ->> 'from_cc')::int <= p_cc
    and (band ->> 'to_cc' is null or (band ->> 'to_cc')::int >= p_cc)
$$;

create or replace function public.vehicle_age_years(p_year int) returns int
language sql immutable
as $$ select extract(year from current_date)::int - p_year $$;

create or replace function public.calculate_import_quotation(p_vehicle_id uuid)
returns jsonb
language plpgsql stable
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_tax public.tax_rates%rowtype;
  v_band public.customs_duty_bands%rowtype;
  v_age int;
  v_valuation numeric(14,2);
  v_customs_duty numeric(14,2);
  v_import_duty numeric(14,2);
  v_surtax numeric(14,2);
  v_vat numeric(14,2);
  v_carbon numeric(14,2);
  v_total numeric(14,2);
begin
  select * into v_vehicle from public.vehicles where id = p_vehicle_id;
  if not found then raise exception 'vehicle not found'; end if;

  select * into v_tax
  from public.tax_rates t
  where t.effective_from <= current_date
    and (t.effective_to is null or t.effective_to >= current_date)
    and ((t.scope = 'company' and t.company_id = v_vehicle.company_id) or t.scope = 'all')
  order by (t.scope = 'company') desc, t.effective_from desc
  limit 1;

  if v_tax is null then raise exception 'no active tax rate set'; end if;

  select * into v_band
  from public.customs_duty_bands b
  where b.tax_rate_id = v_tax.id
    and coalesce(v_vehicle.engine_cc, 0) >= b.engine_cc_min
    and (b.engine_cc_max is null or coalesce(v_vehicle.engine_cc, 0) <= b.engine_cc_max)
  order by b.engine_cc_min desc
  limit 1;

  v_valuation := greatest(v_vehicle.purchase_price, coalesce(v_vehicle.yellow_book_value, 0));
  v_customs_duty := v_valuation * coalesce(v_band.duty_pct, 25) / 100;
  v_import_duty := v_valuation * v_tax.import_duty_pct / 100;
  v_age := public.vehicle_age_years(v_vehicle.year);

  if v_age > v_tax.surtax_threshold_years then
    v_surtax := v_valuation * v_tax.surtax_pct / 100;
  else
    v_surtax := 0;
  end if;

  v_vat := (v_valuation + v_customs_duty + v_surtax) * v_tax.vat_pct / 100;
  v_carbon := public.carbon_tax_for(v_tax.carbon_tax_config, coalesce(v_vehicle.engine_cc, 0));
  v_total := v_valuation + v_customs_duty + v_import_duty + v_surtax + v_vat + v_carbon;

  return jsonb_build_object(
    'valuation_basis', case
      when v_vehicle.yellow_book_value is not null and v_vehicle.yellow_book_value > v_vehicle.purchase_price then 'yellow_book'
      else 'invoice'
    end,
    'valuation', v_valuation,
    'cif_value', v_valuation,
    'customs_duty', v_customs_duty,
    'import_duty', v_import_duty,
    'surtax', v_surtax,
    'vat', v_vat,
    'carbon_tax', v_carbon,
    'total_due', v_total,
    'applied', jsonb_build_object(
      'duty_pct', coalesce(v_band.duty_pct, 25),
      'import_duty_pct', v_tax.import_duty_pct,
      'vat_pct', v_tax.vat_pct,
      'surtax_pct', v_tax.surtax_pct,
      'surtax_threshold_years', v_tax.surtax_threshold_years,
      'vehicle_age_years', v_age
    )
  );
end;
$$;

create or replace function public.missing_docs(p_case_id uuid, p_required text[]) returns text[]
language sql stable
as $$
  select array(
    select r
    from unnest(p_required) r
    left join public.documents d
      on d.case_id = p_case_id and d.doc_type = r and d.verified
    where d.id is null
  );
$$;

create or replace function public.notify_case_update(p_case_id uuid, p_type text, p_title text, p_body text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_case public.import_cases%rowtype;
  v_user_id uuid;
begin
  select * into v_case from public.import_cases where id = p_case_id;
  if not found then return; end if;

  select user_id into v_user_id
  from public.customers
  where id = v_case.customer_id and user_id is not null;

  if v_user_id is not null then
    insert into public.notifications (company_id, user_id, case_id, type, title, body, payload)
    values (
      v_case.company_id,
      v_user_id,
      p_case_id,
      p_type,
      p_title,
      p_body,
      jsonb_build_object('case_ref', v_case.case_id, 'stage', v_case.current_stage)
    );
  end if;
end;
$$;

create or replace function public.advance_import_stage(p_case_id uuid, p_to_stage text, p_note text default null)
returns public.import_stage_updates
language plpgsql security definer set search_path = public
as $$
declare
  v_case public.import_cases%rowtype;
  v_staff public.staff%rowtype;
  v_cur_pos int;
  v_next_key text;
  v_missing text[];
  v_total_due numeric(14,2);
  v_total_paid numeric(14,2);
  v_result public.import_stage_updates;
begin
  select * into v_staff from public.staff where user_id = public.app_auth_uid() and is_active;
  if v_staff is null then raise exception 'not authorized'; end if;

  select * into v_case from public.import_cases where id = p_case_id;
  if not found then raise exception 'case not found'; end if;
  if v_case.company_id <> v_staff.company_id then raise exception 'not authorized for this tenant'; end if;

  select position into v_cur_pos
  from public.company_stages
  where company_id = v_staff.company_id and stage_key = v_case.current_stage;

  if v_cur_pos is null then
    select default_position into v_cur_pos
    from public.stage_definitions
    where key = v_case.current_stage;
  end if;

  select cs.stage_key into v_next_key
  from public.company_stages cs
  where cs.company_id = v_staff.company_id
    and cs.enabled
    and cs.position > v_cur_pos
  order by cs.position
  limit 1;

  if v_next_key is null then raise exception 'no further stage defined for this tenant'; end if;
  if p_to_stage <> v_next_key then raise exception 'must advance to next enabled stage: %', v_next_key; end if;

  if p_to_stage = 'purchase_completed' then
    v_missing := public.missing_docs(p_case_id, array['purchase_invoice']);
  elsif p_to_stage = 'export_processing' then
    v_missing := public.missing_docs(p_case_id, array['export_certificate']);
  elsif p_to_stage = 'shipped' then
    v_missing := public.missing_docs(p_case_id, array['bill_of_lading']);
    if (select source_country from public.vehicles where id = v_case.vehicle_id) = 'Japan'
       and coalesce(array_length(public.missing_docs(p_case_id, array['eaa_certificate'])), 0) > 0 then
      raise exception 'EAA certificate required before shipping Japan-sourced vehicle';
    end if;
  elsif p_to_stage = 'customs_clearance' then
    v_missing := public.missing_docs(p_case_id, array['export_certificate', 'bill_of_lading', 'road_manifest', 'condition_report', 'eaa_certificate']);
  elsif p_to_stage = 'ready_for_collection' then
    select coalesce(sum(p.amount), 0) into v_total_paid
    from public.payments p
    where p.case_id = p_case_id and p.status = 'confirmed';

    select coalesce(q.total_due, 0) into v_total_due
    from public.quotations q
    where q.case_id = p_case_id
    order by q.version desc
    limit 1;

    if v_total_paid < v_total_due then raise exception 'outstanding balance unpaid'; end if;
  end if;

  if v_missing is not null and array_length(v_missing, 1) > 0 then
    raise exception 'missing required documents: %', array_to_string(v_missing, ', ');
  end if;

  update public.import_cases ic
  set previous_stage = ic.current_stage,
      current_stage = p_to_stage,
      status_note = coalesce(p_note, ic.status_note),
      updated_at = now()
  where ic.id = p_case_id;

  insert into public.import_stage_updates (company_id, case_id, stage_key, status, staff_id, note)
  values (v_staff.company_id, p_case_id, p_to_stage, 'completed', v_staff.user_id, p_note)
  returning * into v_result;

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, detail)
  values (v_staff.company_id, v_staff.user_id, 'import_cases', p_case_id, 'advance_stage',
          jsonb_build_object('to_stage', p_to_stage));

  perform public.notify_case_update(p_case_id, 'status_update', 'Import status updated',
    format('Your import %s is now at: %s', v_case.case_id, p_to_stage));

  return v_result;
end;
$$;

create or replace function public.issue_quotation(p_case_id uuid)
returns public.quotations
language plpgsql security definer set search_path = public
as $$
declare
  v_case public.import_cases%rowtype;
  v_staff public.staff%rowtype;
  v_calc jsonb;
  v_quotation public.quotations%rowtype;
  v_version int;
begin
  select * into v_staff from public.staff where user_id = public.app_auth_uid() and is_active;
  if v_staff is null then raise exception 'not authorized'; end if;

  select * into v_case from public.import_cases where id = p_case_id;
  if not found then raise exception 'case not found'; end if;
  if v_case.company_id <> v_staff.company_id then raise exception 'not authorized for this tenant'; end if;

  v_calc := public.calculate_import_quotation(v_case.vehicle_id);

  select coalesce(max(version), 0) + 1 into v_version
  from public.quotations
  where case_id = p_case_id;

  insert into public.quotations (
    company_id, case_id, version, valuation_basis,
    cif_value, customs_duty, import_duty, surtax, vat, carbon_tax, total_due, status, issued_at
  )
  values (
    v_staff.company_id, p_case_id, v_version,
    v_calc ->> 'valuation_basis',
    (v_calc ->> 'cif_value')::numeric,
    (v_calc ->> 'customs_duty')::numeric,
    (v_calc ->> 'import_duty')::numeric,
    (v_calc ->> 'surtax')::numeric,
    (v_calc ->> 'vat')::numeric,
    (v_calc ->> 'carbon_tax')::numeric,
    (v_calc ->> 'total_due')::numeric,
    'issued', now()
  )
  returning * into v_quotation;

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, detail)
  values (v_staff.company_id, v_staff.user_id, 'quotations', v_quotation.id, 'issue',
          jsonb_build_object('version', v_version, 'total_due', v_quotation.total_due));

  perform public.notify_case_update(p_case_id, 'quotation_issued', 'New quotation',
    format('Your quotation for %s is ready. Total due: %s', v_case.case_id, v_quotation.total_due));

  return v_quotation;
end;
$$;

create or replace function public.record_payment(
  p_case_id uuid,
  p_amount numeric(14,2),
  p_method text,
  p_provider_ref text default null,
  p_proof_url text default null,
  p_quotation_id uuid default null
) returns public.payments
language plpgsql security definer set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_payment public.payments%rowtype;
  v_quotation uuid;
begin
  select * into v_staff from public.staff where user_id = public.app_auth_uid() and is_active;
  if v_staff is null then raise exception 'not authorized'; end if;

  if not exists (
    select 1 from public.import_cases c
    where c.id = p_case_id and c.company_id = v_staff.company_id
  ) then raise exception 'case not found for this tenant'; end if;

  if p_quotation_id is null then
    select id into v_quotation
    from public.quotations
    where case_id = p_case_id and status = 'issued'
    order by version desc
    limit 1;
  else
    v_quotation := p_quotation_id;
  end if;

  insert into public.payments (company_id, case_id, quotation_id, amount, method, provider_ref, proof_url, recorded_by, status)
  values (v_staff.company_id, p_case_id, v_quotation, p_amount, p_method, p_provider_ref, p_proof_url, v_staff.user_id, 'pending')
  returning * into v_payment;

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, detail)
  values (v_staff.company_id, v_staff.user_id, 'payments', v_payment.id, 'record',
          jsonb_build_object('amount', p_amount, 'method', p_method));

  return v_payment;
end;
$$;

create or replace function public.confirm_payment(p_payment_id uuid, p_note text default null)
returns public.payments
language plpgsql security definer set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_payment public.payments%rowtype;
  v_pay_company uuid;
  v_status text;
begin
  select * into v_staff from public.staff where user_id = public.app_auth_uid() and is_active;
  if v_staff is null then raise exception 'not authorized'; end if;

  select company_id into v_pay_company
  from public.payments
  where id = p_payment_id;

  if not found then raise exception 'payment not found'; end if;
  if v_pay_company <> v_staff.company_id then raise exception 'not authorized for this tenant'; end if;

  update public.payments
  set status = 'confirmed', confirmed_at = now()
  where id = p_payment_id and status = 'pending'
  returning * into v_payment;

  if not found then
    select status into v_status from public.payments where id = p_payment_id;
    raise exception 'payment already %', v_status;
  end if;

  update public.quotations q
  set total_paid = coalesce(q.total_paid, 0) + v_payment.amount
  where q.id = v_payment.quotation_id;

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, detail)
  values (v_staff.company_id, v_staff.user_id, 'payments', p_payment_id, 'confirm',
          jsonb_build_object('note', p_note));

  perform public.notify_case_update(v_payment.case_id, 'payment_confirmed', 'Payment confirmed',
    format('Payment of %s confirmed on %s', v_payment.amount, v_payment.case_id));

  return v_payment;
end;
$$;

create or replace function public.clearance_ready(p_case_id uuid)
returns table (ready boolean, missing_docs text[])
language plpgsql stable security definer set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_case public.import_cases%rowtype;
begin
  select * into v_staff from public.staff where user_id = public.app_auth_uid() and is_active;
  if v_staff is null then raise exception 'not authorized'; end if;

  select * into v_case from public.import_cases where id = p_case_id;
  if v_case.company_id <> v_staff.company_id then raise exception 'not authorized for this tenant'; end if;

  missing_docs := public.missing_docs(p_case_id, array['export_certificate', 'bill_of_lading', 'road_manifest', 'condition_report', 'eaa_certificate']);
  ready := coalesce(array_length(missing_docs, 1), 0) = 0;
  return next;
end;
$$;

create or replace function public.global_search(p_query text)
returns setof public.import_cases
language plpgsql stable security definer set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
begin
  select * into v_staff from public.staff where user_id = public.app_auth_uid() and is_active;
  if v_staff is null then raise exception 'staff only'; end if;

  return query
    select c.*
    from public.import_cases c
    left join public.customers cu on cu.id = c.customer_id
    left join public.vehicles v on v.id = c.vehicle_id
    where c.company_id = v_staff.company_id
      and (
        c.case_id ilike '%' || p_query || '%'
        or cu.full_name ilike '%' || p_query || '%'
        or v.vin_chassis ilike '%' || p_query || '%'
      )
    order by c.created_at desc;
end;
$$;

create index global_search_case_idx on public.import_cases using gin (case_id gin_trgm_ops);
create index global_search_customer_idx on public.customers using gin (full_name gin_trgm_ops);
create index global_search_vin_idx on public.vehicles using gin (vin_chassis gin_trgm_ops);

revoke execute on function public.calculate_import_quotation(uuid) from public, anon;
revoke execute on function public.next_case_ref(uuid) from public, anon;
revoke execute on function public.advance_import_stage(uuid, text, text) from public, anon;
revoke execute on function public.issue_quotation(uuid) from public, anon;
revoke execute on function public.record_payment(uuid, numeric, text, text, text, uuid) from public, anon;
revoke execute on function public.confirm_payment(uuid, text) from public, anon;
revoke execute on function public.clearance_ready(uuid) from public, anon;
revoke execute on function public.global_search(text) from public, anon;
revoke execute on function public.missing_docs(uuid, text[]) from public, anon;
revoke execute on function public.notify_case_update(uuid, text, text, text) from public, anon;

grant execute on function public.calculate_import_quotation(uuid) to authenticated;
grant execute on function public.advance_import_stage(uuid, text, text) to authenticated;
grant execute on function public.issue_quotation(uuid) to authenticated;
grant execute on function public.record_payment(uuid, numeric, text, text, text, uuid) to authenticated;
grant execute on function public.confirm_payment(uuid, text) to authenticated;
grant execute on function public.clearance_ready(uuid) to authenticated;
grant execute on function public.global_search(text) to authenticated;