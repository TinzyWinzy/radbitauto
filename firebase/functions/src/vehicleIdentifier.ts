export function normalizeVehicleIdentifier(value: string): string {
  const normalized = value.trim().toUpperCase();
  const vin = /^[A-HJ-NPR-Z0-9]{17}$/;
  const japaneseFrame = /^[A-Z0-9]{2,12}-[0-9]{5,10}$/;
  if (!vin.test(normalized) && !japaneseFrame.test(normalized)) {
    throw new Error('Enter a 17-character VIN or chassis number such as NHP10-1234567');
  }
  return normalized;
}
