import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stageEnabledFor, validateAgencyRegistration } from '../src/agencyConfig.ts';

const agency = { name: 'Example Agency', slug: 'example-agency', casePrefix: 'EA', contactWhatsapp: '+263771234567', primaryColor: '#1d4ed8', operationMode: 'both', defaultPort: 'Dar es Salaam' };
describe('self-service agency configuration', () => {
  it('normalizes identifiers and accepts the Zimbabwe supplier corridor', () => {
    const config = validateAgencyRegistration({ ...agency, slug: 'EXAMPLE-AGENCY', casePrefix: 'ea', contactWhatsapp: '+263 771 234 567' });
    assert.equal(config.slug, agency.slug);
    assert.equal(config.casePrefix, 'EA');
    assert.equal(config.contactWhatsapp, agency.contactWhatsapp);
  });
  it('rejects unsafe or unsupported configuration', () => {
    for (const input of [{ ...agency, slug: '../another' }, { ...agency, casePrefix: 'TOO-LONG' }, { ...agency, primaryColor: 'url(x)' }, { ...agency, contactWhatsapp: '0771234567' }, { ...agency, operationMode: 'platform_admin' }, { ...agency, defaultPort: 'unknown' }, null]) {
      assert.throws(() => validateAgencyRegistration(input));
    }
  });
  it('clearing agencies retain finance and clearance but skip supplier sourcing and export stages', () => {
    assert.equal(stageEnabledFor('clearing', 'quotation'), true);
    assert.equal(stageEnabledFor('clearing', 'customs_clearance'), true);
    assert.equal(stageEnabledFor('clearing', 'vehicle_sourced'), false);
    assert.equal(stageEnabledFor('clearing', 'shipped'), false);
    assert.equal(stageEnabledFor('both', 'shipped'), true);
  });
});
