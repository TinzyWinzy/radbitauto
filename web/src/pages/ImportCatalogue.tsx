import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Brand from '../components/Brand';
import Seo from '../components/Seo';
import SupplierInventory from '../components/SupplierInventory';
import { clearOpenEnquiry, readOpenEnquiry, type OpenEnquiry } from '../lib/enquiry';
import { whatsappLink } from '../lib/share';
import '../marketing.css';

function OpenEnquiryStrip({ hidden }: { hidden: boolean }) {
  const [open, setOpen] = useState<OpenEnquiry | null>(() => readOpenEnquiry());
  if (!open || hidden) return null;
  return <section className="marketing-section" aria-label="Your open import enquiry"><p className="interface-eyebrow">Your open enquiry · {open.ref}</p><h2>{open.title}</h2><p>Chosen dealer: {open.dealerName}. Send your request for availability and quotation, then keep the reply with this reference.</p><div className="stock-card-actions"><Link className="btn-primary" to={`/imports/${open.vehicleId}`}>Return to this enquiry</Link>{open.dealerWhatsapp&&<a className="btn-ghost" href={whatsappLink(open.dealerWhatsapp,`Hi ${open.dealerName}, following up on import enquiry ${open.ref} for ${open.title}. ${open.url}`)} target="_blank" rel="noreferrer">Message your dealer</a>}<button className="btn-ghost" onClick={()=>{clearOpenEnquiry();setOpen(null);}}>Clear</button></div><p className="interface-note">Saved on this device. The full request lives in your WhatsApp thread with the dealer.</p></section>;
}

export default function ImportCatalogue(){const {vehicleId}=useParams();return <div className="marketing-page automotive-landing showroom-page"><Seo title="Browse BE FORWARD cars & choose an import dealer | Radbit Auto" description="Choose a BE FORWARD vehicle on Radbit Auto, then ask a participating dealer to verify availability and quote your import." path={vehicleId?`/imports/${vehicleId}`:'/imports'}/><header className="marketing-header"><Link className="product-wordmark" to="/"><Brand/></Link><nav><Link to="/#cars">Local stock</Link><Link to="/imports">Import cars</Link><Link to="/login">Sign in</Link></nav></header><main><section className="marketing-section"><p className="interface-eyebrow">BE FORWARD import selection</p><h1>Find the car.<br/>Choose your dealer.</h1><p>Browse supplier vehicles here. Your dealer verifies the car and handles your import quotation.</p><p className="interface-note">A refreshed selection of BE FORWARD listings. Prices shown are supplier vehicle prices in USD.</p></section><OpenEnquiryStrip hidden={Boolean(vehicleId)}/><section className="marketing-section"><SupplierInventory vehicleId={vehicleId}/></section></main><footer className="marketing-footer"><Brand/><Link to="/help">Support &amp; privacy</Link><Link to="/#dealers">For dealers</Link></footer></div>;}
