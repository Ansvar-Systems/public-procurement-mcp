import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { getCpvCodes } from '../../src/tools/get-cpv-codes.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('get_cpv_codes', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should find IT codes when searching "software"', () => {
    const result = getCpvCodes(db, { query: 'software' });
    expect(result.error).toBeUndefined();
    expect(result.results).toBeDefined();
    expect(result.results!.length).toBeGreaterThan(0);
    // Should include 72200000 or 48000000 area
    const codes = result.results!.map((r: { code: string }) => r.code);
    const hasSoftwareCode = codes.some(
      (c: string) => c.startsWith('72') || c.startsWith('48')
    );
    expect(hasSoftwareCode).toBe(true);
    expect(result._meta).toBeDefined();
  });

  it('should return IT category codes for prefix "72"', () => {
    const result = getCpvCodes(db, { query: '72' });
    expect(result.results).toBeDefined();
    expect(result.results!.length).toBeGreaterThan(0);
    for (const r of result.results!) {
      expect((r as { code: string }).code).toMatch(/^72/);
    }
  });

  it('should return construction codes for prefix "45"', () => {
    const result = getCpvCodes(db, { query: '45' });
    expect(result.results!.length).toBeGreaterThan(0);
    for (const r of result.results!) {
      expect((r as { code: string }).code).toMatch(/^45/);
    }
  });

  it('should filter by level', () => {
    const result = getCpvCodes(db, { query: '72', level: 2 });
    expect(result.results!.length).toBeGreaterThan(0);
    for (const r of result.results!) {
      expect((r as { level: number }).level).toBe(2);
    }
  });

  it('should respect limit', () => {
    const result = getCpvCodes(db, { query: '72', limit: 3 });
    expect(result.results!.length).toBeLessThanOrEqual(3);
  });

  it('should include multilingual descriptions', () => {
    const result = getCpvCodes(db, { query: '72000000' });
    expect(result.results!.length).toBe(1);
    const code = result.results![0] as {
      description_en: string;
      description_de: string;
      description_fr: string;
    };
    expect(code.description_en).toBeTruthy();
    expect(code.description_de).toBeTruthy();
    expect(code.description_fr).toBeTruthy();
  });

  it('should include parent_code', () => {
    const result = getCpvCodes(db, { query: '72200000' });
    expect(result.results!.length).toBe(1);
    expect((result.results![0] as { parent_code: string }).parent_code).toBe('72000000');
  });

  it('should return error for empty query', () => {
    const result = getCpvCodes(db, { query: '' });
    expect(result.error).toBeDefined();
  });

  it('should search German descriptions', () => {
    const result = getCpvCodes(db, { query: 'Beratung' });
    expect(result.results!.length).toBeGreaterThan(0);
  });
});
