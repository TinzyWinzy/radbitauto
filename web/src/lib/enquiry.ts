const key = 'radbit:auto:import-enquiry:v1';

export type OpenEnquiry = { ref: string; vehicleId: string; title: string; dealerName: string; dealerSlug: string; dealerWhatsapp: string; url: string; at: number };

export type EnquiryRequest = { ref: string; dealerName: string; buyerName: string; phone: string; budget: string; vehicleTitle: string; supplierId: string; supplierPrice: string; location: string; listingUrl: string; pageUrl: string; notes: string };

export function leadRef(docId: string): string {
  return docId.slice(0, 8).toUpperCase();
}

export function saveOpenEnquiry(enquiry: OpenEnquiry): void {
  try { localStorage.setItem(key, JSON.stringify(enquiry)); } catch { /* The WhatsApp thread keeps the record when browser storage is unavailable. */ }
}

export function readOpenEnquiry(): OpenEnquiry | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    return value && typeof value.ref === 'string' && typeof value.vehicleId === 'string' && typeof value.title === 'string' && typeof value.dealerName === 'string' ? value as OpenEnquiry : null;
  } catch { return null; }
}

export function clearOpenEnquiry(): void {
  try { localStorage.removeItem(key); } catch { /* Nothing to clear. */ }
}

export function enquiryRequestText(r: EnquiryRequest): string {
  const lines = [
    'Import enquiry request — Radbit Auto',
    `Reference: ${r.ref || 'not issued'}`,
    `Dealer: ${r.dealerName}`,
    '',
    'BUYER',
    `Name: ${r.buyerName}`,
    `WhatsApp / phone: ${r.phone}`,
    `Budget: ${r.budget}`,
    '',
    'VEHICLE',
    r.vehicleTitle,
    `Supplier reference: ${r.supplierId}`,
    `Supplier price: ${r.supplierPrice}`,
    r.location ? `Location: ${r.location}` : '',
    `Listing: ${r.listingUrl}`,
    '',
    'REQUEST',
    `1. Confirm availability of ${r.supplierId} with BE FORWARD.`,
    '2. Quote the full import cost: shipping, insurance, duties, clearing, delivery and dealer fees.',
    '3. Confirm what is included, what is excluded and how long the quote stays valid.',
    ...(r.notes ? ['', 'NOTES', r.notes] : []),
    '',
    `Continue this enquiry: ${r.pageUrl}`,
    'This request does not reserve a vehicle and does not collect payment.'
  ];
  return lines.join('\n');
}
