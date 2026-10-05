export type OperationMode = 'sourcing' | 'clearing' | 'both';

export interface AgencyRegistration {
  businessFocus?: 'retail' | 'imports' | 'hybrid';
  name: string;
  slug: string;
  casePrefix: string;
  contactWhatsapp: string;
  primaryColor: string;
  operationMode: OperationMode;
  defaultPort: string;
}

export function validateAgencyRegistration(value: unknown): AgencyRegistration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Agency details are required');
  const data = value as Record<string, unknown>;
  function text(field: string, max: number): string {
    const entry = data[field];
    if (typeof entry !== 'string' || !entry.trim() || entry.trim().length > max) throw new Error(`Invalid ${field}`);
    return entry.trim();
  }
  const name = text('name', 100);
  const slug = text('slug', 60).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 3) throw new Error('Agency address must have 3–60 lowercase letters, numbers or single hyphens');
  const casePrefix = text('casePrefix', 5).toUpperCase();
  if (!/^[A-Z0-9]{2,5}$/.test(casePrefix)) throw new Error('Case prefix must have 2–5 letters or numbers');
  const contactWhatsapp = text('contactWhatsapp', 20).replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(contactWhatsapp)) throw new Error('Enter a WhatsApp number in international format, e.g. +263771234567');
  const primaryColor = text('primaryColor', 7);
  if (!/^#[0-9a-f]{6}$/i.test(primaryColor)) throw new Error('Choose a valid brand colour');
  const operationMode = text('operationMode', 10) as OperationMode;
  if (!['sourcing', 'clearing', 'both'].includes(operationMode)) throw new Error('Choose sourcing, clearing or both');
  const defaultPort = text('defaultPort', 30);
  if (!['Durban', 'Beira', 'Walvis Bay', 'Dar es Salaam', 'Maputo'].includes(defaultPort)) throw new Error('Choose a supported port');
  if(data.businessFocus!==undefined&&!['retail','imports','hybrid'].includes(String(data.businessFocus)))throw new Error('Choose a valid business focus');
  return { name, slug, casePrefix, contactWhatsapp, primaryColor, operationMode, defaultPort, ...(data.businessFocus===undefined?{}:{businessFocus:data.businessFocus as AgencyRegistration['businessFocus']}) };
}

export function stageEnabledFor(mode: OperationMode, key: string): boolean {
  return mode !== 'clearing' || !['vehicle_sourced', 'purchase_completed', 'export_processing', 'shipped', 'in_transit'].includes(key);
}
