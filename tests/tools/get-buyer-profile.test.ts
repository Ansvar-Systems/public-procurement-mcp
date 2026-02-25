import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { getBuyerProfile } from '../../src/tools/get-buyer-profile.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('get_buyer_profile', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should return profile by buyer_id', () => {
    const result = getBuyerProfile(db, { buyer_id: 'BUY-DE-001' });
    expect(result.error).toBeUndefined();
    expect(result.profile).toBeDefined();
    expect(result.profile!.buyer_id).toBe('BUY-DE-001');
    expect(result.profile!.buyer_name).toBe('Bundesamt fuer Sicherheit in der Informationstechnik');
    expect(result.profile!.total_awards).toBeGreaterThan(0);
  });

  it('should return profile by buyer_name (fuzzy)', () => {
    const result = getBuyerProfile(db, { buyer_name: 'Bundesamt fuer Sicherheit' });
    expect(result.error).toBeUndefined();
    expect(result.profile).toBeDefined();
    expect(result.profile!.buyer_id).toBe('BUY-DE-001');
  });

  it('should include all expected fields', () => {
    const result = getBuyerProfile(db, { buyer_id: 'BUY-DE-001' });
    const p = result.profile!;
    expect(p.total_awards).toBeDefined();
    expect(p.avg_value_eur).toBeDefined();
    expect(p.median_value_eur).toBeDefined();
    expect(p.preferred_procedure).toBeDefined();
    expect(p.preferred_criteria).toBeDefined();
    expect(p.avg_bidders).toBeDefined();
    expect(p.top_cpv_codes).toBeDefined();
    expect(p.first_seen).toBeDefined();
    expect(p.last_seen).toBeDefined();
  });

  it('should return error when buyer not found', () => {
    const result = getBuyerProfile(db, { buyer_id: 'NONEXISTENT' });
    expect(result.error).toBeDefined();
  });

  it('should return error when no params provided', () => {
    const result = getBuyerProfile(db, {});
    expect(result.error).toBeDefined();
  });

  it('should include _meta', () => {
    const result = getBuyerProfile(db, { buyer_id: 'BUY-DE-001' });
    expect(result._meta).toBeDefined();
    expect(result._meta.disclaimer).toBeTruthy();
  });

  it('should return numeric values for financial fields', () => {
    const result = getBuyerProfile(db, { buyer_id: 'BUY-DE-001' });
    const p = result.profile!;
    expect(typeof p.avg_value_eur).toBe('number');
    expect(typeof p.median_value_eur).toBe('number');
    expect(typeof p.avg_bidders).toBe('number');
    expect(typeof p.total_awards).toBe('number');
  });

  it('should work for Austrian buyer', () => {
    const result = getBuyerProfile(db, { buyer_id: 'BUY-AT-001' });
    expect(result.error).toBeUndefined();
    expect(result.profile!.buyer_name).toContain('Bundesrechenzentrum');
  });
});
