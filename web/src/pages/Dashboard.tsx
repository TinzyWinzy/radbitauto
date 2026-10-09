import AgencyLaunchChecklist from '../components/AgencyLaunchChecklist';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { STAGES, stageLabel } from '../lib/types';
import { useAuth } from '../lib/auth';
import { useCompanyDoc, useCompanySettings, useCustomerCases, useCases, useVehiclesByIds, useCompanyStages } from '../lib/hooks';
import { whatsappLink } from '../lib/share';
import { MoneyText, ProgressBar, StageBadge } from '../components/ui';
import { EmptyState, ErrorState, PageHeader } from '../components/status';
import type { SearchHit, VehicleDoc } from '../lib/types';
import type { QuotationDoc } from '../lib/types';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebaseData';
import { RetailPurchaseCards } from './RetailPurchase';
import DealerOverview, { type DealerWorkspace } from '../components/DealerOverview';
import { dealerCall } from '../lib/dealer';

function TrialBanner() {
  const [days, setDays] = useState<number | null>(null);
  useEffect(() => {
    api.subscriptionOverview({}).then((d) => {
      if (d.status === 'trial' && typeof d.daysRemaining === 'number' && d.daysRemaining <= 7) setDays(d.daysRemaining);
    }).catch(() => undefined);
  }, []);
  if (days === null) return null;
  return (
    <section className="workflow-record mb-6 border border-amber-500/40" role="alert">
      <h2 className="font-display text-xl font-bold">Your 14-day Dealer trial ends in {days} day{days === 1 ? '' : 's'}</h2>
      <p className="mt-2 text-sm text-slate-300">Your records stay readable after the trial. Email support before it ends to keep write access on Solo ($15/mo) or Dealer ($29/mo).</p>
      <Link to="/app/billing" className="btn-ghost mt-3 inline-flex">Open plan &amp; billing</Link>
    </section>
  );
}

function stageIndex(key: string): number {
  return Math.max(0, STAGES.findIndex((s) => s.key === key));
}

export default function Dashboard() {
  const { claims } = useAuth();
  const isStaff = claims.appRole === 'staff' || claims.appRole === 'admin';
  return isStaff ? <StaffDashboard /> : <CustomerDashboard />;
}

function CaseRow({
  caseDoc,
  onClick,
  customerName,
}: {
  caseDoc: { id: string; caseNum: string; currentStage: string; balanceDueCents: number; updatedAt: unknown };
  onClick: () => void;
  customerName?: string;
}) {
  const t = caseDoc.updatedAt as { toDate?: () => Date } | null;
  const when = t?.toDate ? t.toDate() : undefined;
  const idx = stageIndex(caseDoc.currentStage);
  const settled = caseDoc.balanceDueCents <= 0;
  return (
    <button
      onClick={onClick}
      className="card group flex w-full items-center gap-3 text-left transition hover:border-ink-600 active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold tracking-tight text-slate-50">{caseDoc.caseNum}</p>
          <StageBadge stageKey={caseDoc.currentStage} label={stageLabel(caseDoc.currentStage)} />
        </div>
        {customerName ? <p className="mt-0.5 truncate text-xs text-slate-400">{customerName}</p> : null}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1">
            <ProgressBar value={idx / (STAGES.length - 1)} />
          </div>
          <p className="shrink-0 text-[10px] tabular-nums text-slate-500">
            {when
              ? new Intl.DateTimeFormat('en-ZW', { day: 'numeric', month: 'short' }).format(when)
              : `Step ${idx + 1}/${STAGES.length}`}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">Balance</p>
        <p className={`text-sm font-semibold tabular-nums ${settled ? 'text-emerald-300' : 'text-amber-200'}`}>
          <MoneyText cents={caseDoc.balanceDueCents} />
        </p>
        <p className="mt-0.5 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400" aria-hidden>›</p>
      </div>
    </button>
  );
}

function CustomerCaseCard({
  caseDoc,
  vehicle,
  currency,
  onClick,
  whatsapp,
  nextStep,
}: {
  caseDoc: { id: string; caseNum: string; currentStage: string; statusNote?: string; balanceDueCents: number; quotationVersion: number; currentQuotationId?: string; updatedAt: unknown };
  vehicle?: VehicleDoc & { id: string };
  currency: string;
  onClick: () => void;
  whatsapp?: string;
  nextStep: string;
}) {
  const [quote, setQuote] = useState<QuotationDoc | null>(null);
  const [quoteError, setQuoteError] = useState(false);
  useEffect(() => {
    setQuote(null); setQuoteError(false);
    if (!caseDoc.currentQuotationId) return;
    return onSnapshot(doc(db, 'quotations', caseDoc.currentQuotationId), snapshot => { setQuote(snapshot.exists() ? snapshot.data() as QuotationDoc : null); setQuoteError(!snapshot.exists()); }, () => setQuoteError(true));
  }, [caseDoc.currentQuotationId]);
  const timestamp = caseDoc.updatedAt as { toDate?: () => Date } | null;
  const updatedAt = timestamp?.toDate?.();
  const updatedLabel = updatedAt
    ? `Last updated ${new Intl.DateTimeFormat('en-ZW', { day: 'numeric', month: 'short', year: 'numeric' }).format(updatedAt)}`
    : 'Last updated time unavailable';
  const balanceKnown = caseDoc.quotationVersion > 0 && Number.isFinite(caseDoc.balanceDueCents);

  return (
    <section aria-label={`Import ${caseDoc.caseNum}`} className="customer-case-summary flex w-full flex-col items-start gap-3 text-left">
      <button onClick={onClick} className="w-full text-left">
        <p className="text-lg font-bold leading-tight tracking-tight text-slate-50">
          {vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Vehicle not selected yet'}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-400">Case {caseDoc.caseNum}</p>
      </button>
      <div className="flex w-full flex-wrap items-center gap-2">
        <StageBadge stageKey={caseDoc.currentStage} label={stageLabel(caseDoc.currentStage)} />
        <span className="text-xs text-slate-500">{updatedLabel}</span>
      </div>
      {caseDoc.statusNote ? <p className="line-clamp-2 w-full text-sm leading-relaxed text-slate-300">{caseDoc.statusNote}</p> : null}
      <p className="text-sm font-medium text-slate-100">{nextStep}</p>
      {caseDoc.currentQuotationId ? <dl className="grid w-full gap-3 border-t border-ink-700 pt-3 sm:grid-cols-2"><div><dt className="text-xs text-slate-300">Total quoted</dt><dd className="mt-1 font-semibold">{quote ? <MoneyText cents={quote.totalDueCents} currency={currency} /> : quoteError ? 'Not available' : 'Loading…'}</dd></div><div><dt className="text-xs text-slate-300">Confirmed payments</dt><dd className="mt-1 font-semibold">{quote ? <MoneyText cents={quote.totalPaidCents} currency={currency} /> : quoteError ? 'Not available' : 'Loading…'}</dd></div></dl> : null}
      <div className="mt-auto flex w-full items-end justify-between gap-3 border-t border-ink-700/70 pt-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Balance</p>
          {balanceKnown && caseDoc.balanceDueCents > 0 ? (
            <p className="mt-0.5 text-base font-semibold text-amber-200"><MoneyText cents={caseDoc.balanceDueCents} currency={currency} /></p>
          ) : balanceKnown ? (
            <p className="mt-0.5 text-base font-semibold text-slate-300">Settled</p>
          ) : caseDoc.quotationVersion === 0 ? (
            <p className="mt-0.5 text-sm text-slate-500">Not quoted</p>
          ) : (
            <p className="mt-0.5 text-sm text-slate-500">Not available</p>
          )}
        </div>
        <span className="text-lg text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400" aria-hidden>›</span>
      </div>
      <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row"><button onClick={onClick} className="btn-primary">View my import</button>{whatsapp ? <a href={whatsappLink(whatsapp, `Hello, I need an update on Case ${caseDoc.caseNum}.`)} target="_blank" rel="noreferrer" className="btn-ghost">Ask my agency on WhatsApp</a> : null}</div>
    </section>
  );
}

function StaffDashboard() {
  const { claims } = useAuth();
  const companyId = claims.companyId;
  const navigate = useNavigate();
  const { data: cases, loading, error } = useCases(companyId);
  const { data: company } = useCompanyDoc(companyId);
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof api.dashboardOverview>> | null>(null);
  const [overviewError, setOverviewError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [dealer, setDealer] = useState<DealerWorkspace | undefined>();
  const [dealerError, setDealerError] = useState('');
  useEffect(() => {
    let active = true;
    if (!companyId) return;
    dealerCall<DealerWorkspace>('dealershipWorkspace', {}).then(d => { if (active) { setDealer(d); setDealerError(''); } }).catch(err => { if (active) setDealerError(`Dealer activity unavailable: ${err?.message ?? 'try again shortly'}`); });
    return () => { active = false; };
  }, [companyId, refresh]);
  useEffect(() => {
    let active = true; setOverview(null); setOverviewError('');
    if (!companyId || loading) return;
    api.dashboardOverview({}).then(data => { if (active) setOverview(data); }).catch(err => { if (active) setOverviewError(err.message); });
    return () => { active = false; };
  }, [companyId, cases, loading, refresh]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  function runSearch(mode: 'caseNum' | 'customer' | 'vin') {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    setSearching(true);
    api
      .searchCases({ mode, q: q.trim() })
      .then((res) => setResults(res.hits))
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }

  const caseById = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases]);
  const list = useMemo(
    () =>
      results === null
        ? cases.map((c) => ({
            caseId: c.id,
            caseNum: c.caseNum,
            currentStage: c.currentStage,
            customerId: c.customerId,
            vehicleId: c.vehicleId,
            customerName: undefined,
          }))
        : results,
    [results, cases],
  );

  return (
    <div>
      <PageHeader
        title="Your work today"
        eyebrow={company?.operationMode === 'clearing' ? 'Clearing operations' : company?.operationMode === 'sourcing' ? 'Sourcing operations' : 'Sourcing & clearing'}
        subtitle="Your agency’s cases, outstanding balances and next actions"
        right={
          <button
            onClick={() => navigate('/app/new/case')}
            className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-[rgb(var(--accent-contrast-rgb,255_255_255))]"
          >
            + New enquiry
          </button>
        }
      />

      {overviewError ? <ErrorState message={`Overview unavailable: ${overviewError}`} /> : null}
      {claims.appRole === 'admin' ? <TrialBanner /> : null}
      <AgencyLaunchChecklist workspace={dealer} workspaceError={dealerError} /><DealerOverview data={dealer} error={dealerError} />
      {!loading && cases.length > 0 ? <>
        <dl className="dashboard-totals"><div><dt>Active cases</dt><dd>{overview ? overview.activeCases : '…'}</dd></div><div><dt>Needs attention</dt><dd>{overview ? `${overview.attentionCount} ${overview.attentionCount === 1 ? 'action' : 'actions'}` : '…'}</dd></div><div><dt>Outstanding across cases</dt><dd>{overview ? <MoneyText cents={overview.outstandingCents} currency="USD" /> : '…'}</dd></div></dl>
        <section className="dashboard-section" aria-label="Agency attention queue"><div className="flex flex-wrap items-center justify-between gap-2"><h2>Needs your attention</h2><button className="text-sm text-slate-300 underline" onClick={() => setRefresh(value => value + 1)}>Refresh overview</button></div>{overview ? overview.tasks.length ? overview.tasks.map((task,index) => <article className="attention-row" key={`${task.kind}-${task.caseId}-${index}`}><div><h3>{task.title}</h3><p>{task.caseNum} · {task.detail}</p></div><Link className="btn-ghost" to={`/app/cases/${task.caseId}`}>{task.kind === 'payment' ? 'Review payment' : task.kind === 'document' ? 'Review document' : 'Open case'}</Link></article>) : <p className="text-sm text-slate-300">No quotations, pending payments or validated documents waiting for review.</p> : <p role="status" className="text-sm text-slate-300">Loading agency overview…</p>}<p className="interface-note mt-3">Totals cover the whole agency. Up to four actions of each type are shown.</p></section>
      </> : null}
      {!loading && !error && cases.length === 0 ? <section className="workflow-record my-6"><h2 className="font-display text-2xl font-bold">Your agency is ready</h2><p className="mt-3 text-sm text-slate-300">For customer imports, begin with a customer enquiry even if the vehicle has not been chosen. Local vehicle sales are managed under Dealer.</p><div className="marketing-actions"><Link to="/app/new/customer" className="btn-primary">Add first customer</Link>{claims.appRole === 'admin' ? <Link to="/app/operations" className="btn-ghost">Invite a team member</Link> : null}</div><ol className="mt-5 list-inside list-decimal space-y-2 text-sm text-slate-300"><li>Add a customer</li><li>Open an enquiry</li><li>{company?.operationMode === 'clearing' ? 'Attach the customer’s vehicle and import documents' : 'Attach the sourced vehicle and supplier reference'}</li><li>Issue a quotation and invite the customer</li></ol></section> : null}
      {cases.length > 0 ? <section className="dashboard-section"><h2>Recent imports</h2><p className="interface-note">{cases.length} recent cases loaded · search for older imports, or <Link to="/app/operations" className="underline">browse all cases</Link>.</p></section> : null}
      <div className="mb-3">
        <input
          className="field"
          placeholder="Search case number, customer or VIN…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (!e.target.value) setResults(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') runSearch('caseNum');
          }}
        />
        {q.trim() ? (
          <div className="mt-2 flex gap-2">
            {(['caseNum', 'customer', 'vin'] as const).map((m) => (
              <button
                key={m}
                onClick={() => runSearch(m)}
                className="flex-1 rounded-lg border border-ink-700 bg-ink-900 py-1.5 text-xs font-medium text-slate-300"
              >
                {m === 'caseNum' ? 'By case' : m === 'customer' ? 'By customer' : 'By VIN'}
              </button>
            ))}
          </div>
        ) : null}
        {searching ? <p className="mt-2 text-xs text-slate-500">Searching…</p> : null}
        {results && results.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">No cases matched.</p>
        ) : null}
      </div>

      {error ? <ErrorState message={error} /> : null}

      {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading…</p> : null}

      {!loading && cases.length > 0 && list.length === 0 ? (
        <EmptyState
          title="No cases yet"
            hint="Add a customer from Team, then open their enquiry. You can attach a vehicle later."
        />
      ) : (
        <div className="case-list-grid grid gap-3">
          {list.map((hit) => {
            const full = caseById.get(hit.caseId);
            return (
              <CaseRow
                key={hit.caseId}
                caseDoc={{
                  id: hit.caseId,
                  caseNum: hit.caseNum,
                  currentStage: hit.currentStage,
                  balanceDueCents: full?.balanceDueCents ?? 0,
                  updatedAt: (full?.updatedAt as unknown) ?? null,
                }}
                customerName={hit.customerName}
                onClick={() => navigate(`/app/cases/${hit.caseId}`)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function CustomerDashboard() {
  const { claims } = useAuth();
  const navigate = useNavigate();
  const { data: company } = useCompanyDoc(claims.companyId);
  const stages = useCompanyStages(claims.companyId);
  const settings = useCompanySettings(claims.companyId);
  const { data: cases, loading, error } = useCustomerCases(claims.companyId, claims.customerId);
  const vehicles = useVehiclesByIds(claims.companyId, cases.map((c) => c.vehicleId));
  const currency = settings?.currency || 'USD';
  const emptyHelp = company?.contactWhatsapp
    ? (
      <a
        href={whatsappLink(company.contactWhatsapp, 'Hello, I would like help with my vehicle import.')}
        target="_blank"
        rel="noreferrer"
        className="btn-primary"
      >
        Contact the agency on WhatsApp
      </a>
    )
    : null;

  return (
    <div>
      <PageHeader title="My vehicles" eyebrow="Customer portal" subtitle="Your purchases and imports, confirmed payments and next steps" />
      <RetailPurchaseCards />
      {error ? <ErrorState message={error} /> : null}
      {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading your imports…</p> : null}
      {!loading && !error && cases.length === 0 ? (
        <EmptyState
          title="No active imports"
          hint="Once your agent opens an import against your account, it will appear here."
          action={emptyHelp}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {cases.map((c) => (
            <CustomerCaseCard
              key={c.id}
              caseDoc={c}
              vehicle={vehicles[c.vehicleId]}
              currency={currency}
              whatsapp={company?.contactWhatsapp}
              nextStep={c.currentStage === 'delivered' ? 'Import completed' : !stages.keys.length ? 'Loading next step…' : stages.keys[stages.keys.indexOf(c.currentStage) + 1] && stages.keys.includes(c.currentStage) ? `Next step: ${stages.labels[stages.keys[stages.keys.indexOf(c.currentStage) + 1]] ?? stageLabel(stages.keys[stages.keys.indexOf(c.currentStage) + 1])}` : 'Ask your agency about the next step'}
              onClick={() => navigate(`/app/cases/${c.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
