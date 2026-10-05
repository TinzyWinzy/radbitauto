import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { api } from '../lib/api';
import { Button, Card, Field, Input } from './ui';

export default function CaseSupplier({ caseId }: { caseId: string }) {
  const [supplierName, setName] = useState('BE FORWARD');
  const [stockReference, setStock] = useState('');
  const [purchaseReference, setPurchase] = useState('');
  const [listingUrl, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  useEffect(() => {
    setLoaded(false); setMessage(''); setSavedUrl('');
    let initialized = false;
    return onSnapshot(doc(db, 'import_cases', caseId, 'supplier', 'details'), { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.fromCache) return;
      const data = snapshot.data();
      if (!initialized) {
        setName(data?.supplierName ?? 'BE FORWARD'); setStock(data?.stockReference ?? '');
        setPurchase(data?.purchaseReference ?? ''); setUrl(data?.listingUrl ?? '');
        initialized = true;
      }
      setSavedUrl(data?.listingUrl ?? ''); setLoaded(true);
    }, (error) => setMessage(error.message));
  }, [caseId]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { await api.saveCaseSupplier({ caseId, supplierName, stockReference, purchaseReference, listingUrl }); setMessage('Supplier details saved.'); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <Card className="mb-3"><h2 className="section-title">Supplier purchase</h2>
    <p className="mb-3 text-sm text-slate-400">Agency staff only. Record purchase references here; access CAP through your supplier email. Keep private access links and passwords out of this form.</p>
    <form onSubmit={save} className="space-y-3">
      <fieldset disabled={!loaded || busy} className="space-y-3">
      <Field label="Supplier"><Input aria-label="Supplier" value={supplierName} onChange={(e) => setName(e.target.value)} maxLength={100} /></Field>
      <Field label="Stock reference"><Input aria-label="Stock reference" value={stockReference} onChange={(e) => setStock(e.target.value)} maxLength={100} /></Field>
      <Field label="Purchase / invoice reference"><Input aria-label="Purchase reference" value={purchaseReference} onChange={(e) => setPurchase(e.target.value)} maxLength={100} /></Field>
      <Field label="Public BE FORWARD listing"><Input aria-label="Public BE FORWARD listing" type="url" value={listingUrl} onChange={(e) => setUrl(e.target.value)} maxLength={1000} placeholder="https://www.beforward.jp/.../id/12345678/" /></Field>
      {message ? <p role="status" className="text-sm text-slate-300">{message}</p> : null}
      <Button type="submit" loading={busy} disabled={!loaded}>Save supplier details</Button>
      {/^https:\/\/(www\.)?beforward\.jp\//.test(savedUrl) ? <a className="ml-3 text-sm underline" href={savedUrl} target="_blank" rel="noopener noreferrer">Open supplier listing</a> : null}
      </fieldset>
    </form>
  </Card>;
}
