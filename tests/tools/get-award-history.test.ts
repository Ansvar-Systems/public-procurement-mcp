import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { getAwardHistory } from '../../src/tools/get-award-history.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('get_award_history', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should return awards for IT services CPV code', () => {
    const result = getAwardHistory(db, { cpv_code: '72200000' });
    expect(result.error).toBeUndefined();
    expect(result.awards).toBeDefined();
    expect(result.awards.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it('should filter by CPV prefix (72 matches all IT services)', () => {
    const result = getAwardHistory(db, { cpv_code: '72' });
    expect(result.awards.length).toBeGreaterThan(0);
    for (const award of result.awards) {
      expect(award.cpv_main).toMatch(/^72/);
    }
  });

  it('should filter by NUTS region', () => {
    const result = getAwardHistory(db, { cpv_code: '72', nuts_region: 'DE' });
    expect(result.awards.length).toBeGreaterThan(0);
    for (const award of result.awards) {
      expect(award.buyer_nuts).toMatch(/^DE/);
    }
  });

  it('should filter by year range', () => {
    const result = getAwardHistory(db, { cpv_code: '72200000', year_from: 2024, year_to: 2024 });
    expect(result.awards.length).toBeGreaterThan(0);
    for (const award of result.awards) {
      expect(award.publication_date).toMatch(/^2024/);
    }
  });

  it('should only return contract_award notices', () => {
    const result = getAwardHistory(db, { cpv_code: '72' });
    for (const award of result.awards) {
      // All returned records should have winner info (i.e., be awards)
      expect(award.winner_name).toBeDefined();
    }
  });

  it('should respect limit parameter', () => {
    const result = getAwardHistory(db, { cpv_code: '72', limit: 3 });
    expect(result.awards.length).toBeLessThanOrEqual(3);
  });

  it('should default limit to 20', () => {
    const result = getAwardHistory(db, { cpv_code: '72' });
    expect(result.awards.length).toBeLessThanOrEqual(20);
  });

  it('should include expected fields in each award', () => {
    const result = getAwardHistory(db, { cpv_code: '72200000', limit: 1 });
    const award = result.awards[0];
    expect(award.buyer_name).toBeDefined();
    expect(award.winner_name).toBeDefined();
    expect(award.value_awarded).toBeDefined();
    expect(award.publication_date).toBeDefined();
    expect(award.num_tenders_received).toBeDefined();
    expect(award.cpv_main).toBeDefined();
  });

  it('should return empty for nonexistent CPV code', () => {
    const result = getAwardHistory(db, { cpv_code: '99999999' });
    expect(result.awards.length).toBe(0);
    expect(result.total).toBe(0);
  });

  it('should include _meta', () => {
    const result = getAwardHistory(db, { cpv_code: '72200000' });
    expect(result._meta).toBeDefined();
    expect(result._meta.disclaimer).toBeTruthy();
  });

  it('should return error when cpv_code is missing', () => {
    const result = getAwardHistory(db, { cpv_code: '' });
    expect(result.error).toBeDefined();
  });

  it('should sort by publication_date descending', () => {
    const result = getAwardHistory(db, { cpv_code: '72200000' });
    for (let i = 1; i < result.awards.length; i++) {
      expect(result.awards[i - 1].publication_date >= result.awards[i].publication_date).toBe(true);
    }
  });
});
