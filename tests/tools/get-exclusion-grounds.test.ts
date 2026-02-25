import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { getExclusionGrounds } from '../../src/tools/get-exclusion-grounds.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('get_exclusion_grounds', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should return EU exclusion grounds with both types', () => {
    const result = getExclusionGrounds(db, { jurisdiction: 'EU' });
    expect(result.error).toBeUndefined();
    expect(result.jurisdiction).toBe('EU');
    expect(result.mandatory).toBeDefined();
    expect(result.mandatory!.length).toBeGreaterThan(0);
    expect(result.discretionary).toBeDefined();
    expect(result.discretionary!.length).toBeGreaterThan(0);
    expect(result._meta).toBeDefined();
  });

  it('should include terrorism and corruption in mandatory grounds', () => {
    const result = getExclusionGrounds(db, {
      jurisdiction: 'EU',
      type: 'mandatory',
    });
    const grounds = result.mandatory!.map(
      (g: { ground: string }) => g.ground.toLowerCase()
    );
    expect(grounds.some((g: string) => g.includes('corruption'))).toBe(true);
    expect(grounds.some((g: string) => g.includes('terrorist'))).toBe(true);
  });

  it('should filter by mandatory type only', () => {
    const result = getExclusionGrounds(db, {
      jurisdiction: 'EU',
      type: 'mandatory',
    });
    expect(result.mandatory).toBeDefined();
    expect(result.mandatory!.length).toBeGreaterThan(0);
    expect(result.discretionary).toBeUndefined();
  });

  it('should filter by discretionary type only', () => {
    const result = getExclusionGrounds(db, {
      jurisdiction: 'EU',
      type: 'discretionary',
    });
    expect(result.discretionary).toBeDefined();
    expect(result.discretionary!.length).toBeGreaterThan(0);
    expect(result.mandatory).toBeUndefined();
  });

  it('should include article references', () => {
    const result = getExclusionGrounds(db, {
      jurisdiction: 'EU',
      type: 'mandatory',
    });
    for (const g of result.mandatory!) {
      expect((g as { article_reference: string }).article_reference).toBeTruthy();
      expect((g as { article_reference: string }).article_reference).toContain('Art.');
    }
  });

  it('should include descriptions', () => {
    const result = getExclusionGrounds(db, { jurisdiction: 'EU' });
    const first = result.mandatory![0] as { description: string };
    expect(first.description).toBeTruthy();
  });

  it('should return Swiss exclusion grounds', () => {
    const result = getExclusionGrounds(db, { jurisdiction: 'CH' });
    expect(result.mandatory).toBeDefined();
    expect(result.mandatory!.length).toBeGreaterThan(0);
  });

  it('should return error for empty jurisdiction', () => {
    const result = getExclusionGrounds(db, { jurisdiction: '' });
    expect(result.error).toBeDefined();
  });

  it('should return empty for unknown jurisdiction', () => {
    const result = getExclusionGrounds(db, { jurisdiction: 'XX' });
    expect(result.total).toBe(0);
  });
});
