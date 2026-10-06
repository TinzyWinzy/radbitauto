import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type {
  CustomerDoc,
  ImportCaseDoc,
  QuotationDoc,
  QuotationResult,
  QuotationCharges,
  SearchHit,
  VehicleCategory,
} from './types';

export class ApiError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

function toApiError(e: unknown): ApiError {
  const err = e as { code?: string; message?: string; details?: unknown };
  let message = 'Unexpected error. Please try again.';
  const d = err.details as unknown;
  if (typeof d === 'string' && d !== '') {
    message = d;
  } else if (
    d !== null &&
    typeof d === 'object' &&
    'message' in (d as Record<string, unknown>) &&
    typeof (d as Record<string, unknown>).message === 'string'
  ) {
    message = (d as Record<string, unknown>).message as string;
  } else if (typeof err.message === 'string' && err.message !== '') {
    message = err.message;
  }
  return new ApiError(message, err.code ?? 'unknown');
}

function make<TIn, TOut>(name: string): (data: TIn) => Promise<TOut> {
  const fn = httpsCallable<TIn, TOut>(functions, name);
  return async (data: TIn): Promise<TOut> => {
    try {
      const res = await fn(data);
      return res.data;
    } catch (e: unknown) {
      throw toApiError(e);
    }
  };
}

export interface BootstrapCompanyInput {
  slug: string;
  name: string;
  casePrefix: string;
  contactWhatsapp: string;
  adminEmail: string;
  adminFullName: string;
  adminPhoneNumber?: string;
  primaryColor?: string;
  secondaryColor?: string;
  defaultPort?: 'Durban' | 'Beira' | 'Walvis Bay';
  currency?: string;
  paymentMethods?: string[];
}

export interface LinkCustomerInput {
  customerId?: string;
  userId?: string;
  email?: string;
  fullName: string;
  phoneNumber: string;
  whatsappRef?: string;
}

export interface CreateStaffInput {
  email: string;
  fullName: string;
  phoneNumber?: string;
  role: 'staff' | 'admin';
}

export interface CreateVehicleInput {
  vinChassis: string;
  make: string;
  model: string;
  year: number;
  category: VehicleCategory;
  sourceCountry?: string;
  purchasePriceCents?: number;
  yellowBookValueCents?: number;
  engineCc?: number;
  engineNumber?: string;
  variant?: string;
  isCommercial?: boolean;
  exemptionFlag?: string;
  importLicenceRequired?: boolean;
}

export interface SubscriptionOverview { planId:'solo'|'dealer'; name:string; monthlyCents:number; seats:number; activeVehicles:number; status:string; accessUntil:number|null; daysRemaining:number|null; writable:boolean; managed:boolean; usedSeats:number; usedActiveVehicles:number; invoiceReference:string; requestedPlan:string|null; }
export const api = {
  platformSubscriptionReport: make<{companyId:string},SubscriptionOverview & {agencyName:string;storageBytes:number|null;storageMeasuredDate:string|null;supportMinutes30Days:number;supportLimited:boolean}>('platformSubscriptionReport'),
  logAgencySupport: make<{companyId:string;minutes:number;reference:string},{saved:boolean}>('logAgencySupport'),
  agencyUsageHistory: make<Record<string,never>,{rows:{date:string;storageBytes:number;storageObjects:number}[]}>('agencyUsageHistory'),
  subscriptionOverview: make<Record<string,never>,SubscriptionOverview>('subscriptionOverview'),
  requestSubscriptionPlan: make<{planId:'solo'|'dealer'},{requested:boolean}>('requestSubscriptionPlan'),
  exportAgencyRecords: make<{collection:string;cursor?:string;parentId?:string;childCollection?:string},{rows:Record<string,unknown>[];nextCursor:string|null}>('exportAgencyRecords'),
  dashboardOverview: make<Record<string, never>, { cases: number; activeCases: number; outstandingCents: number; attentionCount: number; tasks: { caseId: string; caseNum: string; kind: 'quotation' | 'payment' | 'document'; title: string; detail: string }[] }>('dashboardOverview'),
  createInvitation: make<{ email: string; role: 'staff' | 'customer'; customerId?: string }, { token: string; expiresInDays: number }>('createInvitation'),
  acceptInvitation: make<{ token: string }, { accepted: boolean }>('acceptInvitation'),
  acceptQuotation: make<{ quotationId: string }, { accepted: boolean }>('acceptQuotation'),
  correctPayment: make<{ paymentId: string; action: 'reverse' | 'refund'; reason: string; reference: string }, { corrected: boolean }>('correctPayment'),
  agencyReport: make<{ cursor?: string }, { cases: number; outstandingCents: number; collectedCents: number; supplierPaidCents:number;passThroughCents:number;feeCollectionsCents:number;unclassifiedCents:number;quotedFeesCents: number; rows: { id: string; caseNum: string; stage: string; balanceDueCents: number }[]; nextCursor: string | null }>('agencyReport'),
  setAgencyAccess: make<{ companyId: string; status: 'trial' | 'active' | 'paused' | 'suspended'; planId:'solo'|'dealer'; accessUntil:number; invoiceReference?: string; paymentReference?:string }, { saved: boolean }>('setAgencyAccess'),
  saveCaseSupplier: make<{ caseId: string; supplierName: string; stockReference: string; purchaseReference: string; listingUrl: string }, { saved: boolean }>('saveCaseSupplier'),
  createCustomerRecord: make<{ fullName: string; phoneNumber: string; idempotencyKey: string }, { customerId: string }>('createCustomerRecord'),
  registerAgency: make<{ businessFocus?: 'retail' | 'imports' | 'hybrid'; name: string; slug: string; casePrefix: string; contactWhatsapp: string; primaryColor: string; operationMode: 'sourcing' | 'clearing' | 'both'; defaultPort: string }, { companyId: string }>('registerAgency'),
  bootstrapCompany: make<BootstrapCompanyInput, { companyId: string; adminUid: string; tempPassword: string | null }>(
    'bootstrapCompany',
  ),
  ensureBaseline: make<{ companyId: string }, { stageDefinitions: number; taxRateSeeded: boolean }>(
    'ensureBaseline',
  ),
  createStaff: make<CreateStaffInput, { staffUid: string; tempPassword: string }>('createStaff'),
  linkCustomer: make<LinkCustomerInput, { customerId: string }>('linkCustomer'),
  deactivateAccount: make<{ userId: string }, { userId: string; isActive: false }>('deactivateAccount'),
  createVehicle: make<CreateVehicleInput, { vehicleId: string }>('createVehicle'),
  createCase: make<
    { customerId: string; vehicleId?: string; statusNote?: string },
    { caseId: string; caseNum: string; currentStage: string }
  >('createCase'),
  attachCaseVehicle: make<{ caseId: string; vehicleId: string }, { caseId: string; vehicleId: string }>('attachCaseVehicle'),
  calculateImportQuotationView: make<{ vehicleId: string; charges?: Partial<QuotationCharges> }, QuotationResult>(
    'calculateImportQuotationView',
  ),
  issueQuotation: make<
    { caseId: string; charges?: Partial<QuotationCharges>; terms?: {route:string;inclusions:string;exclusions:string;validUntil:string} },
    QuotationResult & { quotationId: string; version: number; totalPaidCents: number; balanceDueCents: number }
  >('issueQuotation'),
  advanceImportStage: make<
    { caseId: string; toStage: string; note?: string },
    { caseId: string; fromStage: string; toStage: string; label: string }
  >('advanceImportStage'),
  recordPayment: make<
    {
      recipient?: 'agency' | 'supplier';
      purpose?: 'pass_through' | 'service_fee' | 'mixed';
      caseId: string;
      amountCents: number;
      method: 'EcoCash' | 'InnBucks' | 'Bank' | 'Cash';
      idempotencyKey: string;
      providerRef?: string;
      proofPath?: string;
      quotationId: string;
    },
    { paymentId: string; status: 'pending' | 'confirmed' | 'superseded' | 'refunded' | 'reversed' }
  >('recordPayment'),
  confirmPayment: make<{ paymentId: string; note?: string }, { paymentId: string; status: 'confirmed' }>(
    'confirmPayment',
  ),
  clearanceReady: make<{ caseId: string }, { ready: boolean; missingDocs: string[] }>('clearanceReady'),
  verifyDocument: make<
    { caseId: string; documentId: string; verified: boolean },
    { documentId: string; verified: boolean }
  >('verifyDocument'),
  cleanupDocumentUpload: make<
    { caseId: string; documentId: string },
    { documentId: string; deleted: boolean }
  >('cleanupDocumentUpload'),
  searchCases: make<{ mode: 'caseNum' | 'customer' | 'vin'; q: string }, { hits: SearchHit[] }>(
    'searchCases',
  ),
};

export type { CustomerDoc, ImportCaseDoc, QuotationDoc };
