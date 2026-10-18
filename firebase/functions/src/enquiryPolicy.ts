import { HttpsError } from 'firebase-functions/v2/https';
export const quoteKeys=['vehicle','shipping','insurance','duties','clearing','delivery','dealerFee'] as const;
export type EnquiryCharges=Record<typeof quoteKeys[number],number>;
export function validateEnquiryQuote(d:Record<string,any>,now=Date.now()){
 const charges={} as EnquiryCharges;
 for(const k of quoteKeys){const n=d.charges?.[k];if(!Number.isSafeInteger(n)||n<0||n>10000000000)throw new HttpsError('invalid-argument','Enter nonnegative USD cents for every quotation line');charges[k]=n;}
 const totalCents=Object.values(charges).reduce((a,b)=>a+b,0);
 if(totalCents<=0||totalCents>10000000000)throw new HttpsError('invalid-argument','Quotation total is out of range');
 const field=(key:string,max=1500)=>{const v=d[key];if(typeof v!=='string'||!v.trim()||v.length>max)throw new HttpsError('invalid-argument',`Complete ${key}`);return v.trim();};
 const validUntil=field('validUntil',10),expiresAt=Date.parse(validUntil+'T23:59:59.999+02:00');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)||!Number.isFinite(expiresAt)||new Date(validUntil).toISOString().slice(0,10)!==validUntil||expiresAt<=now)throw new HttpsError('invalid-argument','Quotation validity must be today or later');
 if(!['estimate','confirmed'].includes(d.taxStatus))throw new HttpsError('invalid-argument','State whether duties and taxes are estimated or confirmed');
 return {currency:'USD' as const,charges,totalCents,validUntil,expiresAt,route:field('route',200),inclusions:field('inclusions'),exclusions:field('exclusions'),taxBasis:field('taxBasis'),taxStatus:d.taxStatus as 'estimate'|'confirmed'};
}
export function leadReminder(lead:Record<string,any>,now=Date.now()){
 const today=new Date(now+2*3600000).toISOString().slice(0,10);
 if(lead.importCaseId||['won','lost'].includes(lead.status))return {title:'No outstanding enquiry action',dueDate:'',overdue:false,dueToday:false,closed:true};
 const action=lead.nextAction?.state==='pending'?lead.nextAction:null;
 let title='Contact customer';
 if(lead.supplierVehicle&&(lead.supplierVerification?.status!=='available'||!Number.isFinite(Date.parse(lead.supplierVerification?.verifiedAt??''))||now-Date.parse(lead.supplierVerification?.verifiedAt??'')>86400000))title='Verify supplier availability';
 else if(!lead.quotation)title='Prepare import quotation';
 else if(lead.quotation.expiresAt<now)title='Refresh expired quotation';
 else title='Follow up quotation with customer';
 const dueDate=action?.dueDate||lead.followUp||'';
 return {title:action?.title||title,responsible:action?.responsible??'agency',dueDate,overdue:!!dueDate&&dueDate<today,dueToday:dueDate===today,closed:false};
}
