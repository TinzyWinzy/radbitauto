import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Field, Input, Select } from '../components/ui';
import { PageHeader } from '../components/status';
import { VEHICLE_CATEGORIES, EXEMPTION_TYPES, SOURCE_COUNTRIES } from '../lib/types';
import { usdToCents } from '../lib/format';

export default function NewVehicle() {
  const navigate = useNavigate();
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
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
      setResult(res);
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
        <div className="space-y-3">
          <Button onClick={() => navigate('/app/dealership')}>Add this vehicle to dealer stock</Button>
          <Button onClick={() => navigate('/app/new/case', { state: { vehicleId: result.vehicleId } })}>
            Create an import case for this vehicle
          </Button>
          <Button variant="ghost" onClick={() => setResult(null)}>
            Add another vehicle
          </Button>
          <Button variant="ghost" onClick={() => navigate('/app')}>
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
        {error ? <p className="rounded-xl border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</p> : null}
        <Button type="submit" loading={busy}>
          Register vehicle
        </Button>
      </form>
    </div>
  );
}
