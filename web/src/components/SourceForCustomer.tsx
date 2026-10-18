import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useCustomers } from '../lib/hooks';
import { Button, Input, Select, TextArea } from './ui';

export default function SourceForCustomer({vehicleId}:{vehicleId:string}) {
  const {claims}=useAuth();
  const staff=['admin','staff'].includes(claims.appRole??'');
  const {data:customers,loading}=useCustomers(staff?claims.companyId:undefined);
  const [open,setOpen]=useState(false),[customer,setCustomer]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ref,setRef]=useState('');
  const [requestId]=useState(()=>crypto.randomUUID());
  if(!staff)return null;
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setError('');
    try{const f=new FormData(e.currentTarget);const result=await httpsCallable(functions,'sourceSupplierVehicle')({...Object.fromEntries(f),customerId:customer||undefined,supplierVehicleId:vehicleId,requestId,budgetCents:Math.round(Number(f.get('budget')||0)*100)});setRef((result.data as {ref:string}).ref);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <section id="dealer-sourcing" className="card my-5" aria-label="Dealer sourcing"><h3>Source this vehicle for a customer</h3><p className="interface-note">Save it to your dealership enquiries, then confirm availability and prepare the import quotation.</p>{ref?<div role="status"><p>Sourcing enquiry {ref} created.</p><Link className="btn-primary" to="/app/dealership?tab=leads">Open dealership enquiries</Link></div>:<><Button onClick={()=>setOpen(v=>!v)} aria-expanded={open}>Source for customer</Button>{open&&<form onSubmit={submit} className="grid gap-4 mt-4"><label>Customer<Select value={customer} onChange={e=>setCustomer(e.target.value)} disabled={busy||loading}><option value="">New customer enquiry</option>{customers.filter(c=>c.isActive).map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</Select></label>{!customer&&<><label>Customer name<Input name="name" required maxLength={150}/></label><label>Customer WhatsApp / phone<Input name="phone" type="tel" required maxLength={50}/></label></>}<label>Import budget (USD, optional)<Input name="budget" type="number" min="0" step="0.01"/></label><label>Sourcing notes<TextArea name="preferences" maxLength={1500}/></label><Button loading={busy} disabled={loading}>Save sourcing enquiry</Button>{error&&<p role="alert">{error}</p>}</form>}</>}</section>;
}
