import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { getCompetitorProfile } from '../../src/tools/get-competitor-profile.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('get_competitor_profile', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should return profile for SecurIT GmbH', () => {
    const result = getCompetitorProfile(db, { company_name: 'SecurIT GmbH' });
    expect(result.error).toBeUndefined();
    expect(result.profile).toBeDefined();
    expect(result.profile!.total_wins).toBeGreaterThan(0);
  });

  it('should support fuzzy name matching', () => {
    const result = getCompetitorProfile(db, { company_name: 'SecurIT' });
    expect(result.error).toBeUndefined();
    expect(result.profile).toBeDefined();
    expect(result.profile!.total_wins).toBeGreaterThan(0);
  });

  it('should include sector breakdown (CPV)', () => {
    const result = getCompetitorProfile(db, { company_name: 'SecurIT GmbH' });
    expect(result.profile!.sectors).toBeDefined();
    expect(result.profile!.sectors.length).toBeGreaterThan(0);
    // Each sector should have cpv_code and count
    for (const sector of result.profile!.sectors) {
      expect(sector.cpv_code).toBeDefined();
      expect(sector.count).toBeGreaterThan(0);
    }
  });

  it('should include geography breakdown', () => {
    const result = getCompetitorProfile(db, { company_name: 'SecurIT GmbH' });
    expect(result.profile!.geographies).toBeDefined();
    expect(result.profile!.geographies.length).toBeGreaterThan(0);
    for (const geo of result.profile!.geographies) {
      expect(geo.country).toBeDefined();
      expect(geo.count).toBeGreaterThan(0);
    }
  });

  it('should include average contract value', () => {
    const result = getCompetitorProfile(db, { company_name: 'SecurIT GmbH' });
    expect(typeof result.profile!.avg_contract_value).toBe('number');
    expect(result.profile!.avg_contract_value).toBeGreaterThan(0);
  });

  it('should include recent wins (up to 5)', () => {
    const result = getCompetitorProfile(db, { company_name: 'SecurIT GmbH' });
    expect(result.profile!.recent_wins).toBeDefined();
    expect(result.profile!.recent_wins.length).toBeGreaterThan(0);
    expect(result.profile!.recent_wins.length).toBeLessThanOrEqual(5);
    // Recent wins should have buyer_name and value
    for (const win of result.profile!.recent_wins) {
      expect(win.buyer_name).toBeDefined();
      expect(win.value_awarded).toBeDefined();
      expect(win.publication_date).toBeDefined();
    }
  });

  it('should return error when company not found', () => {
    const result = getCompetitorProfile(db, { company_name: 'Nonexistent Corp' });
    expect(result.error).toBeDefined();
  });

  it('should return error when company_name is empty', () => {
    const result = getCompetitorProfile(db, { company_name: '' });
    expect(result.error).toBeDefined();
  });

  it('should include _meta', () => {
    const result = getCompetitorProfile(db, { company_name: 'SecurIT GmbH' });
    expect(result._meta).toBeDefined();
    expect(result._meta.disclaimer).toBeTruthy();
  });

  it('should work for a large company like Siemens AG', () => {
    const result = getCompetitorProfile(db, { company_name: 'Siemens AG' });
    expect(result.error).toBeUndefined();
    expect(result.profile!.total_wins).toBeGreaterThan(0);
    expect(result.profile!.geographies.length).toBeGreaterThan(0);
  });
});
