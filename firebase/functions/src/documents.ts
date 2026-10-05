import { transactionWriteCheck } from './subscriptions.ts';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onObjectDeleted, onObjectFinalized } from 'firebase-functions/v2/storage';
import { contextFrom, requireStaff } from './claims.ts';
import { db } from './db.ts';
import { ts } from './audits.ts';
import { DOC_TYPES } from './constants.ts';
import type { DocumentDoc, ImportCaseDoc } from './types.ts';

if (getApps().length === 0) {
  initializeApp();
}

const storage = getStorage();
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;

interface ParsedDocumentPath {
  companyId: string;
  caseId: string;
  docType: string;
  documentId: string;
  fileName: string;
}

function parseDocumentPath(objectPath: string): ParsedDocumentPath | null {
  const parts = objectPath.split('/');
  if (parts.length !== 6 || parts[0] !== 'documents' || parts.some((part) => part === '')) {
    return null;
  }
  const [, companyId, caseId, docType, documentId, fileName] = parts;
  if (!DOC_TYPES.includes(docType as (typeof DOC_TYPES)[number]) || !/^[A-Za-z0-9_-]{10,100}$/.test(documentId)) {
    return null;
  }
  if (fileName.includes('/') || fileName.includes('\\')) {
    return null;
  }
  return { companyId, caseId, docType, documentId, fileName };
}

function startsWith(content: Buffer, signature: number[]): boolean {
  return signature.every((value, index) => content[index] === value);
}

function asciiAt(content: Buffer, start: number, length: number): string {
  return content.subarray(start, start + length).toString('ascii');
}

function contentSignatureMatches(contentType: string, content: Buffer): boolean {
  if (contentType === 'application/pdf') {
    return startsWith(content, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  }
  if (contentType === 'image/jpeg') {
    return startsWith(content, [0xff, 0xd8, 0xff]);
  }
  if (contentType === 'image/png') {
    return startsWith(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (contentType === 'image/webp') {
    return asciiAt(content, 0, 4) === 'RIFF' && asciiAt(content, 8, 4) === 'WEBP';
  }
  if (contentType === 'image/heic' || contentType === 'image/heif') {
    return asciiAt(content, 4, 4) === 'ftyp' && ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(asciiAt(content, 8, 4));
  }
  return false;
}

async function matchingDocumentRow(parsed: ParsedDocumentPath) {
  const documents = db
    .collection('import_cases')
    .doc(parsed.caseId)
    .collection('documents')
    .where('objectPath', '==', `documents/${parsed.companyId}/${parsed.caseId}/${parsed.docType}/${parsed.documentId}/${parsed.fileName}`);
  const snap = await documents.get();
  if (snap.size !== 1) {
    throw new Error('document storage does not have exactly one matching row');
  }
  const document = snap.docs[0];
  const data = document.data() as DocumentDoc;
  if (
    document.id !== parsed.documentId ||
    data.companyId !== parsed.companyId ||
    data.caseId !== parsed.caseId ||
    data.docType !== parsed.docType ||
    data.objectPath !== `documents/${parsed.companyId}/${parsed.caseId}/${parsed.docType}/${parsed.documentId}/${parsed.fileName}` ||
    data.fileName !== parsed.fileName
  ) {
    throw new Error('document storage path does not match its row');
  }
  return { ref: document.ref, data };
}

export const onDocumentObjectFinalized = onObjectFinalized(async (event) => {
  const parsed = parseDocumentPath(event.data.name);
  if (parsed === null) {
    return;
  }
  const { ref, data } = await matchingDocumentRow(parsed);
  const caseSnap = await db.collection('import_cases').doc(parsed.caseId).get();
  const caseDoc = caseSnap.exists ? (caseSnap.data() as ImportCaseDoc) : undefined;
  if (caseDoc === undefined || caseDoc.companyId !== parsed.companyId) {
    throw new Error('document case does not match its storage path');
  }

  const file = storage.bucket(event.data.bucket).file(event.data.name);
  const [[metadata], [content]] = await Promise.all([
    file.getMetadata(),
    file.download({ start: 0, end: 31 }),
  ]);
  const contentType = metadata.contentType ?? '';
  const sizeBytes = Number(metadata.size);
  if (!CONTENT_TYPES.includes(contentType as (typeof CONTENT_TYPES)[number])) {
    throw new Error('document content type is not allowed');
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes >= MAX_DOCUMENT_BYTES) {
    throw new Error('document size is not allowed');
  }
  if (!contentSignatureMatches(contentType, content)) {
    throw new Error('document content signature does not match its content type');
  }
  if (data.verified === true && data.storageValid === true) {
    const unchanged =
      data.mimeType === contentType &&
      data.sizeBytes === sizeBytes &&
      data.storageGeneration === metadata.generation;
    if (unchanged) {
      return;
    }
  }
  await ref.update({
    storageValid: true,
    mimeType: contentType,
    sizeBytes,
    storageGeneration: metadata.generation,
    storageValidatedAt: ts(),
  });
});

export async function validatePaymentProof(proofPath: string, expectedPath: string): Promise<void> {
  if (proofPath !== expectedPath) {
    throw new HttpsError('invalid-argument', 'proofPath does not match this payment');
  }
  const file = storage.bucket().file(proofPath);
  const [[metadata], [content]] = await Promise.all([
    file.getMetadata(),
    file.download({ start: 0, end: 31 }),
  ]);
  const contentType = metadata.contentType ?? '';
  const sizeBytes = Number(metadata.size);
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(contentType)) {
    throw new HttpsError('invalid-argument', 'payment proof content type is not allowed');
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes >= 5 * 1024 * 1024) {
    throw new HttpsError('invalid-argument', 'payment proof size is not allowed');
  }
  if (!contentSignatureMatches(contentType, content)) {
    throw new HttpsError('invalid-argument', 'payment proof content does not match its type');
  }
}

export const onDocumentObjectDeleted = onObjectDeleted(async (event) => {
  const parsed = parseDocumentPath(event.data.name);
  if (parsed === null) {
    return;
  }
  const documents = db
    .collection('import_cases')
    .doc(parsed.caseId)
    .collection('documents')
    .where('objectPath', '==', `documents/${parsed.companyId}/${parsed.caseId}/${parsed.docType}/${parsed.documentId}/${parsed.fileName}`);
  const snap = await documents.get();
  if (snap.empty) {
    return;
  }
  const batch = db.batch();
  for (const document of snap.docs) {
    const data = document.data() as DocumentDoc;
    if (data.companyId === parsed.companyId && data.caseId === parsed.caseId && data.docType === parsed.docType) {
      batch.update(document.ref, {
        storageValid: false,
        verified: false,
        mimeType: FieldValue.delete(),
        sizeBytes: FieldValue.delete(),
        storageGeneration: FieldValue.delete(),
        storageValidatedAt: FieldValue.delete(),
        verifiedAt: FieldValue.delete(),
        verifiedBy: FieldValue.delete(),
      });
    }
  }
  await batch.commit();
});

export const verifyDocument = onCall<{
  caseId: string;
  documentId: string;
  verified: boolean;
}>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireStaff(ctx);
  const { caseId, documentId, verified } = request.data;
  if (typeof verified !== 'boolean' || !caseId || !documentId) {
    throw new HttpsError('invalid-argument', 'caseId, documentId and verified are required');
  }
  const ref = db.collection('import_cases').doc(caseId).collection('documents').doc(documentId);
  const result = await db.runTransaction(async (txn) => {
    await transactionWriteCheck(txn, staff.companyId);
    const [caseSnap, documentSnap] = await Promise.all([
      txn.get(db.collection('import_cases').doc(caseId)),
      txn.get(ref),
    ]);
    const caseDoc = caseSnap.exists ? (caseSnap.data() as ImportCaseDoc) : undefined;
    if (caseDoc === undefined) {
      throw new HttpsError('not-found', 'case not found');
    }
    if (caseDoc.companyId !== staff.companyId) {
      throw new HttpsError('permission-denied', 'not authorized for this tenant');
    }
    if (!documentSnap.exists) {
      throw new HttpsError('not-found', 'document not found');
    }
    const document = documentSnap.data() as DocumentDoc;
    if (document.companyId !== staff.companyId || document.caseId !== caseId) {
      throw new HttpsError('permission-denied', 'not authorized for this document');
    }
    if (verified && document.storageValid !== true) {
      throw new HttpsError('failed-precondition', 'document storage has not been validated');
    }
    const now = ts();
    txn.update(ref, verified
      ? { verified: true, verifiedAt: now, verifiedBy: ctx.uid }
      : { verified: false, verifiedAt: FieldValue.delete(), verifiedBy: FieldValue.delete() });
    txn.set(db.collection('audit_log').doc(), {
      companyId: staff.companyId,
      actorId: ctx.uid,
      entityType: 'import_cases',
      entityId: caseId,
      action: verified ? 'verify_document' : 'unverify_document',
      detail: { documentId },
      createdAt: now,
    });
    return { documentId, verified };
  });
  return result;
});

export const cleanupDocumentUpload = onCall<{ caseId: string; documentId: string }>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireStaff(ctx);
  const { caseId, documentId } = request.data;
  if (!caseId || !documentId) {
    throw new HttpsError('invalid-argument', 'caseId and documentId are required');
  }
  const ref = db.collection('import_cases').doc(caseId).collection('documents').doc(documentId);
  const documentSnap = await ref.get();
  const caseSnap = await db.collection('import_cases').doc(caseId).get();
  const caseDoc = caseSnap.exists ? (caseSnap.data() as ImportCaseDoc) : undefined;
  if (caseDoc === undefined) {
    throw new HttpsError('not-found', 'case not found');
  }
  if (caseDoc.companyId !== staff.companyId) {
    throw new HttpsError('permission-denied', 'not authorized for this tenant');
  }
  if (!documentSnap.exists) {
    return { documentId, deleted: true };
  }
  const document = documentSnap.data() as DocumentDoc;
  if (document.companyId !== staff.companyId || document.caseId !== caseId || document.uploadedBy !== ctx.uid) {
    throw new HttpsError('permission-denied', 'not authorized for this document');
  }
  if (document.verified !== false || document.storageValid !== false) {
    throw new HttpsError('failed-precondition', 'only an unvalidated pending upload can be cleaned up');
  }
  try {
    await storage.bucket().file(document.objectPath).getMetadata();
    return { documentId, deleted: false };
  } catch (error) {
    const code = (error as { code?: number | string }).code;
    if (code !== 404 && code !== 'storage/notFound' && code !== 'NOT_FOUND') {
      throw error;
    }
  }
  await ref.delete();
  return { documentId, deleted: true };
});
