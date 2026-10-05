import { useEffect, useMemo, useState } from 'react';
import type { Query } from 'firebase/firestore';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type {
  CompanyDoc,
  CompanySettingsDoc,
  CustomerDoc,
  ImportCaseDoc,
  PaymentDocLite,
  QuotationDoc,
  StageUpdateDocLite,
  VehicleDoc,
} from './types';
import type { StaffDoc } from './types';

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function useLiveQuery<T>(q: Query | null): { data: T[]; loading: boolean; error: string | null } {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData([]);
    setError(null);
    setLoading(Boolean(q));
    if (!q) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
        setLoading(false);
        setError(null);
      },
      (err) => {
        setLoading(false);
        setError((err as Error)?.message ?? 'Failed to load data');
      },
    );
    return () => unsub();
  }, [q]);

  return { data, loading, error };
}

export function useCases(companyId: string | undefined): {
  data: (ImportCaseDoc & { id: string })[];
  loading: boolean;
  error: string | null;
} {
  const q = useMemo(() => {
    if (!companyId) return null;
    return query(
      collection(db, 'import_cases'),
      where('companyId', '==', companyId),
      orderBy('updatedAt', 'desc'),
      limit(100),
    );
  }, [companyId]);
  return useLiveQuery<ImportCaseDoc & { id: string }>(q);
}

export function useCustomerCases(
  companyId: string | undefined,
  customerId: string | undefined,
): {
  data: (ImportCaseDoc & { id: string })[];
  loading: boolean;
  error: string | null;
} {
  const q = useMemo(() => {
    if (!companyId || !customerId) return null;
    return query(
      collection(db, 'import_cases'),
      where('companyId', '==', companyId),
      where('customerId', '==', customerId),
      orderBy('updatedAt', 'desc'),
    );
  }, [companyId, customerId]);
  return useLiveQuery<ImportCaseDoc & { id: string }>(q);
}

export function useCustomers(companyId: string | undefined): {
  data: (CustomerDoc & { id: string })[];
  loading: boolean;
  error: string | null;
} {
  const q = useMemo(() => {
    if (!companyId) return null;
    return query(
      collection(db, 'customers'),
      where('companyId', '==', companyId),
      orderBy('createdAt', 'desc'),
      limit(100),
    );
  }, [companyId]);
  return useLiveQuery<CustomerDoc & { id: string }>(q);
}

export function useVehicles(companyId: string | undefined): {
  data: (VehicleDoc & { id: string })[];
  loading: boolean;
  error: string | null;
} {
  const q = useMemo(() => {
    if (!companyId) return null;
    return query(
      collection(db, 'vehicles'),
      where('companyId', '==', companyId),
      orderBy('createdAt', 'desc'),
      limit(100),
    );
  }, [companyId]);
  return useLiveQuery<VehicleDoc & { id: string }>(q);
}

export function useUserNames(uids: string[]): Record<string, { fullName: string; email: string }> {
  const [names, setNames] = useState<Record<string, { fullName: string; email: string }>>({});
  const key = uids.slice().sort().join('|');
  useEffect(() => {
    if (uids.length === 0) {
      setNames({});
      return;
    }
    const unsubs = uids.map((uid) =>
      onSnapshot(doc(db, 'users', uid), (snap) => {
        setNames((prev) => {
          const data = snap.data() as { fullName?: string; email?: string } | undefined;
          if (!snap.exists() || !data) {
            const next = { ...prev };
            delete next[uid];
            return next;
          }
          return { ...prev, [uid]: { fullName: data.fullName ?? uid, email: data.email ?? '' } };
        });
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [key]);
  return names;
}

export function useStaff(companyId: string | undefined): {
  data: (StaffDoc & { id: string })[];
  loading: boolean;
  error: string | null;
} {
  const q = useMemo(() => {
    if (!companyId) return null;
    return query(collection(db, 'staff'), where('companyId', '==', companyId), limit(100));
  }, [companyId]);
  const result=useLiveQuery<StaffDoc & { id: string }>(q);
  return {...result,data:result.data.filter(member=>member.isPlatformView!==true)};
}

export function useCompanyDoc(companyId: string | undefined): {
  data: (CompanyDoc & { id: string }) | null;
  loading: boolean;
} {
  const [data, setData] = useState<(CompanyDoc & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    const ref = doc(db, 'companies', companyId);
    const unsub = onSnapshot(ref, (snap) => {
      setData(snap.exists() ? ({ id: snap.id, ...(snap.data() as CompanyDoc) } as CompanyDoc & { id: string }) : null);
      setLoading(false);
    });
    return () => unsub();
  }, [companyId]);
  return { data, loading };
}

export function useCompanySettings(companyId: string | undefined): CompanySettingsDoc | null {
  const [data, setData] = useState<CompanySettingsDoc | null>(null);
  useEffect(() => {
    if (!companyId) return;
    const ref = doc(db, 'company_settings', companyId);
    const unsub = onSnapshot(ref, (snap) => {
      setData(snap.data() as CompanySettingsDoc | null);
    });
    return () => unsub();
  }, [companyId]);
  return data;
}

export function useCaseDetail(caseId: string | undefined): {
  caseDoc: (ImportCaseDoc & { id: string }) | null;
  vehicle: (VehicleDoc & { id: string }) | null;
  customer: (CustomerDoc & { id: string }) | null;
  quotations: (QuotationDoc & { id: string })[];
  payments: (PaymentDocLite & { id: string })[];
  updates: (StageUpdateDocLite & { id: string })[];
  loading: boolean;
  quotationsLoading: boolean;
  quotationsError: string | null;
  error: string | null;
} {
  const [caseDoc, setCaseDoc] = useState<(ImportCaseDoc & { id: string }) | null>(null);
  const [vehicle, setVehicle] = useState<(VehicleDoc & { id: string }) | null>(null);
  const [customer, setCustomer] = useState<(CustomerDoc & { id: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!caseId) {
      setCaseDoc(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const ref = doc(db, 'import_cases', caseId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setCaseDoc(snap.exists() ? ({ id: snap.id, ...(snap.data() as ImportCaseDoc) } as ImportCaseDoc & { id: string }) : null);
        setLoading(false);
      },
      (err) => {
        setError((err as Error)?.message ?? 'Failed to load case');
        setLoading(false);
      },
    );
    return () => unsub();
  }, [caseId]);

  useEffect(() => {
    if (!caseDoc?.vehicleId) {
      setVehicle(null);
      return;
    }
    const ref = doc(db, 'vehicles', caseDoc.vehicleId);
    const unsub = onSnapshot(ref, (snap) => {
      setVehicle(snap.exists() ? ({ id: snap.id, ...(snap.data() as VehicleDoc) } as VehicleDoc & { id: string }) : null);
    });
    return () => unsub();
  }, [caseDoc?.vehicleId]);

  useEffect(() => {
    if (!caseDoc?.customerId) {
      setCustomer(null);
      return;
    }
    const ref = doc(db, 'customers', caseDoc.customerId);
    const unsub = onSnapshot(ref, (snap) => {
      setCustomer(snap.exists() ? ({ id: snap.id, ...(snap.data() as CustomerDoc) } as CustomerDoc & { id: string }) : null);
    });
    return () => unsub();
  }, [caseDoc?.customerId]);

  const quotations = useLiveQuery<QuotationDoc & { id: string }>(
    useMemo(() => {
      if (!caseId || !caseDoc?.companyId) return null;
      return query(
        collection(db, 'quotations'),
        where('companyId', '==', caseDoc.companyId),
        where('caseId', '==', caseId),
        orderBy('version', 'desc'),
        limit(5),
      );
    }, [caseId, caseDoc?.companyId]),
  );

  const payments = useLiveQuery<PaymentDocLite & { id: string }>(
    useMemo(() => {
      if (!caseId || !caseDoc?.companyId) return null;
      return query(
        collection(db, 'payments'),
        where('companyId', '==', caseDoc.companyId),
        where('caseId', '==', caseId),
        orderBy('createdAt', 'desc'),
      );
    }, [caseId, caseDoc?.companyId]),
  );

  const updates = useLiveQuery<StageUpdateDocLite & { id: string }>(
    useMemo(() => {
      if (!caseId) return null;
      return query(
        collection(db, 'import_cases', caseId, 'stage_updates'),
        orderBy('createdAt', 'desc'),
        limit(30),
      );
    }, [caseId]),
  );

  return {
    caseDoc,
    vehicle,
    customer,
    quotations: quotations.data,
    payments: payments.data,
    updates: updates.data,
    loading,
    quotationsLoading: quotations.loading,
    quotationsError: quotations.error,
    error,
  };
}

export function useCaseDocuments(caseId: string | undefined): {
  data: ({ id: string; docType: string; fileName?: string; objectPath?: string; storageValid?: boolean; verified?: boolean; createdAt?: unknown } & Record<string, unknown>)[];
  loading: boolean;
  error: string | null;
} {
  const q = useMemo(() => {
    if (!caseId) return null;
    return query(collection(db, 'import_cases', caseId, 'documents'), orderBy('createdAt', 'desc'), limit(30));
  }, [caseId]);
  const res = useLiveQuery<({ id: string; docType: string } & Record<string, unknown>)>(q);
  return { data: res.data as never, loading: res.loading, error: res.error };
}

export function useCaseTracking(caseId: string | undefined): {
  data: ({ id: string; location: string; note?: string; createdAt?: unknown } & Record<string, unknown>)[];
  loading: boolean;
  error: string | null;
} {
  const q = useMemo(() => {
    if (!caseId) return null;
    // staff-written live location posts; fallback to stage_updates timeline already shown
    return query(collection(db, 'import_cases', caseId, 'tracking'), orderBy('createdAt', 'desc'), limit(20));
  }, [caseId]);
  const res = useLiveQuery<({ id: string; location: string } & Record<string, unknown>)>(q);
  return { data: res.data as never, loading: res.loading, error: res.error };
}

export function useCompanyStages(companyId: string | undefined): { keys: string[]; labels: Record<string, string> } {  const [keys, setKeys] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, 'companies', companyId, 'stages'), orderBy('position', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const enabled = snap.docs.filter((d) => (d.data() as { enabled?: boolean }).enabled === true);
      setKeys(enabled.map((d) => d.id));
      const map: Record<string, string> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as { customLabel?: string };
        if (data.customLabel) map[d.id] = data.customLabel;
      });
      setLabels(map);
    });
    return () => unsub();
  }, [companyId]);
  return { keys, labels };
}

export function useVehiclesByIds(
  companyId: string | undefined,
  ids: string[],
): Record<string, VehicleDoc & { id: string }> {
  const [byId, setById] = useState<Record<string, VehicleDoc & { id: string }>>({});
  const key = ids.slice().sort().join('|');
  useEffect(() => {
    if (!companyId || ids.length === 0) {
      setById({});
      return;
    }
    setById({});
    const unsubs = [...new Set(ids.filter(Boolean))].map((id) =>
      onSnapshot(
        doc(db, 'vehicles', id),
        (snap) => {
          setById((prev) => {
            if (!snap.exists()) {
              const next = { ...prev };
              delete next[id];
              return next;
            }
            return { ...prev, [id]: { id, ...(snap.data() as VehicleDoc) } };
          });
        },
        () => undefined,
      ),
    );
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [companyId, key]);
  return byId;
}

export interface NotificationLite {
  id: string;
  title: string;
  body: string;
  type: string;
  caseId?: string;
  createdAt?: unknown;
}

export function useNotifications(uid: string | undefined): NotificationLite[] {
  const [items, setItems] = useState<NotificationLite[]>([]);
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(20));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<NotificationLite, 'id'>) })));
    });
    return () => unsub();
  }, [uid]);
  return items;
}

export interface EnquiryLite {
  id: string;
  message: string;
  status: string;
  reply?: string;
  customerId: string;
  caseId?: string;
  createdAt?: unknown;
}

export function useCaseEnquiries(companyId: string | undefined, caseId: string | undefined): EnquiryLite[] {
  const [items, setItems] = useState<EnquiryLite[]>([]);
  useEffect(() => {
    if (!companyId || !caseId) return;
    const q = query(
      collection(db, 'enquiries'),
      where('companyId', '==', companyId),
      where('caseId', '==', caseId),
      limit(20),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EnquiryLite, 'id'>) }));
        rows.sort((a, b) => {
          const at = (a.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
          const bt = (b.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
          return bt - at;
        });
        setItems(rows);
      },
      () => setItems([]),
    );
    return () => unsub();
  }, [companyId, caseId]);
  return items;
}

export interface AuditLite {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId?: string;
  createdAt?: unknown;
}

export function useCaseAudit(companyId: string | undefined, caseId: string | undefined): AuditLite[] {
  const [items, setItems] = useState<AuditLite[]>([]);
  useEffect(() => {
    if (!companyId || !caseId) return;
    const q = query(collection(db, 'audit_log'), where('companyId', '==', companyId), limit(50));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLite, 'id'>) }))
          .filter((r) => r.entityId === caseId || (r as { detail?: { caseId?: string } }).detail?.caseId === caseId);
        setItems(rows.slice(0, 20));
      },
      () => setItems([]),
    );
    return () => unsub();
  }, [companyId, caseId]);
  return items;
}
