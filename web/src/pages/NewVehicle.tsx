import { useRef, useState } from 'react';
import { getMetadata, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../lib/firebaseData';
import { useAuth } from '../lib/auth';
import { dealerCall } from '../lib/dealer';
import { optimizeStockImage } from '../lib/stockImage';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Field, Input, Select } from '../components/ui';
import { PageHeader } from '../components/status';
import { VEHICLE_CATEGORIES, EXEMPTION_TYPES, SOURCE_COUNTRIES } from '../lib/types';
import { usdToCents } from '../lib/format';

export default function NewVehicle() {
  const navigate = useNavigate();
  const { claims } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [remainingPhotos, setRemainingPhotos] = useState(0);
  const pendingPhotos = useRef<{blob: Blob; id: string; uploaded: boolean}[]>([]);
  const [vinChassis, setVinChassis] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [category, setCategory] = useState<string>('sedan_station_wagon');
  const [sourceCountry, setSourceCountry] = useState('Japan');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [yellowBookValue, setYellowBookValue] = useState('');
  const [engineCc, setEngineCc] = useState('');
  const [engineNumber, setEngineNumber] = useState('');
  const [variant, setVariant] = useState('');
  const [isCommercial, setIsCommercial] = useState(false);
  const [importLicenceRequired, setImportLicenceRequired] = useState(false);
  const [exemptionFlag, setExemptionFlag] = useState('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ vehicleId: string } | null>(null);

  async function uploadPhotos(vehicleId: string) {
    if (!claims.companyId) throw new Error('Workspace unavailable. Sign in again.');
    while (pendingPhotos.current.length) {
      const photo = pendingPhotos.current[0];
      const path = `stock-photos/${claims.companyId}/${vehicleId}/${photo.id}`;
      const object = ref(storage, path);
      if (!photo.uploaded) {
        // An interrupted upload may have saved the immutable object already.
        try {
          const metadata = await getMetadata(object);
          if (metadata.size !== photo.blob.size || metadata.contentType !== photo.blob.type) throw new Error('Photo upload conflicts with an existing file');
        } catch (err) {
          if ((err as {code?: string}).code !== 'storage/object-not-found') throw err;
          await uploadBytes(object, photo.blob, {contentType: photo.blob.type});
        }
        photo.uploaded = true;
      }
      const attached = await dealerCall<{url:string}>('attachVehiclePhoto', {vehicleId, path});
      setPhotoUrls(urls => [...urls, attached.url]);
      pendingPhotos.current.shift();
      setRemainingPhotos(pendingPhotos.current.length);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Validate and compress every selection before creating the vehicle.
      const optimized = [];
      for (const file of files) optimized.push({blob: await optimizeStockImage(file), id: crypto.randomUUID(), uploaded: false});
      const res = await api.createVehicle({
        vinChassis: vinChassis.trim(),
        make: make.trim(),
        model: model.trim(),
        year: Number(year),
        category: category as 'sedan_station_wagon',
        sourceCountry: sourceCountry.trim() || 'Japan',
        purchasePriceCents: purchasePrice ? usdToCents(Number(purchasePrice)) : undefined,
        yellowBookValueCents: yellowBookValue ? usdToCents(Number(yellowBookValue)) : undefined,
        engineCc: engineCc ? Number(engineCc) : undefined,
        engineNumber: engineNumber.trim() || undefined,
        variant: variant.trim() || undefined,
        isCommercial,
        importLicenceRequired,
        exemptionFlag,
      });
      pendingPhotos.current = optimized;
      setRemainingPhotos(optimized.length);
      setResult(res);
      await uploadPhotos(res.vehicleId);
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to create vehicle');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="pb-8">
        <PageHeader title="Vehicle registered" />
        <div className="card mb-4 border-emerald-900 bg-emerald-950/30">
          <p className="text-sm text-slate-300">
            Vehicle <span className="font-medium text-slate-50">{vinChassis.toUpperCase()}</span> was saved.
          </p>
        </div>
        {busy && <p role="status" className="mb-4">Optimizing and uploading vehicle photos…</p>}
        {error && <p role="alert" className="mb-4 text-red-300">Vehicle saved. {error}</p>}
        {!!photoUrls.length && <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{photoUrls.map((url, index) => <img key={url} src={url} alt={`Registered vehicle photo ${index + 1}`} className="aspect-[4/3] w-full rounded-lg object-cover" />)}</div>}
        {remainingPhotos > 0 && !busy && <Button variant="ghost" onClick={async () => {setBusy(true);setError(null);try {await uploadPhotos(result.vehicleId);} catch (err) {setError((err as Error).message);} finally {setBusy(false);}}}>Retry remaining photos ({remainingPhotos})</Button>}
        <div className="space-y-3">
          <Button disabled={busy || remainingPhotos > 0} onClick={() => navigate('/app/dealership')}>Add this vehicle to dealer stock</Button>
          <Button disabled={busy || remainingPhotos > 0} onClick={() => navigate('/app/new/case', { state: { vehicleId: result.vehicleId } })}>
            Create an import case for this vehicle
          </Button>
          <Button variant="ghost" disabled={busy || remainingPhotos > 0} onClick={() => {setResult(null);setFiles([]);setPhotoUrls([]);setError(null);}}>
            Add another vehicle
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => navigate('/app')}>
            Back to cases
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <PageHeader title="Register vehicle" subtitle="Fill the details from the auction sheet and invoice." />
      <form onSubmit={onSubmit} className="space-y-4">
           <Field label="VIN / chassis number" hint="17-character VIN or Japanese chassis number, e.g. NHP10-1234567">
             <Input value={vinChassis} onChange={(e) => setVinChassis(e.target.value.toUpperCase())} required maxLength={23} pattern="([A-HJ-NPR-Za-hj-npr-z0-9]{17}|[A-Za-z0-9]{2,12}-[0-9]{5,10})" placeholder="e.g. JN1CMAT51A0004100" />

        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Make">
            <Input value={make} onChange={(e) => setMake(e.target.value)} required placeholder="Toyota" />
          </Field>
          <Field label="Model">
            <Input value={model} onChange={(e) => setModel(e.target.value)} required placeholder="Corolla" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Year">
            <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} required min={1960} max={new Date().getFullYear() + 1} placeholder="2019" />
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {VEHICLE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase price (USD)" hint="Invoice price">
            <Input type="number" step="0.01" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="4500" />
          </Field>
          <Field label="Yellow book value (USD)" hint="Optional">
            <Input type="number" step="0.01" value={yellowBookValue} onChange={(e) => setYellowBookValue(e.target.value)} placeholder="5000" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
           <Field label="Engine CC" hint="e.g. 1500">
             <Input type="number" min={1} step={1} value={engineCc} onChange={(e) => setEngineCc(e.target.value)} />

          </Field>
          <Field label="Engine number">
            <Input value={engineNumber} onChange={(e) => setEngineNumber(e.target.value)} />
          </Field>
        </div>
        <Field label="Variant / trim" hint="e.g. XLI, SEG">
          <Input value={variant} onChange={(e) => setVariant(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
           <Field label="Source country">
             <Select value={sourceCountry} onChange={(e) => setSourceCountry(e.target.value)}>
               {SOURCE_COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}
             </Select>
           </Field>

          <Field label="Exemption">
            <Select value={exemptionFlag} onChange={(e) => setExemptionFlag(e.target.value)}>
              {EXEMPTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={isCommercial} onChange={(e) => setIsCommercial(e.target.checked)} className="h-4 w-4 accent-accent" />
            Commercial
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={importLicenceRequired} onChange={(e) => setImportLicenceRequired(e.target.checked)} className="h-4 w-4 accent-accent" />
            Import licence required
          </label>
        </div>
        <Field label="Vehicle photos" hint="Optional: up to eight JPEG, PNG or WebP photos, 20 MB each. Resized to 1920 pixels and compressed below 2 MB before saving. Vehicle photos can be shared publicly; keep personal documents out of photos.">
          <Input aria-label="Vehicle photos" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={e => {const selected = Array.from(e.target.files ?? []);if (selected.length > 8) {setError('Choose up to eight vehicle photos');e.target.value='';setFiles([]);return;}setError(null);setFiles(selected);}} />
          {files.length > 0 && <p className="mt-2 text-sm text-slate-400">{files.length} photos selected: {files.map(file => file.name).join(', ')}</p>}
        </Field>
        {error ? <p className="rounded-xl border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</p> : null}
        <Button type="submit" loading={busy}>
          Register vehicle
        </Button>
      </form>
    </div>
  );
}
