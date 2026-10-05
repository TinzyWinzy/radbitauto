import { Input, Select } from './ui';
export type StockSpecs = { make?: string; model?: string; year?: number; mileageKm?: number; engineCc?: number; fuel?: string; transmission?: string; bodyType?: string };
export const stockChoices = { fuel: ['Petrol','Diesel','Hybrid','Electric','Other'], transmission: ['Automatic','Manual','CVT','Other'], bodyType: ['Sedan','Hatchback','SUV','Wagon','Pickup','Van','Bus','Truck','Other'] };
export function stockSpecsFromForm(form: FormData): StockSpecs {
  const result: Record<string, string | number> = {};
  for (const key of ['make','model','year','mileageKm','engineCc','fuel','transmission','bodyType']) {
    const value = String(form.get(`spec-${key}`) ?? '').trim();
    if (value) result[key] = ['year','mileageKm','engineCc'].includes(key) ? Number(value) : value;
  }
  return result;
}
export function StockSpecFields({ specs = {} }: { specs?: StockSpecs }) {
  return <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-3 font-semibold">Buyer-facing vehicle details</legend>
    <p className="text-sm sm:col-span-2">Enter confirmed details only. Blank values appear as “Ask dealer”.</p>
    {(['make','model'] as const).map(key => <label key={key}>{key === 'make' ? 'Make' : 'Model'}<Input name={`spec-${key}`} defaultValue={specs[key]} maxLength={80} aria-label={`Published ${key}`} /></label>)}
    {(['year','mileageKm','engineCc'] as const).map(key => <label key={key}>{key === 'year' ? 'Year' : key === 'mileageKm' ? 'Mileage (km)' : 'Engine (cc)'}<Input name={`spec-${key}`} type="number" step="1" min={key==='year'?1960:key==='engineCc'?1:0} max={key==='year'?new Date().getFullYear()+1:key==='mileageKm'?3000000:30000} defaultValue={specs[key]} aria-label={`Published ${key}`} /></label>)}
    {(Object.keys(stockChoices) as (keyof typeof stockChoices)[]).map(key => <label key={key}>{key==='bodyType'?'Body type':key==='fuel'?'Fuel':'Transmission'}<Select name={`spec-${key}`} defaultValue={specs[key] ?? ''} aria-label={`Published ${key}`}><option value="">Not recorded</option>{stockChoices[key].map(v=><option key={v}>{v}</option>)}</Select></label>)}
  </fieldset>;
}
export function StockSpecList({ specs = {} }: { specs?: StockSpecs }) {
  const rows: [string, string | number | undefined][] = [['Make',specs.make],['Model',specs.model],['Year',specs.year],['Mileage',specs.mileageKm===undefined?undefined:`${specs.mileageKm.toLocaleString()} km`],['Fuel',specs.fuel],['Transmission',specs.transmission],['Body type',specs.bodyType],['Engine',specs.engineCc?`${specs.engineCc.toLocaleString()} cc`:undefined]];
  return <dl className="stock-spec-list">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value ?? 'Ask dealer'}</dd></div>)}</dl>;
}
