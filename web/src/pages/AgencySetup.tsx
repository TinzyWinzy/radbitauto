import Brand from '../components/Brand';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import EmailVerification from '../components/EmailVerification';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Field, Input, Select } from '../components/ui';

export default function AgencySetup() {
  const { user, claims, waitForClaims } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [prefix, setPrefix] = useState('');
  const [slugEdited,setSlugEdited]=useState(false),[prefixEdited,setPrefixEdited]=useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [colour, setColour] = useState('#173d31');
  const [focus,setFocus]=useState<'retail'|'imports'|'hybrid'>('hybrid');
  const [mode, setMode] = useState<'sourcing' | 'clearing' | 'both'>('both');
  const [port, setPort] = useState('Dar es Salaam');
  const [verified, setVerified] = useState(user?.emailVerified === true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api.registerAgency({ businessFocus:focus, name, slug, casePrefix: prefix, contactWhatsapp: whatsapp, primaryColor: colour, operationMode: mode, defaultPort: port });
      const claims = await waitForClaims();
      if (claims?.companyId) navigate('/app', { replace: true });
      else setError('Your agency was created but your session is not updated yet. Wait a few seconds and sign in again.');
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <main className="agency-setup-page"><header className="agency-setup-header">
      <Link to="/" className="product-wordmark"><Brand /></Link>
      <Link to="/help">Support &amp; privacy</Link></header><div className="agency-setup-grid"><section><p className="interface-eyebrow mt-8">Agency registration · step {verified ? '3' : '2'} of 3</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-slate-50">{verified ? 'Set up your dealership' : 'Verify your email to continue'}</h1>
      <p className="mt-2 text-sm text-slate-400">Create your business workspace, publish vehicles and keep every customer deal organised. Your team and customers join your agency by invitation.</p>
      {!verified ? <EmailVerification returnPath="/agency/setup" onVerified={() => setVerified(true)} /> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-red-300">{error}</p> : null}
      {claims.customerId ? <p role="alert" className="mt-4 text-sm text-amber-300">This account is linked as a customer of another agency. Creating your own workspace replaces that customer access; your vehicle and payment history remains with your original agency.</p> : null}
      <p className="mt-5 text-sm text-slate-400">Your agency starts with a 30-day Dealer trial: 5 team members including you, and 50 active vehicles/enquiries. Afterwards choose Solo ($15/month) or Dealer ($29/month), in USD. Payment is arranged manually; there is no automatic charge. If access expires, existing records remain readable.</p>
      <form onSubmit={submit} className={`mt-6 space-y-4 ${!verified ? 'hidden' : ''}`}>
        <fieldset disabled={busy || !verified} className="space-y-4 disabled:opacity-60">
          <h2 className="setup-section-heading">01 · Business identity</h2><Field label="Agency name"><Input aria-label="Agency name" value={name} onChange={(e) => {const value=e.target.value;setName(value);if(!slugEdited)setSlug(value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''));if(!prefixEdited){const words=value.trim().split(/\s+/);setPrefix((words.length>1?words.map(w=>w[0]??'').join(''):value.slice(0,2)).replace(/[^a-z0-9]/gi,'').slice(0,5).toUpperCase());}}} required maxLength={100} autoComplete="organization" /></Field>
          <Field label="Agency address" hint="This becomes your public showroom address. Use lowercase letters, numbers and hyphens."><Input aria-label="Agency address" value={slug} onChange={(e) => {setSlugEdited(true);setSlug(e.target.value.toLowerCase());}} required minLength={3} maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Case prefix" hint="Used on your customer case references, e.g. TM-00001"><Input aria-label="Case prefix" value={prefix} onChange={(e) => {setPrefixEdited(true);setPrefix(e.target.value.toUpperCase());}} required minLength={2} maxLength={5} pattern="[A-Z0-9]{2,5}" placeholder="TM" /></Field>
            <Field label="Brand colour"><Input aria-label="Brand colour" type="color" value={colour} onChange={(e) => setColour(e.target.value)} /></Field>
          </div>
          <h2 className="setup-section-heading">02 · Contact and operations</h2><Field label="Business focus"><Select aria-label="Business focus" value={focus} onChange={e=>setFocus(e.target.value as typeof focus)}><option value="hybrid">Local vehicle sales and customer imports</option><option value="retail">Primarily selling local stock</option><option value="imports">Primarily sourcing or clearing imports</option></Select></Field><Field label="Agency WhatsApp number" hint="Include the country code"><Input aria-label="Agency WhatsApp number" type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required placeholder="+263771234567" /></Field>
          <Field label="What does your agency handle?"><Select aria-label="Agency operations" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="both">Sourcing and clearing</option><option value="sourcing">Vehicle sourcing</option><option value="clearing">Clearing purchased vehicles</option></Select></Field>
          <Field label="Default arrival port"><Select aria-label="Default arrival port" value={port} onChange={(e) => setPort(e.target.value)}>{['Dar es Salaam', 'Durban', 'Beira', 'Walvis Bay', 'Maputo'].map((p) => <option key={p}>{p}</option>)}</Select></Field>
          <p className="text-sm text-slate-400">Quotations and payment records use USD.</p>
          <Button type="submit" loading={busy} disabled={busy || !verified}>Create my agency</Button>
        </fieldset>
      </form>
      <Link to="/pending" className="mt-6 inline-block text-sm text-slate-300 underline">I am a customer waiting for agency access</Link>
      </section><aside className="setup-preview"><p className="interface-eyebrow">Your business on Radbit Auto</p><div className="setup-business-preview"><span style={{background:colour,color:parseInt(colour.slice(1,3),16)*.299+parseInt(colour.slice(3,5),16)*.587+parseInt(colour.slice(5,7),16)*.114>165?'#173d31':'#ffffff'}} aria-hidden="true">{prefix||'RA'}</span><h2>{name||'Your dealership'}</h2><p>{focus==='retail'?'Local stock and sales':focus==='imports'?'Customer imports and clearing':'Stock, sales and customer imports'}</p></div><p className="setup-preview-url">Showroom: /showroom/{slug||'your-dealership'}</p><ol><li>Register your first vehicle or customer enquiry.</li><li>Add stock photos and confirm the listing details.</li><li>Publish your showroom and share the link on WhatsApp.</li><li>Invite your team and customers when their records are ready.</li></ol><p className="interface-note">You control what appears in your showroom. Costs, payment records and customer documents stay in your workspace.</p></aside></div>
    </main>
  );
}
