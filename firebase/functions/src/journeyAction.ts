import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './db.ts';
import { contextFrom, requireStaff } from './claims.ts';
import { transactionWriteCheck } from './subscriptions.ts';
import { ts } from './audits.ts';
export function validateJourneyAction(data: Record<string, unknown>) {
  if (typeof data.title !== 'string' || !data.title.trim() || data.title.length>300) throw new HttpsError('invalid-argument','Describe the next action (maximum 300 characters)');
  if (!['customer','agency'].includes(String(data.responsible))) throw new HttpsError('invalid-argument','Choose who needs to act');
  const dueDate=String(data.dueDate ?? '');
  if (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0,10)!==dueDate)) throw new HttpsError('invalid-argument','Use a valid action date');
  const state=data.state ?? 'pending';
  if (!['pending','complete'].includes(String(state))) throw new HttpsError('invalid-argument','Invalid action status');
  return {title:data.title.trim(),responsible:String(data.responsible),dueDate,state:String(state)};
}
export const setCaseNextAction=onCall(async request=>{
  const ctx=contextFrom(request),staff=await requireStaff(ctx),d=request.data;
  if(typeof d.caseId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(d.caseId))throw new HttpsError('invalid-argument','Invalid case');
  const action=validateJourneyAction(d),ref=db.doc(`import_cases/${d.caseId}`);
  await db.runTransaction(async tx=>{
    await transactionWriteCheck(tx,staff.companyId);
    const record=await tx.get(ref);
    if(!record.exists||record.data()?.companyId!==staff.companyId)throw new HttpsError('not-found','Case unavailable');
    tx.update(ref,{nextAction:{...action,updatedAt:ts()},updatedAt:ts()});
    tx.set(db.collection('audit_log').doc(),{companyId:staff.companyId,actorId:ctx.uid,entityType:'import_cases',entityId:ref.id,action:'next_action',detail:action,createdAt:ts()});
  });return {saved:true};
});
