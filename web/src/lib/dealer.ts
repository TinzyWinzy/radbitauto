import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
export async function dealerCall<T=unknown>(name:string,data:unknown,options?:{timeout:number}):Promise<T> {return (await httpsCallable(functions,name,options)(data)).data as T;}
export const dealerMoney=(c:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
export function dealerCents(raw:FormDataEntryValue|null) {const v=String(raw||'0');if(!/^\d+(\.\d{1,2})?$/.test(v))throw new Error('Enter USD with at most two decimals');return Math.round(Number(v)*100);}
