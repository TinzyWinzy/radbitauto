import { Link } from 'react-router-dom';
import { dealerMoney as money } from '../lib/dealer';
import { useAuth } from '../lib/auth';
export type DealerWorkspace = {
  dealer_leads: { status: string; followUp: string }[];
  dealer_stock: { status: string; published?: boolean }[];
  dealer_sales: { stockId: string; status: string; agreedPriceCents: number; paidCents: number }[];
  dealer_costs?: { id: string; complete: boolean; acquisitionCents: number; directCostsCents: number }[];
  dealer_acquisitions: { stage: string }[];
};
export default function DealerOverview({ data, error }: { data?: DealerWorkspace; error?: string }) {
  const { claims } = useAuth();
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const leads = data?.dealer_leads.filter(l => !['won', 'lost'].includes(l.status)) ?? [];
  const due = leads.filter(l => l.followUp && l.followUp <= today).length;
  const delivered = data?.dealer_sales.filter(s => s.status === 'delivered') ?? [];
  const complete = delivered.filter(s => data?.dealer_costs?.some(c => c.id === s.stockId && c.complete));
  const margin = complete.reduce((n, s) => {
    const cost = data!.dealer_costs!.find(c => c.id === s.stockId)!;
    return n + s.agreedPriceCents - cost.acquisitionCents - cost.directCostsCents;
  }, 0);
  const kpis: { label: string; value: number; tab: string }[] = [
    { label: 'Open enquiries', value: leads.length, tab: 'leads' },
    { label: 'Follow-ups due', value: due, tab: 'leads' },
    { label: 'Available stock', value: data?.dealer_stock.filter(s => s.status === 'available').length ?? 0, tab: 'stock' },
    { label: 'Reserved sales', value: data?.dealer_sales.filter(s => s.status === 'reserved').length ?? 0, tab: 'sales' },
  ];
  return (
    <section className="dashboard-section my-5" aria-label="Dealer sales and stock">
      <h2>Sales and stock</h2>
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p>Loading dealer activity…</p>
      ) : (
        <>
          <div className="my-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map(k => (
              <Link key={k.label} to={`/app/dealership?tab=${k.tab}`} className="card block w-full text-left transition hover:border-ink-600">
                <p className="text-xs text-slate-400">{k.label}</p>
                <p className="mt-2 text-xl font-semibold">{k.value}</p>
              </Link>
            ))}
          </div>
          {claims.appRole === 'admin' ? (
            <p className="mb-3 text-sm">
              Active dealer acquisitions: {data.dealer_acquisitions.filter(a => a.stage !== 'stocked').length}. Recorded margin from {complete.length} complete-cost delivered sales: <strong>{money(margin)}</strong>. {delivered.length - complete.length} delivered sales have incomplete costs. Excludes overheads.
            </p>
          ) : null}
          <Link className="btn-ghost" to="/app/dealership">Open dealership</Link>
        </>
      )}
    </section>
  );
}
