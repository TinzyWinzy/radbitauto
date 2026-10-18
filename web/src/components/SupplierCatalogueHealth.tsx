import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { Button } from './ui';
type Status={status:string;count:number;lastAttemptAt:string|null;lastSuccessAt:string|null;lastError:string;consecutiveFailures:number};
export default function SupplierCatalogueHealth(){
 const [status,setStatus]=useState<Status>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){const r=await httpsCallable(functions,'supplierCatalogueStatus')({});setStatus(r.data as Status);}
 useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
 async function refresh(){setBusy(true);setError('');try{await httpsCallable(functions,'refreshSupplierCatalogue',{timeout:250000})({});}catch(e){setError((e as Error).message);}finally{try{await load();}catch(e){setError((e as Error).message);}setBusy(false);}}
 const stale=!status?.lastSuccessAt||Date.now()-Date.parse(status.lastSuccessAt)>48*3600000;
 return <section className="card my-5" aria-label="Supplier catalogue health"><h2>Import catalogue health</h2>{status?<><p role={status.status==='failed'||stale?'alert':'status'}>{status.status==='failed'||stale?'Attention needed — saved listings remain available.':status.status==='refreshing'?'Refresh in progress.':'Supplier selection is up to date.'}</p><p>{status.count} saved vehicles · {status.consecutiveFailures} consecutive failures</p><p>Last successful refresh: {status.lastSuccessAt?new Date(status.lastSuccessAt).toLocaleString():'Not recorded'}</p><p>Last attempt: {status.lastAttemptAt?new Date(status.lastAttemptAt).toLocaleString():'Not recorded'}</p>{status.lastError&&<p>{status.lastError}</p>}</>:<p>Loading supplier status…</p>}<Button onClick={()=>void refresh()} loading={busy}>Refresh supplier selection</Button><Button variant="ghost" onClick={()=>void load().catch(e=>setError(e.message))}>Check status</Button>{error&&<p role="alert">{error}</p>}</section>;
}
