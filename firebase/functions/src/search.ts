import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './db.ts';
import { contextFrom, requireStaff } from './claims.ts';



const PREFIX_END = '\uf8ff';

interface SearchHit {
  caseId: string;
  caseNum: string;
  currentStage: string;
  customerId: string;
  vehicleId: string;
  customerName?: string;
}

export const searchCases = onCall<{
  mode: 'caseNum' | 'customer' | 'vin';
  q: string;
}>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireStaff(ctx, true);
  const { mode, q } = request.data;

  if (q === undefined || q.trim() === '') {
    return { hits: [] as SearchHit[] };
  }
  const needle = q.trim().toLowerCase();

  if (mode === 'caseNum') {
    const upper = needle.toUpperCase();
    const snap = await db
      .collection('import_cases')
      .where('companyId', '==', staff.companyId)
      .where('caseNum', '>=', upper)
      .where('caseNum', '<', upper + PREFIX_END)
      .limit(30)
      .get();
    const hits: SearchHit[] = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        caseId: doc.id,
        caseNum: data.caseNum,
        currentStage: data.currentStage,
        customerId: data.customerId,
        vehicleId: data.vehicleId,
      };
    });
    return { hits };
  }

  if (mode === 'customer') {
    const snap = await db
      .collection('customers')
      .where('companyId', '==', staff.companyId)
      .where('lastNameLower', '>=', needle)
      .where('lastNameLower', '<', needle + PREFIX_END)
      .limit(30)
      .get();
    const customerNames = new Map(snap.docs.map((doc) => [doc.id, doc.data().fullName as string]));
    const customerIds = snap.docs.map((doc) => doc.id);
    if (customerIds.length === 0) {
      return { hits: [] as SearchHit[] };
    }
    const cases = await db
      .collection('import_cases')
      .where('companyId', '==', staff.companyId)
      .where('customerId', 'in', customerIds)
      .limit(30)
      .get();
    const hits: SearchHit[] = cases.docs.map((doc) => {
      const data = doc.data();
      return {
        caseId: doc.id,
        caseNum: data.caseNum,
        currentStage: data.currentStage,
        customerId: data.customerId,
        vehicleId: data.vehicleId,
        customerName: customerNames.get(data.customerId),
      };
    });
    return { hits };
  }

  const upper = needle.toUpperCase();
  const vehicles = await db
    .collection('vehicles')
    .where('companyId', '==', staff.companyId)
    .where('vinChassisUpper', '>=', upper)
    .where('vinChassisUpper', '<', upper + PREFIX_END)
    .limit(30)
    .get();
  const vehicleIds = vehicles.docs.map((doc) => doc.id);
  if (vehicleIds.length === 0) {
    return { hits: [] as SearchHit[] };
  }
  const cases = await db
    .collection('import_cases')
    .where('companyId', '==', staff.companyId)
    .where('vehicleId', 'in', vehicleIds)
    .limit(30)
    .get();
  const hits: SearchHit[] = cases.docs.map((doc) => {
    const data = doc.data();
    return {
      caseId: doc.id,
      caseNum: data.caseNum,
      currentStage: data.currentStage,
      customerId: data.customerId,
      vehicleId: data.vehicleId,
    };
  });
  return { hits };
});