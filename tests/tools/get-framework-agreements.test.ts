import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { getFrameworkAgreements } from '../../src/tools/get-framework-agreements.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('get_framework_agreements', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should return framework agreements for IT services', () => {
    const result = getFrameworkAgreements(db, { cpv_code: '72' });
    expect(result.error).toBeUndefined();
    expect(result.agreements).toBeDefined();
    expect(result.agreements.length).toBeGreaterThan(0);
  });

  it('should only return records with framework_agreement=1', () => {
    const result = getFrameworkAgreements(db, { cpv_code: '72' });
    // All returned should be framework agreements
    expect(result.agreements.length).toBeGreaterThan(0);
  });

  it('should include expected fields', () => {
    const result = getFrameworkAgreements(db, { cpv_code: '72' });
    const a = result.agreements[0];
    expect(a.buyer_name).toBeDefined();
    expect(a.winner_name).toBeDefined();
    expect(a.publication_date).toBeDefined();
    expect(a.cpv_main).toBeDefined();
  });

  it('should include value and duration', () => {
    const result = getFrameworkAgreements(db, { cpv_code: '72' });
    const a = result.agreements[0];
    // Framework agreements should have estimated or awarded values
    expect(a.value_estimated !== null || a.value_awarded !== null).toBe(true);
    expect(a.contract_duration_months).toBeDefined();
  });

  it('should filter by NUTS region', () => {
    const result = getFrameworkAgreements(db, { cpv_code: '72', nuts_region: 'DE' });
    expect(result.agreements.length).toBeGreaterThan(0);
    for (const a of result.agreements) {
      expect(a.buyer_nuts).toMatch(/^DE/);
    }
  });

  it('should return empty for CPV with no framework agreements', () => {
    const result = getFrameworkAgreements(db, { cpv_code: '45210000' });
    expect(result.agreements.length).toBe(0);
  });

  it('should return error when cpv_code is missing', () => {
    const result = getFrameworkAgreements(db, { cpv_code: '' });
    expect(result.error).toBeDefined();
  });

  it('should include _meta', () => {
    const result = getFrameworkAgreements(db, { cpv_code: '72' });
    expect(result._meta).toBeDefined();
    expect(result._meta.disclaimer).toBeTruthy();
  });

  it('should include total count', () => {
    const result = getFrameworkAgreements(db, { cpv_code: '72' });
    expect(typeof result.total).toBe('number');
    expect(result.total).toBeGreaterThan(0);
  });
});
