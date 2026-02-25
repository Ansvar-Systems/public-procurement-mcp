import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { compareRequirements } from '../../src/tools/compare-requirements.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('compare_requirements', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should compare thresholds across EU and CH', () => {
    const result = compareRequirements(db, {
      topic: 'thresholds',
      jurisdictions: ['EU', 'CH'],
    });
    expect(result.error).toBeUndefined();
    expect(result.topic).toBe('thresholds');
    expect(result.jurisdictions).toEqual(['EU', 'CH']);
    expect(result.comparison).toBeDefined();
    expect(result._meta).toBeDefined();

    // Should have category keys like 'services', 'works'
    const cats = Object.keys(result.comparison as object);
    expect(cats.length).toBeGreaterThan(0);
    expect(cats).toContain('services');
  });

  it('should compare exclusion grounds across EU and CH', () => {
    const result = compareRequirements(db, {
      topic: 'exclusion grounds',
      jurisdictions: ['EU', 'CH'],
    });
    expect(result.topic).toBe('exclusion_grounds');
    const comparison = result.comparison as Record<string, unknown[]>;
    expect(comparison['EU']).toBeDefined();
    expect(comparison['CH']).toBeDefined();
    expect(comparison['EU'].length).toBeGreaterThan(0);
  });

  it('should compare procedures across jurisdictions', () => {
    const result = compareRequirements(db, {
      topic: 'procedure types',
      jurisdictions: ['EU', 'CH'],
    });
    expect(result.topic).toBe('procedures');
    const comparison = result.comparison as Record<string, unknown[]>;
    expect(comparison['EU']).toBeDefined();
    expect(comparison['CH']).toBeDefined();
  });

  it('should do generic FTS comparison for unknown topic', () => {
    const result = compareRequirements(db, {
      topic: 'procurement',
      jurisdictions: ['EU', 'DE'],
    });
    expect(result.topic).toBe('procurement');
    expect(result.comparison).toBeDefined();
    const comparison = result.comparison as Record<string, unknown[]>;
    // Should have at least one jurisdiction with results
    const totalResults = Object.values(comparison).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
    expect(totalResults).toBeGreaterThan(0);
  });

  it('should return error for empty topic', () => {
    const result = compareRequirements(db, {
      topic: '',
      jurisdictions: ['EU'],
    });
    expect(result.error).toBeDefined();
  });

  it('should return error for empty jurisdictions', () => {
    const result = compareRequirements(db, {
      topic: 'thresholds',
      jurisdictions: [],
    });
    expect(result.error).toBeDefined();
  });

  it('should handle jurisdictions with no data gracefully', () => {
    const result = compareRequirements(db, {
      topic: 'thresholds',
      jurisdictions: ['EU', 'XX'],
    });
    expect(result.error).toBeUndefined();
    // XX should simply have no entries
    const comparison = result.comparison as Record<string, unknown[]>;
    const cats = Object.keys(comparison);
    for (const cat of cats) {
      for (const entry of comparison[cat]) {
        expect((entry as { jurisdiction: string }).jurisdiction).not.toBe('XX');
      }
    }
  });
});
