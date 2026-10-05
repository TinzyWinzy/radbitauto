export type CompanyId = string;
export type AppRole = 'platform_admin' | 'admin' | 'staff' | 'customer';
export type MoneyCents = number;
export type VehicleCategory =
  | 'sedan_station_wagon'
  | 'pickup_up_to_800kg'
  | 'pickup_801_to_1400kg'
  | 'pickup_over_1400kg'
  | 'double_cab';

export interface UserDoc {
  email: string;
  fullName: string;
  phoneNumber?: string | null;
  whatsappRef?: string;
  isActive: boolean;
  createdAt: Timestamp;
}

export interface PlatformAdminDoc {
  isActive: boolean;
  createdAt: Timestamp;
}

export interface StaffDoc {
  isPlatformView?: boolean;
  companyId: CompanyId;
  role: Exclude<AppRole, 'customer' | 'platform_admin'>;
  isActive: boolean;
  createdAt: Timestamp;
}

export interface CustomerDoc {
  companyId: CompanyId;
  userId?: string;
  fullName: string;
  lastNameLower: string;
  phoneNumber: string;
  whatsappRef?: string;
  isActive: boolean;
  createdAt: Timestamp;
}

export interface VehicleDoc {
  companyId: CompanyId;
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
  purchasePriceCents: MoneyCents;
  yellowBookValueCents?: MoneyCents;
  eaaStatus: 'none' | 'pending' | 'passed' | 'failed' | 'exempt';
  isCommercial: boolean;
  exemptionFlag: 'none' | 'deceased_estate' | 'returning_resident' | 'antique_classic';
  importLicenceRequired: boolean;
  createdAt: Timestamp;
}

export interface ImportCaseDoc {
  caseNum: string;
  companyId: CompanyId;
  customerId: string;
  vehicleId: string;
  currentStage: string;
  previousStage?: string;
  statusNote?: string;
  currentQuotationId?: string;
  balanceDueCents: MoneyCents;
  quotationVersion: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StageUpdateDoc {
  companyId: CompanyId;
  caseId: string;
  stageKey: string;
  status: string;
  staffId?: string;
  note?: string;
  createdAt: Timestamp;
}

export interface QuotationDoc {
  terms?: {route:string;inclusions:string;exclusions:string;validUntil:string};
  currency?: 'USD';
  calculationVersion?: number;
  purchasePriceCents?: MoneyCents;
  charges?: import('./taxEngine.ts').QuotationCharges;
  taxTotalCents?: MoneyCents;
  calculationSnapshot?: Record<string, unknown>;
  companyId: CompanyId;
  caseId: string;
  version: number;
  valuationBasis: 'invoice' | 'yellow_book';
  cifValueCents: MoneyCents;
  customsDutyCents: MoneyCents;
  surtaxCents: MoneyCents;
  vatCents: MoneyCents;
  carbonTaxCents: MoneyCents;
  totalDueCents: MoneyCents;
  totalPaidCents: MoneyCents;
  status: 'draft' | 'issued' | 'accepted' | 'expired';
  issuedAt?: Timestamp;
  expiredAt?: Timestamp;
  createdAt: Timestamp;
}

export interface PaymentDoc {
  recipient?: 'agency' | 'supplier';
  purpose?: 'pass_through' | 'service_fee' | 'mixed';
  companyId: CompanyId;
  caseId: string;
  quotationId: string;
  amountCents: MoneyCents;
  method: 'EcoCash' | 'InnBucks' | 'Bank' | 'Cash';
  status: 'pending' | 'confirmed' | 'refunded' | 'reversed' | 'superseded';
  idempotencyKey: string;
  providerRef?: string;
  proofPath?: string;
  recordedBy?: string;
  confirmedAt?: Timestamp;
  supersededAt?: Timestamp;
  createdAt: Timestamp;
}

export interface DocumentDoc {
  companyId: CompanyId;
  caseId: string;
  docType: string;
  objectPath: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  storageValid: boolean;
  storageGeneration?: string;
  storageValidatedAt?: Timestamp;
  verified: boolean;
  verifiedAt?: Timestamp;
  verifiedBy?: string;
  uploadedBy: string;
  createdAt: Timestamp;
}

export interface TrackingUpdateDoc {
  companyId: CompanyId;
  caseId: string;
  location: string;
  lat?: number;
  lng?: number;
  source: 'manual' | 'api';
  note?: string;
  recordedBy?: string;
  createdAt: Timestamp;
}

export interface NotificationDoc {
  companyId?: CompanyId;
  caseId?: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  readAt?: Timestamp;
  createdAt: Timestamp;
}

export interface EnquiryDoc {
  companyId: CompanyId;
  customerId: string;
  caseId?: string;
  direction: 'inbound' | 'outbound';
  whatsappRef?: string;
  message: string;
  status: 'open' | 'replied' | 'closed';
  reply?: string;
  repliedBy?: string;
  createdAt: Timestamp;
}

export interface CarbonBand {
  fromCc: number;
  toCc?: number;
  amountCents: MoneyCents;
}

export interface TaxRateSet {
  scope: 'all' | 'company';
  companyId?: CompanyId;
  effectiveFrom: string;
  effectiveTo?: string;
  vatPct: number;
  surtaxThresholdYears: number;
  surtaxPct: number;
  dutyRates: Partial<Record<VehicleCategory, number>>;
  carbonTaxBands: CarbonBand[];
  createdAt: string;
}

export interface StageDefinitionDoc {
  label: string;
  defaultPosition: number;
  isDefaultEnabled: boolean;
}

export interface CompanyStageDoc {
  position: number;
  enabled: boolean;
  customLabel?: string;
}

export interface AuditLogDoc {
  companyId?: CompanyId;
  actorId?: string;
  entityType: string;
  entityId: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: Timestamp;
}

import type { FieldValue, Timestamp as FirebaseTimestamp } from 'firebase-admin/firestore';
export type Timestamp = FirebaseTimestamp | FieldValue;
