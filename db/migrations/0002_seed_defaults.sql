insert into public.stage_definitions (key, label, default_position, is_default_enabled) values
  ('enquiry', 'Enquiry', 1, true),
  ('quotation', 'Quotation', 2, true),
  ('payment_confirmed', 'Payment Confirmed', 3, true),
  ('vehicle_sourced', 'Vehicle Sourced', 4, true),
  ('purchase_completed', 'Purchase Completed', 5, true),
  ('export_processing', 'Export Processing', 6, true),
  ('shipped', 'Shipped', 7, true),
  ('in_transit', 'In Transit', 8, true),
  ('arrived', 'Arrived', 9, true),
  ('customs_clearance', 'Customs Clearance', 10, true),
  ('duties_charges', 'Duties/Charges', 11, true),
  ('registration_compliance', 'Registration/Compliance', 12, true),
  ('ready_for_collection', 'Ready for Collection', 13, true),
  ('delivered', 'Delivered', 14, true);

insert into public.tax_rates (scope, effective_from, vat_pct, import_duty_pct, surtax_threshold_years, surtax_pct, carbon_tax_config)
values (
  'all', current_date, 15, 20, 5, 25,
  '[
    {"from_cc": 0, "to_cc": 1500, "amount": 300},
    {"from_cc": 1501, "to_cc": 3000, "amount": 500},
    {"from_cc": 3001, "to_cc": null, "amount": 800}
  ]'::jsonb
);

with defaults as (
  select id from public.tax_rates order by created_at desc limit 1
)
insert into public.customs_duty_bands (tax_rate_id, engine_cc_min, engine_cc_max, duty_pct) values
  ((select id from defaults), 0, 1500, 25.00),
  ((select id from defaults), 1501, 2000, 30.00),
  ((select id from defaults), 2001, 3000, 35.00),
  ((select id from defaults), 3001, null, 40.00);