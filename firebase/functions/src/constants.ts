export const STAGES = [
  { key: 'enquiry', label: 'Enquiry' },
  { key: 'quotation', label: 'Quotation' },
  { key: 'payment_confirmed', label: 'Payment Confirmed' },
  { key: 'vehicle_sourced', label: 'Vehicle Sourced' },
  { key: 'purchase_completed', label: 'Purchase Completed' },
  { key: 'export_processing', label: 'Export Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'arrived', label: 'Arrived' },
  { key: 'customs_clearance', label: 'Customs Clearance' },
  { key: 'duties_charges', label: 'Duties/Charges' },
  { key: 'registration_compliance', label: 'Registration/Compliance' },
  { key: 'ready_for_collection', label: 'Ready for Collection' },
  { key: 'delivered', label: 'Delivered' },
] as const;

export type StageKey = (typeof STAGES)[number]['key'];

export const DOC_TYPES = [
  'export_certificate',
  'bill_of_lading',
  'road_manifest',
  'condition_report',
  'eaa_certificate',
  'purchase_invoice',
  'proof_of_payment',
  'import_licence',
] as const;

export const PAYMENT_METHODS = ['EcoCash', 'InnBucks', 'Bank', 'Cash'] as const;

export const VEHICLE_CATEGORIES = [
  'sedan_station_wagon',
  'pickup_up_to_800kg',
  'pickup_801_to_1400kg',
  'pickup_over_1400kg',
  'double_cab',
] as const;

export const SOURCE_COUNTRIES = ['Japan', 'South Africa', 'United Kingdom'] as const;

export const VEHICLE_EXEMPTION_FLAGS = [
  'none',
  'deceased_estate',
  'returning_resident',
  'antique_classic',
] as const;

export const DOC_REQUIREMENTS: Record<string, string[]> = {
  purchase_completed: ['purchase_invoice'],
  export_processing: ['export_certificate'],
  shipped: ['bill_of_lading'],
  customs_clearance: [
    'export_certificate',
    'bill_of_lading',
    'road_manifest',
    'condition_report',
    'eaa_certificate',
  ],
};

export const DEFAULT_TAX_RATE_SET = {
  scope: 'all',
  effectiveFrom: new Date().toISOString().slice(0, 10),
  vatPct: 15.5,
  surtaxThresholdYears: 5,
  surtaxPct: 35,
  dutyRates: {
    sedan_station_wagon: 40,
    pickup_up_to_800kg: 25,
    pickup_801_to_1400kg: 40,
    pickup_over_1400kg: 40,
    double_cab: 60,
  },
  carbonTaxBands: [
    { fromCc: 0, toCc: 1500, amountCents: 600 },
    { fromCc: 1501, toCc: 2000, amountCents: 1100 },
    { fromCc: 2001, toCc: 3000, amountCents: 1500 },
    { fromCc: 3001, amountCents: 3000 },
  ],
};