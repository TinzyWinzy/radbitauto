import { HttpsError } from 'firebase-functions/v2/https';

export const STOCK_CHOICES = {
  fuel: ['Petrol', 'Diesel', 'Hybrid', 'Electric', 'Other'],
  transmission: ['Automatic', 'Manual', 'CVT', 'Other'],
  bodyType: ['Sedan', 'Hatchback', 'SUV', 'Wagon', 'Pickup', 'Van', 'Bus', 'Truck', 'Other'],
};
export function validateStockSpecs(value: unknown): Record<string, string | number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpsError('invalid-argument', 'Vehicle specifications must be an object');
  const input = value as Record<string, unknown>, result: Record<string, string | number> = {};
  for (const key of ['make', 'model']) {
    const v = input[key];
    if (v === '' || v === undefined) continue;
    if (typeof v !== 'string' || !v.trim() || v.length > 80) throw new HttpsError('invalid-argument', `Invalid ${key}`);
    result[key] = v.trim();
  }
  for (const [key, max] of [['year', new Date().getFullYear() + 1], ['mileageKm', 3000000], ['engineCc', 30000]] as const) {
    const v = input[key];
    if (v === undefined || v === '') continue;
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < (key === 'year' ? 1960 : key === 'engineCc' ? 1 : 0) || v > max) throw new HttpsError('invalid-argument', `Invalid ${key}`);
    result[key] = v;
  }
  for (const key of ['fuel', 'transmission', 'bodyType'] as const) {
    const v = input[key];
    if (v === undefined || v === '') continue;
    if (typeof v !== 'string' || !STOCK_CHOICES[key].includes(v)) throw new HttpsError('invalid-argument', `Invalid ${key}`);
    result[key] = v;
  }
  return result;
}
/** Explicit whitelist. Never return identifiers, acquisition costs or customer links. */
export function stockSpecsProjection(stock: Record<string, any>, vehicle: Record<string, any> = {}) {
  const combined = { make: vehicle.make, model: vehicle.model, year: vehicle.year, engineCc: vehicle.engineCc, ...stock.publicSpecs };
  const result: Record<string, string | number> = {};
  for (const key of ['make', 'model', 'year', 'engineCc', 'mileageKm', 'fuel', 'transmission', 'bodyType']) {
    if (typeof combined[key] === 'string' || typeof combined[key] === 'number') result[key] = combined[key];
  }
  return result;
}
