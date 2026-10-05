import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

import { usd } from '../lib/format';
import { Button, Card } from '../components/ui';
import { PageHeader } from '../components/status';
import ImportDealResults from '../components/ImportDealResults';
import Invitations from './Invitations';

export default function Operations() {
  const { claims } = useAuth();
  const [report, setReport] = useState<Awaited<ReturnType<typeof api.agencyReport>> | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<(string | undefined)[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; setError(''); setReport(null); api.agencyReport({ cursor }).then((data) => { if (active) setReport(data); }).catch((error) => { if (active) setError(error.message); }); return () => { active = false; }; }, [cursor, claims.companyId]);
  if (!['staff', 'admin'].includes(claims.appRole ?? '')) return <p className="p-5">Agency staff access required.</p>;
  return <div className="operations-page space-y-4 pb-8"><PageHeader title="Agency operations" eyebrow="Reports & invitations" subtitle="Your agency’s records and secure access invitations" />
    {error ? <p role="alert">{error}</p> : null}
    {report ? <><div className="grid gap-3 sm:grid-cols-2"><Card>Total cases: {report.cases}</Card><Card>Outstanding: {usd(report.outstandingCents)}</Card><Card>Confirmed collections: {usd(report.collectedCents)}</Card><Card>Customer payments to suppliers: {usd(report.supplierPaidCents)}</Card><Card>Agency receipts for vehicle/import charges: {usd(report.passThroughCents)}</Card><Card>Agency service fee receipts: {usd(report.feeCollectionsCents)}</Card><Card>Mixed / unallocated receipts: {usd(report.unclassifiedCents)}</Card><Card>Current quoted agency fees: {usd(report.quotedFeesCents)}</Card></div><p className="text-sm">Totals cover all agency records. Collections are customer payments, not profit. Quoted fees are not recognized revenue.</p>
      <Card><h2 className="section-title">All cases</h2>{report.rows.map((row) => <Link key={row.id} to={`/app/cases/${row.id}`} className="flex min-h-12 items-center justify-between gap-2 border-b py-2"><span>{row.caseNum} · {row.stage.replaceAll('_', ' ')}</span><span>{usd(row.balanceDueCents)}</span></Link>)}<div className="mt-4 flex gap-3"><Button variant="ghost" disabled={!history.length} onClick={() => { setCursor(history.at(-1)); setHistory(history.slice(0, -1)); }}>Previous</Button><Button disabled={!report.nextCursor} onClick={() => { setHistory([...history, cursor]); setCursor(report.nextCursor ?? undefined); }}>Next 25 cases</Button></div></Card></> : <p>Loading agency report…</p>}
    {claims.appRole === 'admin' && <Invitations/>}
    {claims.appRole==='admin'&&<ImportDealResults/>}
  </div>;
}


