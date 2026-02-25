import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { getThresholds } from '../../src/tools/get-thresholds.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('get_thresholds', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should return all thresholds when no filters', () => {
    const result = getThresholds(db, {});
    expect(result.results).toBeDefined();
    expect(result.results!.length).toBeGreaterThan(0);
    expect(result._meta).toBeDefined();
  });

  it('should filter by category "services"', () => {
    const result = getThresholds(db, { category: 'services' });
    expect(result.results!.length).toBeGreaterThan(0);
    for (const r of result.results!) {
      expect((r as { category: string }).category).toBe('services');
    }
  });

  it('should filter by jurisdiction "EU"', () => {
    const result = getThresholds(db, { jurisdiction: 'EU' });
    expect(result.results!.length).toBeGreaterThan(0);
    for (const r of result.results!) {
      expect((r as { jurisdiction: string }).jurisdiction).toBe('EU');
    }
  });

  it('should return correct EU services threshold', () => {
    const result = getThresholds(db, {
      category: 'services',
      jurisdiction: 'EU',
    });
    expect(result.results!.length).toBeGreaterThanOrEqual(1);
    const first = result.results![0] as { value_eur: number };
    expect(first.value_eur).toBe(143000);
  });

  it('should return correct EU works threshold', () => {
    const result = getThresholds(db, {
      category: 'works',
      jurisdiction: 'EU',
    });
    const first = result.results![0] as { value_eur: number };
    expect(first.value_eur).toBe(5538000);
  });

  it('should return Swiss thresholds for CH', () => {
    const result = getThresholds(db, { jurisdiction: 'CH' });
    expect(result.results!.length).toBeGreaterThan(0);
    for (const r of result.results!) {
      expect((r as { jurisdiction: string }).jurisdiction).toBe('CH');
    }
  });

  it('should include directive reference', () => {
    const result = getThresholds(db, { category: 'services', jurisdiction: 'EU' });
    const first = result.results![0] as {
      directive_title: string;
      directive_short_title: string;
    };
    expect(first.directive_title).toBeTruthy();
    expect(first.directive_short_title).toBeTruthy();
  });

  it('should filter by as_of_date', () => {
    const result = getThresholds(db, { as_of_date: '2024-06-01' });
    expect(result.results!.length).toBeGreaterThan(0);
    for (const r of result.results!) {
      const row = r as { effective_from: string };
      expect(row.effective_from <= '2024-06-01').toBe(true);
    }
  });
});
