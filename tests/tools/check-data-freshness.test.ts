import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { checkDataFreshness } from '../../src/tools/check-data-freshness.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('check_data_freshness', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should return freshness info for each data source', () => {
    const result = checkDataFreshness(db);
    expect(result.error).toBeUndefined();
    expect(result.sources).toBeDefined();
    expect(result.sources.length).toBeGreaterThan(0);
  });

  it('should include table name, last_updated, and age_days for each source', () => {
    const result = checkDataFreshness(db);
    for (const source of result.sources) {
      expect(source.table).toBeDefined();
      expect(source.last_updated).toBeDefined();
      expect(typeof source.age_days).toBe('number');
      expect(source.age_days).toBeGreaterThanOrEqual(0);
    }
  });

  it('should include staleness threshold per source', () => {
    const result = checkDataFreshness(db);
    for (const source of result.sources) {
      expect(source.threshold_days).toBeDefined();
      expect(typeof source.threshold_days).toBe('number');
    }
  });

  it('should include is_stale flag', () => {
    const result = checkDataFreshness(db);
    for (const source of result.sources) {
      expect(typeof source.is_stale).toBe('boolean');
    }
  });

  it('should report freshness for directives (legal data)', () => {
    const result = checkDataFreshness(db);
    const directives = result.sources.find(
      (s: { table: string }) => s.table === 'directives'
    );
    expect(directives).toBeDefined();
    // Legal data threshold should be 30 days
    expect(directives!.threshold_days).toBe(30);
  });

  it('should report freshness for notices (award data)', () => {
    const result = checkDataFreshness(db);
    const notices = result.sources.find(
      (s: { table: string }) => s.table === 'notices'
    );
    expect(notices).toBeDefined();
    // Notices threshold should be 7 days
    expect(notices!.threshold_days).toBe(7);
  });

  it('should include overall freshness status', () => {
    const result = checkDataFreshness(db);
    expect(result.overall_status).toBeDefined();
    expect(['fresh', 'stale', 'mixed']).toContain(result.overall_status);
  });

  it('should include _meta', () => {
    const result = checkDataFreshness(db);
    expect(result._meta).toBeDefined();
    expect(result._meta.disclaimer).toBeTruthy();
  });
});
