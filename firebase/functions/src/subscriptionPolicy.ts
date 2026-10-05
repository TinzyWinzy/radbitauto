export const PLANS = {
  solo: { name: 'Solo', monthlyCents: 1500, seats: 2, activeVehicles: 15 },
  dealer: { name: 'Dealer', monthlyCents: 2900, seats: 5, activeVehicles: 50 },
} as const;
export type PlanId = keyof typeof PLANS;
export function subscriptionState(subscription: any, now = Date.now()) {
  const planId: PlanId = subscription?.planId === 'solo' ? 'solo' : 'dealer';
  const until = subscription?.accessUntil?.toMillis?.() ?? subscription?.accessUntil;
  const managed = subscription?.version === 1;
  const status = managed ? subscription.status : 'legacy_pilot';
  const writable = managed && ['solo','dealer'].includes(subscription?.planId) && ['trial', 'active'].includes(status) && Number.isFinite(until) && until > now;
  return { planId, ...PLANS[planId], status: managed && ['trial', 'active'].includes(status) && !writable ? 'expired' : status,
    accessUntil: Number.isFinite(until) ? until : null, writable: managed ? writable : subscription?.status !== 'suspended',
    managed, daysRemaining: Number.isFinite(until) ? Math.max(0, Math.ceil((until - now) / 86400000)) : null };
}
export function activeVehicleKeys(stock: any[], cases: any[], acquisitions: any[]) {
  const keys = new Set<string>();
  for (const row of stock) if (['available', 'reserved'].includes(row.status)) keys.add(`vehicle:${row.vehicleId ?? row.id}`);
  for (const row of cases) if (row.currentStage !== 'delivered') keys.add(row.vehicleId ? `vehicle:${row.vehicleId}` : `case:${row.id}`);
  for (const row of acquisitions) if (row.stage !== 'stocked') keys.add(`vehicle:${row.vehicleId ?? row.id}`);
  return keys;
}
