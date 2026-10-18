import { createHash,randomBytes } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import type {Transaction,DocumentReference} from 'firebase-admin/firestore';
import {db} from './db.ts';
export const trackingHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export const newTrackingToken=()=>randomBytes(32).toString('hex');
export function validateTrackingToken(token:unknown):string {
 if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))throw new HttpsError('not-found','Tracking link unavailable or expired');return token;
}
export function addEnquiryTracking(tx:Transaction,lead:DocumentReference,companyId:string,token:string){
 const hash=trackingHash(validateTrackingToken(token)),expiresAt=Date.now()+30*86400000;
 tx.create(db.doc(`dealer_enquiry_access/${hash}`),{companyId,leadId:lead.id,expiresAt});
 tx.set(lead,{trackingHash:hash,trackingExpiresAt:expiresAt},{merge:true});
 return expiresAt;
}
