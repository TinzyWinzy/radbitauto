import { transactionWriteCheck } from './subscriptions.ts';
import { createHash } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './db.ts';
import type { VehicleCategory, VehicleDoc } from './types.ts';
import { contextFrom, requireStaff } from './claims.ts';
import { ts } from './audits.ts';
import { normalizeVehicleIdentifier } from './vehicleIdentifier.ts';
import {
  SOURCE_COUNTRIES,
  VEHICLE_CATEGORIES,
  VEHICLE_EXEMPTION_FLAGS,
} from './constants.ts';

function sha1(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpsError('invalid-argument', `${field} is required`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'optional text fields must be strings');
  }
  const normalized = value.trim();
  return normalized === '' ? undefined : normalized;
}

function nonNegativeMoney(value: unknown, field: string, fallback: number): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new HttpsError('invalid-argument', `${field} must be a nonnegative integer of cents`);
  }
  return value;
}

function booleanValue(value: unknown, field: string, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'boolean') {
    throw new HttpsError('invalid-argument', `${field} must be a boolean`);
  }
  return value;
}

function optionalPositiveInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new HttpsError('invalid-argument', `${field} must be a positive integer`);
  }
  return value;
}

export const createVehicle = onCall<{
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
}>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireStaff(ctx);
  let vinChassis: string;
  try { vinChassis = normalizeVehicleIdentifier(requiredText(request.data.vinChassis, 'vin_chassis')); }
  catch (error) { throw new HttpsError('invalid-argument', (error as Error).message); }

  const make = requiredText(request.data.make, 'make');
  const model = requiredText(request.data.model, 'model');
  const year = request.data.year;
  if (!Number.isInteger(year) || year < 1960 || year > new Date().getFullYear() + 1) {
    throw new HttpsError('invalid-argument', `invalid year: ${year}`);
  }
  if (!VEHICLE_CATEGORIES.includes(request.data.category)) {
    throw new HttpsError(
      'invalid-argument',
      `invalid category: ${request.data.category}. Must be one of ${VEHICLE_CATEGORIES.join(', ')}`,
    );
  }

  const sourceCountry = optionalText(request.data.sourceCountry) ?? 'Japan';
  if (!SOURCE_COUNTRIES.includes(sourceCountry as (typeof SOURCE_COUNTRIES)[number])) {
    throw new HttpsError(
      'invalid-argument',
      `invalid source country: ${sourceCountry}. Must be one of ${SOURCE_COUNTRIES.join(', ')}`,
    );
  }
  const exemptionFlag = optionalText(request.data.exemptionFlag) ?? 'none';
  if (!VEHICLE_EXEMPTION_FLAGS.includes(exemptionFlag as VehicleDoc['exemptionFlag'])) {
    throw new HttpsError(
      'invalid-argument',
      `invalid exemption: ${exemptionFlag}. Must be one of ${VEHICLE_EXEMPTION_FLAGS.join(', ')}`,
    );
  }
  const engineCc = optionalPositiveInteger(request.data.engineCc, 'engineCc');

  const purchasePriceCents = nonNegativeMoney(
    request.data.purchasePriceCents,
    'purchasePriceCents',
    0,
  );
  const yellowBookValueCents = nonNegativeMoney(
    request.data.yellowBookValueCents,
    'yellowBookValueCents',
    0,
  );
  const vehicle: VehicleDoc = {
    companyId: staff.companyId,
    customerIds: [],
    vinChassisUpper: vinChassis,
    engineNumber: optionalText(request.data.engineNumber),
    engineCc,
    make,
    model,
    variant: optionalText(request.data.variant),
    year,
    sourceCountry,
    category: request.data.category,
    purchasePriceCents,
    yellowBookValueCents: yellowBookValueCents > 0 ? yellowBookValueCents : undefined,
    eaaStatus: 'none',
    isCommercial: booleanValue(request.data.isCommercial, 'isCommercial', false),
    exemptionFlag: exemptionFlag as VehicleDoc['exemptionFlag'],
    importLicenceRequired: booleanValue(
      request.data.importLicenceRequired,
      'importLicenceRequired',
      false,
    ),
    createdAt: ts(),
  };

  const vehicleId = sha1(`${staff.companyId}|${vinChassis}`);
  const ref = db.collection('vehicles').doc(vehicleId);
  await db.runTransaction(async (txn) => {
    await transactionWriteCheck(txn, staff.companyId);
    const existing = await txn.get(ref);
    if (existing.exists) {
      throw new HttpsError('already-exists', 'vehicle already exists for this company');
    }
    txn.set(ref, vehicle);
    txn.set(db.collection('audit_log').doc(), {
      companyId: staff.companyId,
      actorId: ctx.uid,
      entityType: 'vehicles',
      entityId: vehicleId,
      action: 'create',
      detail: { vin: vinChassis },
      createdAt: ts(),
    });
  });

  return { vehicleId };
});
