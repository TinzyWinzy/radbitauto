import type { Timestamp } from 'firebase/firestore';

export type AppRole = 'platform_admin' | 'admin' | 'staff' | 'customer';
export type VehicleCategory =
  | 'sedan_station_wagon'
  | 'pickup_up_to_800kg'
  | 'pickup_801_to_1400kg'
  | 'pickup_over_1400kg'
  | 'double_cab';

export interface ImportCaseDoc {
  nextAction?: {title:string;responsible:string;dueDate:string;state:string};
  caseNum: string;
  companyId: string;
  customerId: string;
  vehicleId: string;
  currentStage: string;
  previousStage?: string;
  statusNote?: string;
  currentQuotationId?: string;
  balanceDueCents: number;
  quotationVersion: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CustomerDoc {
  companyId: string;
  userId?: string;
  fullName: string;
  lastNameLower: string;
  phoneNumber: string;
  whatsappRef?: string;
  isActive: boolean;
  createdAt: Timestamp;
}

export interface VehicleDoc {
  allocation?: 'dealer_stock' | 'dealer_acquisition';
  companyId: string;
  customerIds?: string[];
  vinChassisUpper: string;
  engineNumber?: string;
  engineCc?: number;
  make: string;
  model: string;
  variant?: string;
  year: number;
  sourceCountry: string;
  category: VehicleCategory;
  purchasePriceCents: number;
  yellowBookValueCents?: number;
  eaaStatus: string;
  isCommercial: boolean;
  exemptionFlag: string;
  importLicenceRequired: boolean;
  createdAt: Timestamp;
}

export interface StaffDoc {
  isPlatformView?:boolean;
  companyId: string;
  role: 'admin' | 'staff';
  isActive: boolean;
  createdAt: Timestamp;
}

export interface CompanyDoc {
  businessFocus?: 'retail' | 'imports' | 'hybrid';
  subscription?: {version?:number;status?:string;accessUntil?:Timestamp;planId?:string};
  operationMode?: 'sourcing' | 'clearing' | 'both';
  slug: string;
  name: string;
  casePrefix: string;
  contactWhatsapp: string;
  primaryColor?: string;
  secondaryColor?: string;
  defaultPort?: 'Durban' | 'Beira' | 'Walvis Bay' | 'Dar es Salaam' | 'Maputo';
  isActive: boolean;
  createdAt: Timestamp;
}

export interface CompanySettingsDoc {
  currency: string;
  paymentMethods: string[];
}

export interface QuotationDoc {
  terms?: {route:string;inclusions:string;exclusions:string;validUntil:string};
  acceptedBy?: string;
  currency?: 'USD';
  calculationVersion?: number;
  purchasePriceCents?: number;
  charges?: QuotationCharges;
  taxTotalCents?: number;
  companyId: string;
  caseId: string;
  version: number;
  valuationBasis: 'invoice' | 'yellow_book';
  cifValueCents: number;
  customsDutyCents: number;
  surtaxCents: number;
  vatCents: number;
  carbonTaxCents: number;
  totalDueCents: number;
  totalPaidCents: number;
  status: string;
  issuedAt?: Timestamp;
  createdAt: Timestamp;
}

export interface PaymentDocLite {
  recipient?: 'agency' | 'supplier';
  purpose?: 'pass_through' | 'service_fee' | 'mixed';
  id: string;
  quotationId: string;
  amountCents: number;
  method: string;
  status: string;
  idempotencyKey?: string;
  providerRef?: string;
  proofPath?: string;
  createdAt: Timestamp;
}

export interface StageUpdateDocLite {
  id: string;
  stageKey: string;
  status: string;
  note?: string;
  createdAt: Timestamp;
}

export interface SearchHit {
  caseId: string;
  caseNum: string;
  currentStage: string;
  customerId: string;
  vehicleId: string;
  customerName?: string;
}

export interface QuotationResult {
  purchasePriceCents: number;
  charges: QuotationCharges;
  taxTotalCents: number;
  valuationBasis: 'invoice' | 'yellow_book';
  valuationCents: number;
  cifValueCents: number;
  customsDutyCents: number;
  surtaxCents: number;
  vatCents: number;
  carbonTaxCents: number;
  totalDueCents: number;
  applied: {
    dutyPct: number;
    surtaxPct: number;
    vatPct: number;
    surtaxThresholdYears: number;
    vehicleAgeYears: number;
  };
}

export interface QuotationCharges {
  freightCents: number;
  insuranceCents: number;
  borderFreightCents: number;
  portChargesCents: number;
  localDeliveryCents: number;
  agencyFeeCents: number;
}

export interface StageDef {
  key: string;
  label: string;
}

export const STAGES: StageDef[] = [
  { key: 'enquiry', label: 'Enquiry' },
  { key: 'quotation', label: 'Quotation' },
  { key: 'payment_confirmed', label: 'Payment confirmed' },
  { key: 'vehicle_sourced', label: 'Vehicle sourced' },
  { key: 'purchase_completed', label: 'Purchase completed' },
  { key: 'export_processing', label: 'Export processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'arrived', label: 'Arrived' },
  { key: 'customs_clearance', label: 'Customs clearance' },
  { key: 'duties_charges', label: 'Duties & charges' },
  { key: 'registration_compliance', label: 'Registration & compliance' },
  { key: 'ready_for_collection', label: 'Ready for collection' },
  { key: 'delivered', label: 'Delivered' },
];

export const VEHICLE_CATEGORIES: { value: VehicleCategory; label: string }[] = [
  { value: 'sedan_station_wagon', label: 'Sedan / station wagon' },
  { value: 'pickup_up_to_800kg', label: 'Pickup up to 800kg' },
  { value: 'pickup_801_to_1400kg', label: 'Pickup 801–1,400kg' },
  { value: 'pickup_over_1400kg', label: 'Pickup over 1,400kg' },
  { value: 'double_cab', label: 'Double cab' },
];

export const PAYMENT_METHODS = ['EcoCash', 'InnBucks', 'Bank', 'Cash'] as const;
export const EXEMPTION_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'deceased_estate', label: 'Deceased estate' },
  { value: 'returning_resident', label: 'Returning resident' },
  { value: 'antique_classic', label: 'Antique / classic' },
];

export const SOURCE_COUNTRIES = ['Japan', 'South Africa', 'United Kingdom'] as const;

export function stageLabel(key: string): string {
  return STAGES.find((s) => s.key === key)?.label ?? key;
}

export function nextStageKey(current: string): string | undefined {
  const i = STAGES.findIndex((s) => s.key === current);
  if (i < 0 || i >= STAGES.length - 1) return undefined;
  return STAGES[i + 1].key;
}
