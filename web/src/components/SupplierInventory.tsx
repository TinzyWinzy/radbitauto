import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import PublicStockBrowser from './PublicStockBrowser';
import { StockSpecList, type StockSpecs } from './StockSpecifications';
import { Button, Input, Select, TextArea } from './ui';
import { whatsappLink } from '../lib/share';
import { enquiryRequestText, saveOpenEnquiry } from '../lib/enquiry';
import EnquiryRequestSheet from './EnquiryRequestSheet';
export type SupplierVehicle={id:string;title:string;listingUrl:string;photos:string[];location:string;askingPriceCents:number;checkedAt:string;specs:StockSpecs};
type Dealer={slug:string;name:string;operationMode:string};
async function call<T>(name:string,data:unknown):Promise<T>{return (await httpsCallable(functions,name)(data)).data as T;}
export default function SupplierInventory({vehicleId}:{vehicleId?:string}) {
  const [stock,setStock]=useState<SupplierVehicle[]>(),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;setStock(undefined);setError('');void call<{stock:SupplierVehicle[]}>('publicSupplierCatalogue',{}).then(d=>{if(active)setStock(d.stock);}).catch(()=>{if(active)setError('We couldn’t load the import selection. Please try again.');});return()=>{active=false;};},[retry]);
  if(error)return <div className="catalogue-empty" role="alert"><p>{error}</p><Button onClick={()=>setRetry(v=>v+1)}>Try again</Button></div>;
  if(!stock)return <p role="status">Loading BE FORWARD vehicles…</p>;
  if(vehicleId){const vehicle=stock.find(v=>v.id===vehicleId);return vehicle?<SupplierDetail key={vehicle.id} vehicle={vehicle}/>:<div className="catalogue-empty"><h2>This supplier listing is no longer in the current selection.</h2><p>Choose another vehicle for a dealer to verify.</p><Link className="btn-primary" to="/imports">Browse import vehicles</Link></div>;}
  return <>{stock.length?<PublicStockBrowser stock={stock.map(v=>({...v,source:'beforward' as const,dealerName:'BE FORWARD',slug:''}))} limited/>:<div className="catalogue-empty"><h3>The import selection is being refreshed.</h3><p>Supplier listings expire after 48 hours. Please check back for a current selection.</p><Button onClick={()=>setRetry(v=>v+1)}>Check again</Button></div>}</>;
}
type Sent={name:string;whatsapp:string;ref:string;request:string};
function SupplierDetail({vehicle:v}:{vehicle:SupplierVehicle}) {
  const [photos,setPhotos]=useState(v.photos);
  useEffect(()=>{let active=true;void call<{photos:string[]}>('publicSupplierVehicle',{supplierVehicleId:v.id}).then(d=>{if(active&&d.photos.length)setPhotos(d.photos);}).catch(()=>{});return()=>{active=false;};},[v.id]);
  const requestKey=`radbit:auto:supplier-enquiry-request:v1:${v.id}`;
  const [photo,setPhoto]=useState(0),[dealers,setDealers]=useState<Dealer[]>([]),[dealerError,setDealerError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [requestId,setRequestId]=useState(()=>{try{return sessionStorage.getItem(requestKey)||crypto.randomUUID();}catch{return crypto.randomUUID();}});
  const sentKey=`radbit:auto:supplier-enquiry-sent:v1:${v.id}`;
  const [sent,setSent]=useState<Sent|null>(()=>{try{const raw=sessionStorage.getItem(sentKey);return raw?JSON.parse(raw) as Sent:null;}catch{return null;}}),[notice,setNotice]=useState(''),[sheet,setSheet]=useState(false);
  function newRequestId(){const next=crypto.randomUUID();setRequestId(next);try{sessionStorage.setItem(requestKey,next);}catch{ /* A reload then starts a new enquiry instead of repeating this one. */ }}
  function resetEnquiry(){setSent(null);setNotice('');try{sessionStorage.removeItem(sentKey);}catch{ /* Nothing stored. */ }newRequestId();}
  useEffect(()=>{let active=true;setLoading(true);setDealerError('');void (async()=>{const result:Dealer[]=[];let cursor:string|null=null;do{const page: {dealers:Dealer[];nextCursor:string|null}=await call('publicImportDealers',cursor?{cursor}:{});result.push(...page.dealers);cursor=page.nextCursor;}while(cursor);if(active)setDealers(result);})().catch(()=>{if(active)setDealerError('We couldn’t load dealers. Please try again.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[retry]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget),dealerSlug=String(f.get('slug')||'');
    const buyerName=String(f.get('name')||''),phone=String(f.get('phone')||''),budget=String(f.get('budget')||''),notes=String(f.get('preferences')||'');
    setBusy(true);setError('');setNotice('');
    try{
      const r=await call<{received:boolean;ref?:string;dealer?:{name?:string;whatsapp?:string}}>('enquireSupplierVehicle',{...Object.fromEntries(f),requestId,supplierVehicleId:v.id,budgetCents:Math.round(Number(budget||0)*100)});
      const dealer=dealers.find(d=>d.slug===dealerSlug);
      const name=r.dealer?.name||dealer?.name||'your dealer',ref=r.ref||'',whatsapp=r.dealer?.whatsapp||'',pageUrl=`${window.location.origin}/imports/${v.id}`;
      const request=enquiryRequestText({ref,dealerName:name,buyerName,phone,budget:budget?`USD ${Number(budget).toLocaleString('en-US', { maximumFractionDigits: 2 })}`:'Not stated',vehicleTitle:v.title,supplierId:v.id,supplierPrice:`USD ${(v.askingPriceCents/100).toLocaleString('en-US',{minimumFractionDigits:2})}`,location:v.location||'Confirm with dealer',listingUrl:v.listingUrl,pageUrl,notes});
      setSent({name,whatsapp,ref,request});
      try{sessionStorage.setItem(sentKey,JSON.stringify({name,whatsapp,ref,request}));}catch{ /* The WhatsApp thread keeps the record. */ }
      if(ref)saveOpenEnquiry({ref,vehicleId:v.id,title:v.title,dealerName:name,dealerSlug,dealerWhatsapp:whatsapp,url:pageUrl,at:Date.now()});
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function copyRequest(){
    if(!sent)return;
    try{await navigator.clipboard.writeText(sent.request);setNotice('Request copied. Paste it into WhatsApp or email.');}
    catch{setSheet(true);setNotice('Copying is unavailable here. Select the text in the open document instead.');}
  }
  const actions=sent&&<>
    <div className="stock-card-actions mt-4">
      {sent.whatsapp&&<a className="btn-primary" href={whatsappLink(sent.whatsapp,`Hi ${sent.name},\n\n${sent.request}`)} target="_blank" rel="noreferrer">Continue on WhatsApp</a>}
      <button className="btn-ghost" onClick={()=>{setSheet(true);setNotice('');}}>Download request (PDF)</button>
      <button className="btn-ghost" onClick={()=>{void copyRequest();}}>Copy request</button>
      <a className="btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(`${v.title} · Supplier reference ${v.id} · ${window.location.origin}/imports/${v.id}`)}`} target="_blank" rel="noreferrer">Share this car</a>
    </div>
    {notice&&<p className="interface-note mt-3" aria-live="polite">{notice}</p>}
    <div className="mt-3"><button className="btn-ghost" onClick={resetEnquiry}>Send another enquiry</button></div>
    {sheet&&<EnquiryRequestSheet text={sent.request} onClose={()=>setSheet(false)}/>}
  </>;
  return <><Link to="/imports">← Browse import vehicles</Link><div className="vehicle-detail-grid supplier-detail"><div>{photos[photo]?<img className="vehicle-main-photo" src={photos[photo]} alt={`${v.title}, photo ${photo+1}`} referrerPolicy="no-referrer"/>:<p>Photo unavailable</p>}<div className="vehicle-thumbnails">{photos.map((src,i)=><button key={src+i} aria-label={`View photo ${i+1}`} aria-pressed={photo===i} onClick={()=>setPhoto(i)}><img src={src} alt="" loading="lazy" referrerPolicy="no-referrer"/></button>)}</div></div><div><p className="interface-eyebrow">BE FORWARD · Available to import</p><h2>{v.title}</h2><p className="catalogue-price">USD {(v.askingPriceCents/100).toLocaleString()}</p><p className="interface-note">Supplier vehicle price. Shipping, insurance, duties, clearing, delivery and dealer fees are quoted separately.</p><StockSpecList specs={v.specs}/><p>Location: {v.location||'To be confirmed'}</p><p>Supplier reference: {v.id}</p><p className="interface-note">Listed when checked {new Date(v.checkedAt).toLocaleString()}. Your dealer confirms availability, condition and the full import cost before you commit.</p><a className="btn-primary" href="#import-enquiry">Choose a dealer for this car</a></div></div><section id="import-enquiry" className="showroom-enquiry supplier-enquiry"><div><p className="interface-eyebrow">Your car. Your import dealer.</p><h2>Let a dealer verify it.</h2><p>Pick a participating dealer. They receive this vehicle, its photos and supplier reference, then confirm availability and prepare your quotation.</p><p className="interface-note">Sending an enquiry does not reserve a car or collect payment.</p></div><div>{sent?<div><p role="status">Your request has reached {sent.name}. They will verify {v.id} with BE FORWARD and contact you about the import quote.</p>{sent.ref&&<p className="interface-note">Enquiry reference {sent.ref}. Keep it for follow-up on WhatsApp or by email.</p>}{actions}</div>:loading?<p role="status">Finding import dealers…</p>:dealerError?<div role="alert"><p>{dealerError}</p><Button onClick={()=>setRetry(n=>n+1)}>Try again</Button></div>:!dealers.length?<p>No participating import dealers are accepting enquiries yet. Please check back.</p>:<form onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2">Choose your import dealer<Select name="slug" required defaultValue="" onChange={newRequestId}><option value="" disabled>Select a dealer</option>{dealers.map(d=><option key={d.slug} value={d.slug}>{d.name}</option>)}</Select></label><label>Your name<Input name="name" required maxLength={150} autoComplete="name"/></label><label>WhatsApp / phone<Input name="phone" required type="tel" maxLength={50} autoComplete="tel"/></label><label className="sm:col-span-2">Total import budget (USD, optional)<Input name="budget" type="number" min="0" max="100000000" step="0.01"/></label><label className="sm:col-span-2">Questions for your dealer<TextArea name="preferences" maxLength={1500} defaultValue={`Please verify ${v.title} (${v.id}) and quote the full import cost.`}/></label><Button loading={busy}>Request verification &amp; quote</Button>{error&&<p className="sm:col-span-2" role="alert">{error}</p>}</form>}</div></section></>;
}
