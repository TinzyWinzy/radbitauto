import { HttpsError } from 'firebase-functions/v2/https';
export interface QuoteTerms { route:string; inclusions:string; exclusions:string; validUntil:string }
export function validateQuoteTerms(value:unknown):QuoteTerms {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpsError('invalid-argument','Invalid quotation terms');
  const d=value as Record<string,unknown>,result={} as QuoteTerms;
  for(const key of ['route','inclusions','exclusions','validUntil'] as const){const v=d[key]??'';if(typeof v!=='string'||v.length>(key==='route'?200:1500))throw new HttpsError('invalid-argument',`Invalid ${key}`);result[key]=v.trim();}
  const date=result.validUntil;
  if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<new Date().toISOString().slice(0,10)))throw new HttpsError('invalid-argument','Quotation validity must be a valid date today or later');
  return result;
}
