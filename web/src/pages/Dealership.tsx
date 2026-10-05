import { StockSpecFields, stockSpecsFromForm, type StockSpecs } from '../components/StockSpecifications';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useCompanyDoc, useCustomers, useVehicles, useStaff, useUserNames } from '../lib/hooks';
import { Button, Card, Input, Select, TextArea } from '../components/ui';
import { PageHeader } from '../components/status';
import StockPhotos from '../components/StockPhotos';

type Stock = { id: string; title: string; status: string; location: string; askingPriceCents: number; ownership: string; published?:boolean; description?:string; photos?:string[]; publicSpecs?:StockSpecs };
type Sale = { id: string; stockId: string; title: string; customerName: string; agreedPriceCents: number; paidCents: number; status: string; expiresAt: string };
type Lead = { id: string; name: string; phone: string; interest: string; status: string; preferences: string; budgetCents: number; followUp: string; customerId?:string;assignedTo?:string;stockId?:string;stockTitle?:string };
type Workspace = { dealer_stock: Stock[]; dealer_sales: Sale[]; dealer_leads: Lead[]; dealer_costs?: {id: string; acquisitionCents: number; directCostsCents: number; complete: boolean}[] };
const money = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
async function call(name: string, data: unknown) { return (await httpsCallable(functions, name)(data)).data; }
function usd(value: FormDataEntryValue | null) {
  const raw = String(value || '0');
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error('Enter USD amounts with at most two decimal places.');
  return Math.round(Number(raw) * 100);
}
function FormField({ name, label, type = 'text', required = true }: { name: string; label: string; type?: string; required?: boolean }) {
  return <label className="block text-sm">{label}<Input aria-label={label} name={name} type={type} required={required} step={type === 'number' ? '0.01' : undefined} min={type === 'number' ? '0' : undefined} /></label>;
}

export default function Dealership() {
  const navigate=useNavigate();const location=useLocation();const [buyer,setBuyer]=useState((location.state as {customerId?:string}|null)?.customerId??'');
  const { claims } = useAuth(); const staff = claims.appRole === 'admin' || claims.appRole === 'staff';
  const { data: vehicles } = useVehicles(staff ? claims.companyId : undefined);
  const { data: customers } = useCustomers(staff ? claims.companyId : undefined);
  const { data: company } = useCompanyDoc(claims.companyId);
  const {data:team}=useStaff(staff?claims.companyId:undefined);const teamNames=useUserNames(team.map(s=>s.id));
  const [data, setData] = useState<Workspace>({ dealer_stock: [], dealer_sales: [], dealer_leads: [] });
  const [tab, setTab] = useState(buyer?'sales':'leads'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [loaded, setLoaded] = useState(false);
  async function refresh() { setData(await call('dealershipWorkspace', {}) as Workspace); setLoaded(true); }
  useEffect(() => { if (staff) void refresh().catch(e => setError(e.message)); }, [staff, claims.companyId]);
  async function submit(e: FormEvent<HTMLFormElement>, fn: string, transform: (f: FormData) => object) {
    e.preventDefault(); const form = e.currentTarget; setBusy(true); setError('');
    try { const payload=transform(new FormData(form));form.dataset.requestId??=crypto.randomUUID();await call(fn,fn==='updateDealerSale'?{...payload,requestId:form.dataset.requestId}:payload); await refresh(); form.reset();delete form.dataset.requestId; } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!staff) return <p>This workspace is for dealership staff.</p>;
  return <div className="space-y-5 pb-8">
    <PageHeader title="Dealership" subtitle="Follow up enquiries, sell stock and manage customer imports." />
    {company?.slug && <a className="btn-ghost" href={`/showroom/${company.slug}`} target="_blank" rel="noreferrer">Open your public showroom</a>}
    {claims.appRole==='admin'&&<Link className="btn-ghost" to="/app/acquisitions">Buy and import dealer stock</Link>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[['Open leads', data.dealer_leads.filter(l => !['won','lost'].includes(l.status)).length], ['Available stock', data.dealer_stock.filter(s => s.status === 'available').length], ['Reserved', data.dealer_sales.filter(s => s.status === 'reserved').length], ['Sales balance', money(data.dealer_sales.filter(s => s.status === 'reserved').reduce((n,s) => n+s.agreedPriceCents-s.paidCents,0))]].map(([label,value]) => <Card key={label}><p className="text-xs">{label}</p><p className="mt-2 break-words text-xl font-semibold">{value}</p></Card>)}
    </div>
    <div className="dealer-tabs grid grid-cols-3 gap-2">{['leads','stock','sales'].map(t => <Button key={t} variant={tab === t ? 'primary' : 'ghost'} onClick={() => setTab(t)} aria-pressed={tab === t}>{t[0].toUpperCase()+t.slice(1)}</Button>)}</div><Link className="btn-ghost" to="/app/new/case">Customer import</Link>
    {error && <p role="alert" className="rounded-lg border border-red-300 p-3">{error}</p>}
    {!loaded && !error && <p>Loading dealership…</p>}
    {tab === 'leads' && <>
      <Card><h2 className="mb-4 text-lg font-semibold">Capture an enquiry</h2><form className="grid gap-4 sm:grid-cols-2" onSubmit={e => submit(e,'saveDealerLead',f => ({...Object.fromEntries(f),budgetCents:usd(f.get('budget'))}))}>
        <FormField name="name" label="Customer name" /><FormField name="phone" label="WhatsApp / phone" type="tel" />
        <label>Looking for<Select name="interest" aria-label="Looking for"><option value="stock">Local stock</option><option value="import">Customer import</option><option value="either">Either</option></Select></label>
        <FormField name="budget" label="Budget (USD)" type="number" required={false} /><FormField name="followUp" label="Follow-up date" type="date" required={false} />
        <label>Vehicle preferences<TextArea name="preferences" aria-label="Vehicle preferences" /></label><Button loading={busy}>Save enquiry</Button>
      </form></Card>
      <div className="grid gap-3 lg:grid-cols-2">{data.dealer_leads.map(l => <Card key={l.id}><h3 className="font-semibold">{l.name}</h3><p>{l.phone} · {l.interest} · {money(l.budgetCents)}</p><p className="break-words">{l.stockTitle?<strong>Vehicle: {l.stockTitle} · </strong>:null}{l.preferences}</p><p>Follow-up: {l.followUp || 'Not scheduled'}</p><Select aria-label={`Status for ${l.name}`} value={l.status} disabled={busy} onChange={async e => { setBusy(true); try { await call('saveDealerLead',{...l,leadId:l.id,status:e.target.value}); await refresh(); } catch(e) {setError((e as Error).message);} finally {setBusy(false);} }}>{['new','contacted','viewing','won','lost'].map(s => <option key={s}>{s}</option>)}</Select>
        <form className="mt-3 space-y-2" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);try{const r=await call('convertDealerLead',{leadId:l.id,customerId:f.get('existingCustomer')||undefined}) as {customerId:string};await refresh();if(f.get('journey')==='import')navigate('/app/new/case',{state:{customerId:r.customerId}});else{setBuyer(r.customerId);setTab('sales');}}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
          {!l.customerId&&<label>Customer record<Select name="existingCustomer" aria-label={`Customer for ${l.name}`}><option value="">Create from this enquiry</option>{customers.filter(c=>c.isActive).map(c=><option value={c.id} key={c.id}>{c.fullName}</option>)}</Select></label>}
          <label>Continue as<Select name="journey" aria-label={`Journey for ${l.name}`}><option value="sale">Stock sale</option><option value="import">Customer import</option></Select></label><Button loading={busy}>Continue enquiry</Button>
        </form>
        <form className="mt-4 space-y-2 border-t pt-3" onSubmit={e=>submit(e,'saveDealerLead',f=>({...l,leadId:l.id,...Object.fromEntries(f)}))}><label>Next follow-up<Input name="followUp" type="date" defaultValue={l.followUp} aria-label={`Follow-up for ${l.name}`}/></label><label>Assigned salesperson<Select name="assignedTo" defaultValue={l.assignedTo} aria-label={`Salesperson for ${l.name}`}>{team.filter(t=>t.isActive).map(t=><option key={t.id} value={t.id}>{teamNames[t.id]?.fullName||teamNames[t.id]?.email||t.id}</option>)}</Select></label><Button loading={busy} variant="ghost">Save follow-up</Button></form>
      </Card>)}</div>
    </>}
    {tab === 'stock' && <>
      <Card><h2 className="mb-4 text-lg font-semibold">Add a registered vehicle to stock</h2><Link className="btn-ghost mb-4" to="/app/new/vehicle">Register vehicle</Link><form className="grid gap-4 sm:grid-cols-2" onSubmit={e => submit(e,'addDealerStock',f => ({...Object.fromEntries(f),askingPriceCents:usd(f.get('asking')),acquisitionCents:usd(f.get('acquisition')),directCostsCents:usd(f.get('costs')),costsComplete:f.get('complete')==='on'}))}>
        <label>Vehicle<Select name="vehicleId" required aria-label="Stock vehicle"><option value="">Choose a vehicle</option>{vehicles.filter(v => !v.allocation&&!v.customerIds?.length&&!data.dealer_stock.some(s => s.id === v.id)).map(v => <option value={v.id} key={v.id}>{v.year} {v.make} {v.model} · {v.vinChassisUpper}</option>)}</Select></label>
        <label>Ownership<Select name="ownership" aria-label="Ownership"><option value="owned">Dealer owned</option><option value="consigned">Consigned for a customer</option></Select></label>
        <FormField name="location" label="Vehicle location" /><FormField name="asking" label="Asking price (USD)" type="number" /><FormField name="acquisition" label="Acquisition / owner settlement cost (USD)" type="number" /><FormField name="costs" label="Other direct costs (USD)" type="number" />
        <label className="flex items-center gap-2"><input type="checkbox" name="complete" />Actual costs are complete</label><Button loading={busy}>Add stock</Button>
      </form></Card>
      <div className="grid gap-3 lg:grid-cols-2">{data.dealer_stock.map(s => <Card key={s.id}><h3 className="font-semibold">{s.title}</h3><p>{s.location} · {s.ownership} · {s.status}</p><p className="text-xl">{money(s.askingPriceCents)}</p>
        <StockPhotos companyId={claims.companyId!} stockId={s.id} photos={s.photos??[]} description={s.description??''} published={s.published===true&&s.status==='available'} refresh={refresh}/>
        <form className="mt-4 space-y-3" onSubmit={e => submit(e,'publishDealerStock',f => ({stockId:s.id,published:f.get('published')==='on',publicSpecs:stockSpecsFromForm(f),description:f.get('description'),photos:String(f.get('photos')).split('\n').map(p => p.trim()).filter(Boolean)}))}>
          {(()=>{const v=vehicles.find(v=>v.id===s.id);return <StockSpecFields key={JSON.stringify(s.publicSpecs)} specs={{make:v?.make,model:v?.model,year:v?.year,engineCc:v?.engineCc,...s.publicSpecs}}/>;})()}<label className="block">Public description<TextArea name="description" aria-label={`Description for ${s.title}`} defaultValue={s.description ?? ''} /></label>
          <label className="block">Photo links (HTTPS, one per line)<TextArea key={s.photos?.join('|')} name="photos" aria-label={`Photos for ${s.title}`} defaultValue={s.photos?.join('\n') ?? ''} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" name="published" defaultChecked={s.published} disabled={s.status !== 'available'} />Publish available stock</label><Button loading={busy}>Save showroom listing</Button>
        </form>
        {claims.appRole==='admin'&&(()=>{const cost=data.dealer_costs?.find(c=>c.id===s.id);return <form className="mt-5 space-y-3 border-t pt-4" onSubmit={e=>submit(e,'updateDealerStockDetails',f=>({stockId:s.id,...(s.status==='available'?{askingPriceCents:usd(f.get('asking')),location:f.get('location')}:{}),acquisitionCents:usd(f.get('acquisition')),directCostsCents:usd(f.get('direct')),complete:f.get('complete')==='on',reason:f.get('reason')}))}>
          <h4 className="font-semibold">Owner cost and price controls</h4>{s.status==='available'&&<><label>Asking price (USD)<Input name="asking" type="number" min="0" step="0.01" defaultValue={s.askingPriceCents/100}/></label><label>Location<Input name="location" required defaultValue={s.location}/></label></>}
          <label>Actual acquisition cost (USD)<Input name="acquisition" required type="number" min="0" step="0.01" defaultValue={cost?.acquisitionCents==null?'':cost.acquisitionCents/100}/></label><label>Other actual direct costs (USD)<Input name="direct" required type="number" min="0" step="0.01" defaultValue={cost?.directCostsCents==null?'':cost.directCostsCents/100}/></label><label className="flex items-center gap-2"><input name="complete" type="checkbox" defaultChecked={cost?.complete}/>Actual costs complete</label><label>Reason for revision<Input required name="reason"/></label><Button loading={busy}>Save cost / price revision</Button>
        </form>;})()}
      </Card>)}</div>
    </>}
    {tab === 'sales' && <>
      <Card><h2 className="mb-4 text-lg font-semibold">Reserve a vehicle</h2><Link className="btn-ghost mb-4" to="/app/new/customer">Add customer</Link><form className="grid gap-4 sm:grid-cols-2" onSubmit={e => submit(e,'reserveDealerStock',f => ({...Object.fromEntries(f),agreedPriceCents:usd(f.get('price')),expiresAt:new Date(String(f.get('expiresAt'))).toISOString()}))}>
        <label>Available vehicle<Select name="stockId" required aria-label="Available vehicle"><option value="">Choose stock</option>{data.dealer_stock.filter(s => s.status === 'available').map(s => <option key={s.id} value={s.id}>{s.title} · {money(s.askingPriceCents)}</option>)}</Select></label>
        <label>Buyer<Select name="customerId" required aria-label="Buyer" value={buyer} onChange={e=>setBuyer(e.target.value)}><option value="">Choose customer</option>{customers.filter(c => c.isActive).map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}</Select></label>
        <FormField name="price" label="Agreed price (USD)" type="number" /><FormField name="expiresAt" label="Reservation expires" type="datetime-local" /><label className="sm:col-span-2">Agreed sale / deposit terms<TextArea required name="terms" aria-label="Agreed sale terms" /></label><Button loading={busy}>Reserve vehicle</Button>
      </form></Card>
      {data.dealer_sales.map(s => <Card key={s.id}><h3 className="text-lg font-semibold">{s.title} · {s.customerName}</h3><p>{s.status} · reservation expires {new Date(s.expiresAt).toLocaleString()}</p><p>Price {money(s.agreedPriceCents)} · Received {money(s.paidCents)} · Balance {money(s.agreedPriceCents-s.paidCents)}</p>
        <Link className="btn-ghost mt-3" to={`/app/purchases/${s.id}`}>Purchase details and documents</Link>
        {(() => { const cost = data.dealer_costs?.find(c => c.id === s.stockId); return cost && (cost.acquisitionCents==null || cost.directCostsCents==null) ? <p className="mt-2">Margin unavailable: actual costs not recorded.</p> : cost ? <p className="mt-2">{s.status === 'delivered' && cost.complete ? 'Deal margin' : 'Estimated deal margin'}: {money(s.agreedPriceCents-cost.acquisitionCents-cost.directCostsCents)} · excludes business overheads</p> : null; })()}
        {s.status === 'reserved' && <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={e => submit(e,'updateDealerSale',f => ({...Object.fromEntries(f),saleId:s.id,amountCents:['payment','refund'].includes(String(f.get('action'))) ? usd(f.get('amount')):0,requestId:crypto.randomUUID()}))}>
          <label>Action<Select name="action" aria-label={`Action for ${s.customerName}`}><option value="payment">Confirm money received</option><option value="refund">Confirm refund completed</option><option value="cancel">Cancel reservation</option><option value="handover">Confirm vehicle handover</option></Select></label><FormField name="amount" label="Amount (USD, for payment/refund)" type="number" required={false} /><label className="sm:col-span-2">Bank/cash reference or signed handover acknowledgement<TextArea name="evidence" required aria-label="Transaction evidence" /></label><Button loading={busy}>Record action</Button>
        </form>}
      </Card>)}
    </>}
  </div>;
}

