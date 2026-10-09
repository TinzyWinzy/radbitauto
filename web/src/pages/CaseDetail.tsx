import CaseNextAction from '../components/CaseNextAction';
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, doc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { auth } from '../lib/firebase';
import { db, storage } from '../lib/firebaseData';
import {
  useCaseAudit,
  useCaseDetail,
  useCaseDocuments,
  useCaseEnquiries,
  useCaseTracking,
  useCompanyDoc,
  useCompanySettings,
  useCompanyStages,
  useVehicles,
} from '../lib/hooks';
import { stageLabel } from '../lib/types';
import { dateTime } from '../lib/format';
import { whatsappLink, shareCaseUpdate } from '../lib/share';
import { Badge, Button, Card, Field, Input, MoneyText, Select, StageBadge, TextArea } from '../components/ui';
import { ErrorState, Spinner } from '../components/status';
import JourneyRail from '../components/journey';
import CaseSupplier from '../components/CaseSupplier';
import { FinancialDocuments, PaymentCorrection } from '../components/FinancialDocuments';
import type { ImportCaseDoc, PaymentDocLite, QuotationResult, QuotationCharges } from '../lib/types';

type QuoteView = {
  terms?: {route:string;inclusions:string;exclusions:string;validUntil:string};
  acceptedBy?: string;
  charges?: QuotationCharges;
  purchasePriceCents?: number;
  cifValueCents?: number;
  customsDutyCents?: number;
  surtaxCents?: number;
  vatCents?: number;
  carbonTaxCents?: number;
  calculationVersion?: number;
  id: string;
  companyId: string;
  caseId: string;
  version: number;
  valuationBasis: string;
  totalDueCents: number;
  totalPaidCents: number;
  status: string;
};

export default function CaseDetail() {
  const { caseId } = useParams<{ caseId: string }>();
  const { claims } = useAuth();
  const isStaff = claims.appRole === 'staff' || claims.appRole === 'admin';
  const {
    caseDoc,
    vehicle,
    customer,
    quotations,
    payments,
    updates,
    loading: caseLoading,
    quotationsLoading,
    error,
  } = useCaseDetail(caseId);
  const { keys: enabledStages, labels: stageLabels } = useCompanyStages(claims.companyId);
  const { data: docs, loading: documentsLoading, error: documentsError } = useCaseDocuments(caseId);
  const { data: tracking, loading: trackingLoading, error: trackingError } = useCaseTracking(caseId);
  const enquiries = useCaseEnquiries(caseDoc?.companyId ?? claims.companyId, caseId);
  const audit = useCaseAudit(isStaff ? caseDoc?.companyId ?? claims.companyId : undefined, isStaff ? caseId : undefined);
  const { data: company } = useCompanyDoc(caseDoc?.companyId ?? claims.companyId);
  const settings = useCompanySettings(caseDoc?.companyId ?? claims.companyId);
  const currency = settings?.currency || 'USD';
  const [issuedQuote, setIssuedQuote] = useState<QuoteView | null>(null);
  const [localPayments, setLocalPayments] = useState<(PaymentDocLite & { id: string })[]>([]);
  const liveQuote = caseDoc
    ? quotations.find((quote) => quote.id === caseDoc.currentQuotationId && quote.status === 'issued')
    : undefined;
  const currentQuote = issuedQuote && (!liveQuote || issuedQuote.version > liveQuote.version)
    ? issuedQuote
    : liveQuote;
  const visiblePayments = [
    ...payments,
    ...localPayments.filter((local) => !payments.some((live) => live.id === local.id)),
  ];


  if (error) {
    return (
      <div className="px-4 py-10">
        <ErrorState message={error} />
      </div>
    );
  }
  if (caseLoading) {
    return <Spinner label="Loading case" />;
  }
  if (!caseDoc) {
    return (
      <div className="px-4 py-10">
        <ErrorState message="Case not found." />
      </div>
    );
  }

  const stage = caseDoc.currentStage;
  const railStages =
    enabledStages.length > 0
      ? enabledStages.map((key) => ({ key, label: stageLabels[key] ?? stageLabel(key) }))
      : undefined;
   const stageIndex = enabledStages.indexOf(stage);
   const next = isStaff && stageIndex >= 0 ? enabledStages[stageIndex + 1] ?? null : null;
    const balanceDueCents = currentQuote
      ? Math.max(0, currentQuote.totalDueCents - currentQuote.totalPaidCents)
      : caseDoc.balanceDueCents;
    const balanceTone = currentQuote
      ? balanceDueCents > 0 ? 'text-amber-200' : 'text-emerald-300'
      : 'text-slate-200';


  return (
    <div className="pb-8">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-4">
      <div className="min-w-0">
      {!isStaff ? <CustomerStatusAnswer caseDoc={caseDoc} whatsapp={company?.contactWhatsapp} /> : null}
      <CaseNextAction caseId={caseDoc.id} action={caseDoc.nextAction} staff={isStaff}/><section className="case-passport mb-3" aria-label="Import summary">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
             <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
               Case passport · {customer?.fullName ?? 'Import'}
             </p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-50">
              {caseDoc.caseNum}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {vehicle?.year ?? ''} {vehicle?.make ?? ''} {vehicle?.model ?? ''} · {vehicle?.sourceCountry ?? ''}
            </p>
          </div>
          <StageBadge stageKey={stage} label={stageLabel(stage)} />
        </div>

        <div className="mt-4">
          <JourneyRail currentKey={stage} stages={railStages} />
        </div>

        <dl className="case-money-summary mt-3 grid grid-cols-3 gap-2 border-t border-ink-700/70 pt-3">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-slate-500">Total due</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-100">
               {currentQuote ? <MoneyText cents={currentQuote.totalDueCents} currency={currency} /> : quotationsLoading ? 'Loading…' : 'Not available'}

            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-slate-500">Paid</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-300">
               {currentQuote ? <MoneyText cents={currentQuote.totalPaidCents} currency={currency} /> : quotationsLoading ? 'Loading…' : 'Not available'}

            </dd>
          </div>
          <div className="text-right">
            <dt className="text-[10px] uppercase tracking-wide text-slate-500">Balance</dt>
             <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${balanceTone}`}>
               {currentQuote ? (
                 <MoneyText cents={balanceDueCents} currency={currency} />
               ) : quotationsLoading ? (
                 'Loading…'
               ) : caseDoc.quotationVersion > 0 ? (
                 <MoneyText cents={Math.max(0, caseDoc.balanceDueCents)} currency={currency} />
               ) : (
                 <span className="text-slate-500">Not quoted</span>
               )}
             </dd>
          </div>
        </dl>
        {vehicle?.vinChassisUpper ? (
          <p className="mt-2 font-mono text-[11px] tracking-wide text-slate-500">VIN {vehicle.vinChassisUpper}</p>
        ) : null}
        {caseDoc.statusNote ? <p className="mt-1 text-xs text-slate-400">{caseDoc.statusNote}</p> : null}
        <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-600">Last updated {dateTime(caseDoc.updatedAt)}</p>
      </section>

       {caseDoc.supplierSelection&&<Card className="mb-3"><h2 className="section-title">Your selected import vehicle</h2><div className="grid gap-4 sm:grid-cols-2"><img className="w-full aspect-[4/3] object-contain" src={caseDoc.supplierSelection.photos[0]} alt={caseDoc.supplierSelection.title} referrerPolicy="no-referrer"/><div><h3>{caseDoc.supplierSelection.title}</h3><p>BE FORWARD reference: {caseDoc.supplierSelection.id}</p><p>Supplier vehicle price when selected: USD {(caseDoc.supplierSelection.askingPriceCents/100).toLocaleString()}</p><p className="text-sm">See your dealer’s quotation for agreed import costs and inclusions.</p></div></div></Card>}
       {isStaff ? <CaseSupplier key={caseDoc.id} caseId={caseDoc.id} /> : null}
       {isStaff && customer?.phoneNumber ? <a className="btn-ghost mb-3 inline-flex" target="_blank" rel="noopener noreferrer" href={whatsappLink(customer.phoneNumber, `Hello ${customer.fullName}, update from ${company?.name ?? 'your agency'}: case ${caseDoc.caseNum} is at ${stageLabel(stage)}. View your case: ${window.location.origin}/app/cases/${caseDoc.id} . Sign in with your linked customer account.`)}>Send customer a WhatsApp update</a> : null}
       {currentQuote ? <QuotationSummary quote={currentQuote} currency={currency} /> : null}
       <FinancialDocuments caseNum={caseDoc.caseNum} agency={company?.name ?? 'Agency'} customer={customer?.fullName ?? 'Customer'} quote={currentQuote} payments={visiblePayments} />

       {isStaff && !caseDoc.vehicleId ? <AttachVehicle caseId={caseDoc.id} companyId={caseDoc.companyId} /> : null}
       {isStaff && caseDoc.vehicleId ? (
         <FinanceActions
           caseId={caseDoc.id}
           companyId={caseDoc.companyId}
           vehicleId={caseDoc.vehicleId}
           currentQuote={currentQuote}
           onIssued={setIssuedQuote}
           onRecorded={(payment) => setLocalPayments((current) => [payment, ...current.filter((item) => item.id !== payment.id)])}
         />

      ) : null}

       {isStaff && next ? (
         <StaffActions caseId={caseDoc.id} nextStage={next} />
       ) : isStaff && stageIndex < 0 ? (
         <Card className="mb-3 border-amber-900 bg-amber-950/30">
           <h3 className="section-title">Stage unavailable</h3>
           <p className="text-sm text-amber-200">This case is at an unknown or disabled tenant stage. Contact an administrator.</p>
         </Card>
       ) : null}


      {isStaff && stage === 'customs_clearance' ? <ClearanceCheck caseId={caseDoc.id} /> : null}
      </div>

      <div className="min-w-0 lg:sticky lg:top-5">
      {isStaff ? (
        <>
          <DocumentsSection caseId={caseDoc.id} companyId={caseDoc.companyId} docs={docs} loading={documentsLoading} error={documentsError} isStaff={isStaff} />
          <TrackingSection caseId={caseDoc.id} companyId={caseDoc.companyId} tracking={tracking} loading={trackingLoading} error={trackingError} isStaff={isStaff} />
          <ContactAgent
            caseNum={caseDoc.caseNum}
            whatsapp={company?.contactWhatsapp}
            caseId={caseDoc.id}
          />
          <EnquirySection
            caseId={caseDoc.id}
            companyId={caseDoc.companyId}
            customerId={caseDoc.customerId}
            enquiries={enquiries}
            isStaff={isStaff}
          />
          <AuditSection audit={audit} />
        </>
      ) : (
        <>
          <ContactAgent
            caseNum={caseDoc.caseNum}
            whatsapp={company?.contactWhatsapp}
            caseId={caseDoc.id}
            showEnquiryLink
          />
          <EnquirySection
            caseId={caseDoc.id}
            companyId={caseDoc.companyId}
            customerId={caseDoc.customerId}
            enquiries={enquiries}
            isStaff={isStaff}
          />
          <DocumentsSection caseId={caseDoc.id} companyId={caseDoc.companyId} docs={docs} loading={documentsLoading} error={documentsError} isStaff={isStaff} />
          <TrackingSection caseId={caseDoc.id} companyId={caseDoc.companyId} tracking={tracking} loading={trackingLoading} error={trackingError} isStaff={isStaff} />
        </>
      )}
      </div>

      <div className="min-w-0">
      {updates.length > 0 ? (
        <div className="mt-4">
          <h3 className="section-title">Timeline</h3>
          <div className="space-y-2 border-l-2 border-ink-600/60 pl-4">
            {updates.map((u) => (
              <div key={u.id} className="relative">
                <div className="absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-ink-950" aria-hidden />
                <div className="card !p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-slate-200">{stageLabel(u.stageKey)}</p>
                    <span className="text-[10px] text-slate-500">{dateTime(u.createdAt)}</span>
                  </div>
                  {u.note ? <p className="mt-1 text-xs text-slate-400">{u.note}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {visiblePayments.length > 0 ? (
        <div className="mt-4">
          <h3 className="section-title">Payments</h3>
          <div className="space-y-2">
            {visiblePayments.map((p) => (
              <PaymentRow key={p.id} p={p} currentQuotationId={currentQuote?.id} currency={currency} />
            ))}
          </div>
        </div>
      ) : null}
      </div>
      </div>
    </div>
  );
}

function AttachVehicle({ caseId, companyId }: { caseId: string; companyId: string }) {
  const navigate = useNavigate();
  const { data: vehicles, error } = useVehicles(companyId);
  const [vehicleId, setVehicleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function attach() {
    setBusy(true); setMessage('');
    try { await api.attachCaseVehicle({ caseId, vehicleId }); }
    catch (err) { setMessage((err as Error).message); }
    finally { setBusy(false); }
  }
  return <Card className="mb-3"><h3 className="section-title">Attach the sourced vehicle</h3><p className="mb-3 text-sm text-slate-400">This enquiry is on record. Attach a vehicle before calculating a quotation.</p><Select aria-label="Sourced vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}><option value="">Choose a registered vehicle</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.year} {vehicle.make} {vehicle.model} · {vehicle.vinChassisUpper}</option>)}</Select>{error || message ? <p role="alert" className="mt-2 text-xs text-red-300">{error || message}</p> : null}<div className="mt-3 flex flex-col gap-2 sm:flex-row"><Button onClick={attach} loading={busy} disabled={!vehicleId}>Attach vehicle</Button><Button variant="ghost" onClick={() => navigate('/app/new/vehicle')}>Register a vehicle</Button></div></Card>;
}

function customerNextStep(stage: string): string {
  const messages: Record<string, string> = {
    enquiry: 'Your agent is reviewing your enquiry and will update the timeline with the next step.',
    quotation: 'Your agent is preparing the quotation and will update the timeline when it is ready.',
    payment_confirmed: 'Your agent is confirming the payment details and will update the timeline with the next step.',
    vehicle_sourced: 'Your agent is arranging the vehicle purchase and will update the timeline with the next step.',
    purchase_completed: 'Your agent is preparing the vehicle for export and will update the timeline with the next step.',
    export_processing: 'Your agent is handling export processing and will update the timeline with the next step.',
    shipped: 'Your vehicle has shipped. Your agent will update the timeline with the next milestone.',
    in_transit: 'Your vehicle is in transit. Your agent will update the timeline with the next milestone.',
    arrived: 'Your vehicle has arrived. Your agent will update the timeline with the next clearance step.',
    customs_clearance: 'Your agent is handling customs clearance and will update the timeline with the next step.',
    duties_charges: 'Your agent is handling duties and charges and will update the timeline with the next step.',
    registration_compliance: 'Your agent is handling registration and compliance and will update the timeline when this is complete.',
    ready_for_collection: 'Your vehicle is ready for collection. Your agent will update the timeline with collection details.',
    delivered: 'Your vehicle has been delivered. Your agent will update the timeline if any follow-up is needed.',
  };
  return messages[stage] ?? 'Your agent will update the timeline with the next step.';
}

function CustomerStatusAnswer({ caseDoc, whatsapp }: { caseDoc: ImportCaseDoc & { id: string }; whatsapp?: string }) {
  const note = caseDoc.statusNote?.trim();
  const nextStep = note
    ? `Your latest agent note is “${note}”. The agent will update the timeline with the next step.`
    : customerNextStep(caseDoc.currentStage);
  const href = whatsapp ? whatsappLink(whatsapp, `Hello, I need help with Case ${caseDoc.caseNum}.`) : undefined;

  return (
    <section className="case-passport mb-3" aria-label="Current case status">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Current case status</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl font-bold tracking-tight text-slate-50">{stageLabel(caseDoc.currentStage)}</h2>
        <StageBadge stageKey={caseDoc.currentStage} label={stageLabel(caseDoc.currentStage)} />
      </div>
      <p className="mt-2 text-base leading-relaxed text-slate-200"><span className="font-semibold text-slate-50">Next step:</span> {nextStep}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="btn-primary">
            WhatsApp about this case
          </a>
        ) : null}
        <a href="#enquiries" className="btn-ghost">
          Ask in the portal
        </a>
      </div>
    </section>
  );
}

function QuotationSummary({ quote, currency }: { quote: QuoteView; currency: string }) {
  return (
    <Card className="mb-3">
      <h3 className="section-title">Latest quotation (v{quote.version})</h3>
      <div className="flex justify-between text-sm">
        <span className="text-slate-400">Total due</span>
        <span className="font-semibold text-slate-50">
           <MoneyText cents={quote.totalDueCents} currency={currency} />
        </span>
      </div>
      <QuoteTermsSummary terms={quote.terms}/><p className="mt-1 text-xs text-slate-500">Valuation basis: {quote.valuationBasis}</p>
      {quote.purchasePriceCents !== undefined ? <QuoteBreakdown quote={quote} currency={currency} /> : <p className="mt-2 text-xs text-amber-200">Legacy quotation: ask your agent to review the costs before relying on this estimate.</p>}
      <p className="mt-2 text-xs text-slate-400">Customs charges are estimates subject to the final assessment. Include each supplier charge once.</p>
    </Card>
  );
}

const CHARGE_LABELS: Record<keyof QuotationCharges, string> = {
  freightCents: 'Sea freight', insuranceCents: 'Insurance to the border',
  borderFreightCents: 'Transport to Zimbabwe border', portChargesCents: 'Port / other charges outside Zimbabwe',
  localDeliveryCents: 'Delivery inside Zimbabwe', agencyFeeCents: 'Agency service fee',
};

function QuoteBreakdown({ quote, currency = 'USD' }: { quote: Partial<QuoteView>; currency?: string }) {
  const lines: [string, number | undefined][] = [
    ['Vehicle purchase', quote.purchasePriceCents],
    ...Object.entries(CHARGE_LABELS).map(([key, label]) => [label, quote.charges?.[key as keyof QuotationCharges]] as [string, number | undefined]),
    ['Customs duty', quote.customsDutyCents], ['Surtax', quote.surtaxCents], ['Import VAT', quote.vatCents], ['Carbon tax', quote.carbonTaxCents],
  ];
  return <dl className="mt-3 space-y-1 text-xs">{lines.filter(([, value]) => value !== undefined).map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="text-slate-400">{label}</dt><dd className="text-slate-100"><MoneyText cents={value!} currency={currency} /></dd></div>)}</dl>;
}

function StaffActions({ caseId, nextStage }: { caseId: string; nextStage: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function advance() {
    setBusy(true);
    setError(null);
    try {
      await api.advanceImportStage({ caseId, toStage: nextStage, note: note.trim() || undefined });
      setNote('');
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to advance stage');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-3">
      <h3 className="section-title">Advance stage</h3>
      {error ? <p className="mb-2 rounded-lg border border-red-900 bg-red-950/40 px-3 py-1.5 text-xs text-red-300">{error}</p> : null}
      <Field label="Stage note (optional)">
        <TextArea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. shipping docs received"
          rows={2}
        />
      </Field>
      <div className="mt-2">
        <Button onClick={advance} loading={busy}>
          Move to {stageLabel(nextStage)}
        </Button>
      </div>
    </Card>
  );
}

function ClearanceCheck({ caseId }: { caseId: string }) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await api.clearanceReady({ caseId });
      setReady(res.ready);
      setMissing(res.missingDocs);
    } catch {
      setReady(false);
      setMissing(['Could not verify']);
    } finally {
      setBusy(false);
    }
  }

  if (ready === null) {
    return (
      <div className="mb-3">
        <Button variant="ghost" onClick={run} loading={busy}>
          Check customs readiness
        </Button>
      </div>
    );
  }

  return (
    <Card className={`mb-3 ${ready ? 'border-emerald-900 bg-emerald-950/30' : 'border-amber-900 bg-amber-950/30'}`}>
      <h3 className="section-title">Customs clearance readiness</h3>
      {ready ? (
        <p className="text-sm font-medium text-emerald-300">All required documents are uploaded and verified.</p>
      ) : (
        <p className="text-sm text-amber-300">Missing: {missing.join(', ')}</p>
      )}
      <Button variant="ghost" onClick={run} loading={busy} className="mt-2">
        Re-check
      </Button>
    </Card>
  );
}

function PaymentRow({
  p,
  currentQuotationId,
  currency,
}: {
  p: PaymentDocLite & { id: string };
  currentQuotationId?: string;
  currency: string;
}) {
  const t = p.createdAt as { toDate?: () => Date } | null;
  const when = t?.toDate ? t.toDate() : null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState(p.status);
  const { claims } = useAuth();
  useEffect(() => setStatus(p.status), [p.status]);
  const statusTone: Record<string, 'ok' | 'warn' | 'muted' | 'default'> = {
    pending: 'warn',
    confirmed: 'ok',
    refunded: 'muted',
     reversed: 'muted',
     superseded: 'muted',
   };

  async function confirm() {
    setBusy(true);
    setErr(null);
    try {
      await api.confirmPayment({ paymentId: p.id });
     setStatus('confirmed');
    } catch (e) {
      setErr((e as Error)?.message ?? 'Confirm failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="!p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-100">
             <MoneyText cents={p.amountCents} currency={currency} /> · {p.method} · {p.recipient==='supplier'?'Paid directly to supplier':'Received by agency'}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">{when ? dateTime(when) : ''}</p>
        </div>
        <Badge tone={statusTone[status] ?? 'default'}>{status}</Badge>
      </div>
      {p.providerRef ? <p className="mt-1 font-mono text-[10px] text-slate-500">Ref: {p.providerRef}</p> : null}
      {status === 'confirmed' ? <PaymentCorrection paymentId={p.id} onCorrected={setStatus} /> : null}
      {err ? <p className="mt-1 text-xs text-red-300">{err}</p> : null}
       {['admin', 'staff'].includes(claims.appRole ?? '') && status === 'pending' && p.quotationId === currentQuotationId ? (
         <Button variant="ghost" onClick={confirm} loading={busy} className="mt-2">

          Confirm payment
        </Button>
      ) : null}
    </Card>
  );
}

 function FinanceActions({
   caseId,
   companyId,
   vehicleId,
   currentQuote,
   onIssued,
   onRecorded,
 }: {
   caseId: string;
   companyId: string;
   vehicleId: string;
   currentQuote?: QuoteView;
   onIssued: (quote: QuoteView) => void;
   onRecorded: (payment: PaymentDocLite & { id: string }) => void;
 }) {

  const [terms,setTerms]=useState({route:'',inclusions:'',exclusions:'',validUntil:''});
  useEffect(()=>{setTerms(currentQuote?.terms??{route:'',inclusions:'',exclusions:'',validUntil:''});},[caseId,currentQuote?.id]);
  const [preview, setPreview] = useState<QuotationResult | null>(null);
  const [chargeDraft, setChargeDraft] = useState<Partial<Record<keyof QuotationCharges, string>>>({});
  useEffect(() => { setChargeDraft({}); setPreview(null); }, [caseId, currentQuote?.id]);
  function quotationCharges(): QuotationCharges {
    const values = {} as QuotationCharges;
    for (const key of Object.keys(CHARGE_LABELS) as (keyof QuotationCharges)[]) {
      const draft = chargeDraft[key];
      if (draft !== undefined && draft !== '' && !/^\d+(\.\d{1,2})?$/.test(draft)) throw new Error('Enter nonnegative amounts with at most two decimal places.');
      values[key] = draft === undefined ? currentQuote?.charges?.[key] ?? 0 : Math.round(Number(draft || 0) * 100);
      if (!Number.isSafeInteger(values[key])) throw new Error('Amount is too large.');
    }
    return values;
  }
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('EcoCash');
  const [recipient,setRecipient]=useState<'agency'|'supplier'>('agency');
  const [purpose,setPurpose]=useState<'pass_through'|'service_fee'|'mixed'>('mixed');
  const [providerRef, setProviderRef] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [info, setInfo] = useState<string | null>(null);
   const [paymentKey, setPaymentKey] = useState<string | null>(null);
   const [proofPath, setProofPath] = useState<string | null>(null);

   function resetPaymentAttempt() {
     setPaymentKey(null);
     setProofPath(null);
   }

   useEffect(() => {
     resetPaymentAttempt();
   }, [currentQuote?.id]);


  async function calc() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.calculateImportQuotationView({ vehicleId, charges: quotationCharges() });
      setPreview(res);
    } catch (e) {
      setError((e as Error)?.message ?? 'Calculation failed');
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    setBusy(true);
    setError(null);
    try {
     const res = await api.issueQuotation({ caseId, charges: quotationCharges(), terms });
     onIssued({
       id: res.quotationId,
       companyId,
       caseId,
       version: res.version,
       valuationBasis: res.valuationBasis,
       totalDueCents: res.totalDueCents,
       totalPaidCents: res.totalPaidCents,
       status: 'issued',
       purchasePriceCents: res.purchasePriceCents, charges: res.charges,
       cifValueCents: res.cifValueCents, customsDutyCents: res.customsDutyCents,
       surtaxCents: res.surtaxCents, vatCents: res.vatCents, carbonTaxCents: res.carbonTaxCents,
       terms, calculationVersion: 2,
     });
     setInfo(`Quotation v${res.version} issued: $${(res.totalDueCents / 100).toFixed(2)}`);
      setPreview(null);
    } catch (e) {
      setError((e as Error)?.message ?? 'Issue failed');
    } finally {
      setBusy(false);
    }
  }

   async function record() {
     if (!currentQuote) {
       setError('Issue a current quotation before recording a payment.');
       return;
     }
     const cents = Math.round(parseFloat(amount) * 100);

    if (!Number.isInteger(cents) || cents <= 0) {
      setError('Enter amount in dollars, e.g. 150.00');
      return;
    }
    if (proof) {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(proof.type)) {
        setError('Proof must be a photo (JPEG/PNG/WebP/HEIC).');
        return;
      }
      if (proof.size >= 5 * 1024 * 1024) {
        setError('Proof photo must be under 5MB.');
        return;
      }
    }
     setBusy(true);
     setError(null);
     try {
        const attemptKey = paymentKey ?? crypto.randomUUID();
        setPaymentKey(attemptKey);
        let attemptProofPath = proofPath;
        if (proof && attemptProofPath === null) {
          attemptProofPath = `payment-proofs/${companyId}/${caseId}/${method}/${attemptKey}`;
          await uploadBytes(ref(storage, attemptProofPath), proof);
          setProofPath(attemptProofPath);
        }
       const recorded = await api.recordPayment({
         recipient,purpose,
         caseId,
         quotationId: currentQuote.id,
         amountCents: cents,
         method: method as 'EcoCash' | 'InnBucks' | 'Bank' | 'Cash',
         idempotencyKey: attemptKey,
         providerRef: providerRef.trim() || undefined,
         ...(attemptProofPath ? { proofPath: attemptProofPath } : {}),
       });
       onRecorded({
         recipient,purpose,
         id: recorded.paymentId,
         quotationId: currentQuote.id,
         amountCents: cents,
         method,
         status: recorded.status,
         providerRef: providerRef.trim() || undefined,
         proofPath: attemptProofPath ?? undefined,
         createdAt: Timestamp.now(),
       });
       setInfo('Payment recorded as pending');
       resetPaymentAttempt();

      setAmount('');
      setProviderRef('');
      setProof(null);
    } catch (e) {
      setError((e as Error)?.message ?? 'Record failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-3">
      <h3 className="section-title">Finance</h3>
      <p className="mb-3 text-xs text-slate-400">Enter charges not already included in the recorded purchase price. Local delivery and your service fee are outside the customs value.</p>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        {(Object.entries(CHARGE_LABELS) as [keyof QuotationCharges, string][]).map(([key, label]) => <Field key={key} label={`${label} (USD)`}><Input aria-label={`${label} (USD)`} inputMode="decimal" disabled={busy} value={chargeDraft[key] ?? ((currentQuote?.charges?.[key] ?? 0) / 100).toFixed(2)} onChange={(e) => { setChargeDraft((previous) => ({ ...previous, [key]: e.target.value })); setPreview(null); setInfo(null); }} /></Field>)}
      </div>
      {error ? <p className="mb-2 text-xs text-red-300">{error}</p> : null}
      {info ? <p className="mb-2 text-xs text-emerald-300">{info}</p> : null}
      {preview ? (
        <div className="mb-2 text-xs text-slate-300">
          <p>Valuation: {preview.valuationBasis} · CIF ${(preview.cifValueCents / 100).toFixed(2)}</p>
          <QuoteBreakdown quote={preview} />
          <p>Duty ${(preview.customsDutyCents / 100).toFixed(2)} · Surtax ${(preview.surtaxCents / 100).toFixed(2)} · VAT ${(preview.vatCents / 100).toFixed(2)} · Carbon ${(preview.carbonTaxCents / 100).toFixed(2)}</p>
          <p className="font-semibold text-slate-100">Total ${(preview.totalDueCents / 100).toFixed(2)}</p>
        </div>
      ) : null}
      <fieldset className="my-4 grid gap-3"><legend className="mb-2 font-semibold">Quote scope and validity</legend><p className="text-xs text-slate-400">Amounts above are included in the total. Describe bundled supplier services so they are not charged twice. A zero amount alone does not establish that a service is free.</p>{(['route','inclusions','exclusions'] as const).map(key=><label key={key}>{key==='route'?'Arrival port / delivery route':key==='inclusions'?'Included services and bundled charges':'Excluded costs / customer responsibilities'}<Input aria-label={`Quote ${key}`} value={terms[key]} maxLength={key==='route'?200:1500} onChange={e=>setTerms({...terms,[key]:e.target.value})}/></label>)}<label>Price valid through (optional)<Input aria-label="Quote valid until" type="date" value={terms.validUntil} onChange={e=>setTerms({...terms,validUntil:e.target.value})}/></label></fieldset>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={calc} loading={busy}>
          Preview duty
        </Button>
         <Button onClick={issue} loading={busy}>
           {currentQuote ? 'Re-issue quotation' : 'Issue quotation'}
         </Button>

      </div>
      <div className="mt-3 space-y-2 border-t border-ink-800 pt-3">
        <Field label="Record payment (USD)">
           <Input value={amount} onChange={(e) => { setAmount(e.target.value); resetPaymentAttempt(); }} placeholder="150.00" inputMode="decimal" />

        </Field>
        <Field label="Who received the payment?"><Select aria-label="Payment recipient" value={recipient} onChange={e=>{setRecipient(e.target.value as typeof recipient);setPurpose(e.target.value==='supplier'?'pass_through':'mixed');resetPaymentAttempt();}}><option value="agency">Our agency received the money</option><option value="supplier">Customer paid supplier directly</option></Select></Field>
        <Field label="Payment purpose"><Select aria-label="Payment purpose" value={purpose} onChange={e=>{setPurpose(e.target.value as typeof purpose);resetPaymentAttempt();}}><option value="pass_through">Vehicle / import charges</option>{recipient==='agency'&&<><option value="service_fee">Agency service fee</option><option value="mixed">Mixed / not allocated yet</option></>}</Select></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Method">
             <Select value={method} onChange={(e) => { setMethod(e.target.value); resetPaymentAttempt(); }}>

              <option>EcoCash</option>
              <option>InnBucks</option>
              <option>Bank</option>
              <option>Cash</option>
            </Select>
          </Field>
          <Field label="Provider ref (optional)">
             <Input value={providerRef} onChange={(e) => { setProviderRef(e.target.value); resetPaymentAttempt(); }} placeholder="ECO123" />

          </Field>
        </div>
        <Field label="Proof photo (optional, camera OK)">
            <input type="file" accept="image/*" capture="environment" onChange={(e) => { setProof(e.target.files?.[0] ?? null); resetPaymentAttempt(); }} className="text-xs text-slate-300" />

        </Field>
         <Button variant="ghost" onClick={record} loading={busy} disabled={!currentQuote}>
           {currentQuote ? 'Record payment' : 'Issue a quotation to record payment'}
         </Button>

      </div>
    </Card>
  );
}

const DOC_TYPES = [
  'export_certificate',
  'bill_of_lading',
  'road_manifest',
  'condition_report',
  'eaa_certificate',
  'purchase_invoice',
  'proof_of_payment',
  'import_licence',
];

const DOC_LABELS: Record<string, string> = {
  export_certificate: 'Export certificate',
  bill_of_lading: 'Bill of lading',
  road_manifest: 'Road manifest',
  condition_report: 'Vehicle condition report',
  eaa_certificate: 'EAA certificate',
  purchase_invoice: 'Purchase invoice',
  proof_of_payment: 'Proof of payment',
  import_licence: 'Import licence',
};

function documentLabel(docType: string): string {
  return DOC_LABELS[docType] ?? docType.replace(/_/g, ' ');
}

function safeFileName(name: string): string {
  const safe = name
    .replace(/[\\/]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '_')
    .trim();
  return (safe || 'document').slice(0, 255);
}

async function deterministicDocumentId(
  companyId: string,
  caseId: string,
  docType: string,
  file: File,
): Promise<string> {
  const source = new TextEncoder().encode(
    [companyId, caseId, docType, safeFileName(file.name), file.type, file.size, file.lastModified].join('\u0000'),
  );
  const digest = await crypto.subtle.digest('SHA-256', source);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${docType}_${hash}`;
}

function DocumentsSection({
  caseId,
  companyId,
  docs,
  loading,
  error,
  isStaff,
}: {
  caseId: string;
  companyId: string;
  docs: { id: string; docType: string; fileName?: string; objectPath?: string; storageValid?: boolean; verified?: boolean }[];
  loading: boolean;
  error: string | null;
  isStaff: boolean;
}) {
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [localDocs, setLocalDocs] = useState<typeof docs>([]);
  const visibleDocs = [
    ...docs,
    ...localDocs.filter((local) => !docs.some((live) => live.id === local.id)),
  ];

  async function upload() {
    if (!file) {
      setMsg('Choose a file first');
      return;
    }
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.type)) {
      setMsg('Document must be a PDF or photo (JPEG/PNG/WebP/HEIC).');
      return;
    }
    if (file.size >= 10 * 1024 * 1024) {
      setMsg('Document must be under 10MB.');
      return;
    }
    const documentId = await deterministicDocumentId(companyId, caseId, docType, file);
    const fileName = safeFileName(file.name);
    const objectPath = `documents/${companyId}/${caseId}/${docType}/${documentId}/${fileName}`;
    setBusy(true);
    setMsg(null);
    let rowCreated = false;
    try {
      await setDoc(doc(db, 'import_cases', caseId, 'documents', documentId), {
        companyId,
        caseId,
        docType,
        objectPath,
        fileName,
        verified: false,
        storageValid: false,
        uploadedBy: auth.currentUser?.uid ?? '',
        createdAt: serverTimestamp(),
      });
      rowCreated = true;
       await uploadBytes(ref(storage, objectPath), file);
       setLocalDocs((current) => [
         {
           id: documentId,
           docType,
           fileName,
           objectPath,
           storageValid: false,
           verified: false,
         },
         ...current.filter((item) => item.id !== documentId),
       ]);
       setMsg('Uploaded — pending storage validation and review');
      setFile(null);
    } catch (e) {
      let message = (e as Error)?.message ?? 'Upload failed';
      if (rowCreated) {
        try {
          const cleanup = await api.cleanupDocumentUpload({ caseId, documentId });
          if (!cleanup.deleted) {
            message = 'Upload state is uncertain; the pending document was retained';
          }
        } catch {
          message = `${message}; the pending document could not be cleaned up`;
        }
      }
      setMsg(message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(id: string, verified: boolean) {
    setActionId(id);
    setMsg(null);
    try {
      await api.verifyDocument({ caseId, documentId: id, verified });
    } catch (e) {
      setMsg((e as Error)?.message ?? 'Verification failed');
    } finally {
      setActionId(null);
    }
  }

  async function download(objectPath: string) {
    setMsg(null);
    try {
      const url = await getDownloadURL(ref(storage, objectPath));
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setMsg((e as Error)?.message ?? 'Download failed');
    }
  }

  return (
    <Card className="mb-3 mt-4">
      <h3 className="section-title">Documents ({visibleDocs.length})</h3>
      {loading ? <p className="py-3 text-sm text-slate-500">Loading documents…</p> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && !error && visibleDocs.length === 0 ? <p className="text-sm text-slate-500">No documents yet.</p> : null}
      <div className="space-y-1">
        {visibleDocs.map((d) => {
          const verified = Boolean(d.verified && d.storageValid);
          const status = verified ? 'Verified' : d.storageValid ? 'Processing — pending review' : 'Processing';
          return (
            <div key={d.id} className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-1 py-1 text-xs">
              <span className="min-w-0">
                <span className="block truncate text-slate-100">{d.fileName ?? documentLabel(d.docType)}</span>
                <span className="block text-[11px] text-slate-500">{documentLabel(d.docType)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Badge tone={verified ? 'ok' : 'warn'}>{status}</Badge>
                {d.objectPath ? (
                  <button
                    onClick={() => download(d.objectPath as string)}
                    className="min-h-11 rounded-lg border border-ink-700 px-3 text-[11px] font-semibold text-slate-200"
                  >
                    Open
                  </button>
                ) : null}
                {isStaff ? (
                  <button
                    onClick={() => verify(d.id, !d.verified)}
                    disabled={!d.verified && !d.storageValid || actionId === d.id}
                    className="min-h-11 rounded-lg border border-ink-700 px-3 text-[11px] text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actionId === d.id ? 'Working' : d.verified ? 'Unverify' : 'Verify'}
                  </button>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
      {isStaff ? (
        <div className="mt-3 space-y-2 border-t border-ink-800 pt-3">
          <Field label="Doc type">
            <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DOC_TYPES.map((t) => (
                 <option key={t} value={t}>{documentLabel(t)}</option>
              ))}
            </Select>
          </Field>
          <input
            type="file"
            accept=".pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-xs text-slate-300"
          />
          {msg ? <p className="text-xs text-slate-400">{msg}</p> : null}
          <Button variant="ghost" onClick={upload} loading={busy}>
            Upload document
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function TrackingSection({
  caseId,
  companyId,
  tracking,
  loading,
  error,
  isStaff,
}: {
  caseId: string;
  companyId: string;
  tracking: { id: string; location: string; note?: string }[];
  loading: boolean;
  error: string | null;
  isStaff: boolean;
}) {
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [localTracking, setLocalTracking] = useState<typeof tracking>([]);
  const visibleTracking = [
    ...tracking,
    ...localTracking.filter((local) => !tracking.some((live) => live.id === local.id)),
  ];

  async function post() {
    if (!location.trim()) return;
    setBusy(true);
    try {
     const trackingRef = doc(collection(db, 'import_cases', caseId, 'tracking'));
     await setDoc(trackingRef, {
       companyId,
       caseId,
       location: location.trim(),
       ...(note.trim() ? { note: note.trim() } : {}),
       recordedBy: auth.currentUser?.uid,
       createdAt: serverTimestamp(),
     });
     setLocalTracking((current) => [
       {
         id: trackingRef.id,
         location: location.trim(),
         ...(note.trim() ? { note: note.trim() } : {}),
       },
       ...current,
     ]);
      setLocation('');
      setNote('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-3">
      <h3 className="section-title">Location ({visibleTracking.length})</h3>
      {loading ? <p className="py-3 text-sm text-slate-500">Loading tracking…</p> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && !error && visibleTracking.length === 0 ? <p className="text-sm text-slate-500">No tracking posts yet.</p> : null}
      {visibleTracking.map((t) => (
        <p key={t.id} className="text-sm text-slate-300">📍 {t.location}{t.note ? ` — ${t.note}` : ''}</p>
      ))}
      {isStaff ? (
        <div className="mt-2 space-y-2 border-t border-ink-800 pt-2">
          <Field label="New location">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Beitbridge border" />
          </Field>
          <Field label="Note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Queue cleared" />
          </Field>
          <Button variant="ghost" onClick={post} loading={busy}>
            Post update
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function ContactAgent({ caseNum, whatsapp, caseId, showEnquiryLink = false }: { caseNum: string; whatsapp?: string; caseId: string; showEnquiryLink?: boolean }) {
  const text = `Hello, I need an update on Case ${caseNum}`;
  const href = whatsapp ? whatsappLink(whatsapp, text) : undefined;
  async function share() {
    try {
      await shareCaseUpdate(`Case ${caseNum}`, text, window.location.href);
    } catch {
      /* user cancelled */
    }
  }
  return (
    <Card className="mb-3">
      <h3 className="section-title">Contact agent</h3>
      <div className="flex gap-2">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="btn-primary flex-1 text-center">
            WhatsApp agent
          </a>
        ) : (
          <p className="text-xs text-slate-500">Agent number not configured.</p>
        )}
        <Button variant="ghost" onClick={share}>
          Share
        </Button>
      </div>
       {showEnquiryLink ? <a href="#enquiries" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent">Go to enquiries</a> : null}
       <p className="mt-1 hidden">{caseId}</p>
    </Card>
  );
}

function EnquirySection({
  caseId,
  companyId,
  customerId,
  enquiries,
  isStaff,
}: {
  caseId: string;
  companyId: string;
  customerId: string;
  enquiries: { id: string; message: string; status: string; reply?: string }[];
  isStaff: boolean;
}) {
  const { claims } = useAuth();
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [localEnquiries, setLocalEnquiries] = useState<typeof enquiries>([]);
  const visibleEnquiries = [
    ...enquiries,
    ...localEnquiries.filter((local) => !enquiries.some((live) => live.id === local.id)),
  ];

  async function send() {
    if (!message.trim()) {
      setErr('Enter a message before sending.');
      setSuccess(null);
      return;
    }
    setBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const enquiryRef = doc(collection(db, 'enquiries'));
      const enquiryMessage = message.trim();
      await setDoc(enquiryRef, {
        companyId,
        customerId: claims.customerId ?? customerId,
        caseId,
        direction: 'inbound',
        message: enquiryMessage,
        status: 'open',
        createdAt: serverTimestamp(),
      });
      setLocalEnquiries((current) => [
        { id: enquiryRef.id, message: enquiryMessage, status: 'open' },
        ...current,
      ]);
      setMessage('');
       setSuccess(navigator.onLine ? 'Enquiry sent to your agent.' : 'Saved on this device. It will send when your connection returns.');
     } catch (e) {
      setErr((e as Error)?.message ?? 'Send failed');
    } finally {
      setBusy(false);
    }
  }

  async function replyTo(id: string) {
    const text = (reply[id] ?? '').trim();
    if (!text) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'enquiries', id), { reply: text, status: 'replied', repliedBy: auth.currentUser?.uid });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="enquiries">
      <Card className="mb-3">
        <h3 className="section-title">Enquiries ({visibleEnquiries.length})</h3>
      {visibleEnquiries.map((q) => (
        <div key={q.id} className="mb-2 rounded-xl border border-ink-700 p-2">
          <p className="text-xs text-slate-200">{q.message}</p>
          {q.reply ? <p className="mt-1 text-xs text-emerald-300">↳ {q.reply}</p> : null}
          {isStaff && !q.reply ? (
            <div className="mt-2 flex gap-2">
              <Input
                value={reply[q.id] ?? ''}
                onChange={(e) => setReply((p) => ({ ...p, [q.id]: e.target.value }))}
                placeholder="Reply…"
              />
              <Button variant="ghost" onClick={() => replyTo(q.id)} loading={busy}>
                Send
              </Button>
            </div>
          ) : null}
        </div>
      ))}
      {!isStaff ? (
        <div className="mt-2 space-y-2">
           <Field label="Ask your agent" hint="Keep your message under 500 characters.">
             <TextArea
               value={message}
               onChange={(e) => {
                 setMessage(e.target.value);
                 setErr(null);
                 setSuccess(null);
               }}
               rows={2}
               maxLength={500}
               placeholder="e.g. When will my car ship?"
             />
           </Field>
           {err ? <p className="text-xs text-red-300" role="alert">{err}</p> : null}
           {success ? <p className="text-xs text-emerald-300" role="status">{success}</p> : null}
          <Button variant="ghost" onClick={send} loading={busy}>
            Send enquiry
          </Button>
        </div>
      ) : null}
      </Card>
    </div>
  );
}

function AuditSection({ audit }: { audit: { id: string; action: string; entityType: string; createdAt?: unknown }[] }) {
  if (audit.length === 0) return null;
  return (
    <Card className="mb-3">
      <h3 className="section-title">Audit ({audit.length})</h3>
      {audit.map((a) => (
        <p key={a.id} className="text-[11px] text-slate-500">
          {a.entityType} · {a.action} · {dateTime(a.createdAt as never)}
        </p>
      ))}
    </Card>
  );
}

function QuoteTermsSummary({terms}:{terms?:QuoteView['terms']}){return <div className="mt-3 space-y-2 text-sm"><p><strong>Route:</strong> {terms?.route||'Confirm with your agency'}</p><p><strong>Included services:</strong> {terms?.inclusions||'Only the amounts in the breakdown are recorded. Confirm the service scope with your agency.'}</p><p><strong>Exclusions:</strong> {terms?.exclusions||'Not specified; ask your agency before agreeing.'}</p><p><strong>Price validity:</strong> {terms?.validUntil||'Not specified; reconfirm before paying.'}</p>{terms?.validUntil&&terms.validUntil<new Date().toISOString().slice(0,10)&&<p className="text-amber-200">The price validity date has passed. Ask for a reviewed quotation.</p>}</div>;}
