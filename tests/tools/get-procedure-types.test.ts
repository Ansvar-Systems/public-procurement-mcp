import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { getProcedureTypes } from '../../src/tools/get-procedure-types.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('get_procedure_types', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should return all procedure types when no filters', () => {
    const result = getProcedureTypes(db, {});
    expect(result.results).toBeDefined();
    expect(result.results!.length).toBeGreaterThan(0);
    expect(result._meta).toBeDefined();
  });

  it('should return procedures for 2014/24/EU', () => {
    const result = getProcedureTypes(db, { directive_id: '2014/24/EU' });
    expect(result.results!.length).toBeGreaterThan(0);
    const names = result.results!.map((r: { name: string }) => r.name);
    expect(names).toContain('Open procedure');
    expect(names).toContain('Restricted procedure');
  });

  it('should include parsed time limits', () => {
    const result = getProcedureTypes(db, { directive_id: '2014/24/EU' });
    const open = result.results!.find(
      (r: { name: string }) => r.name === 'Open procedure'
    ) as { time_limits: Record<string, number> };
    expect(open).toBeDefined();
    expect(open.time_limits).toBeDefined();
    expect(open.time_limits.tender_receipt).toBe(35);
  });

  it('should include min_candidates where applicable', () => {
    const result = getProcedureTypes(db, { directive_id: '2014/24/EU' });
    const restricted = result.results!.find(
      (r: { name: string }) => r.name === 'Restricted procedure'
    ) as { min_candidates: number };
    expect(restricted).toBeDefined();
    expect(restricted.min_candidates).toBe(5);
  });

  it('should filter by jurisdiction', () => {
    const result = getProcedureTypes(db, { jurisdiction: 'CH' });
    expect(result.results!.length).toBeGreaterThan(0);
    for (const r of result.results!) {
      expect((r as { jurisdiction: string }).jurisdiction).toBe('CH');
    }
  });

  it('should include conditions text', () => {
    const result = getProcedureTypes(db, { directive_id: '2014/24/EU' });
    const open = result.results!.find(
      (r: { name: string }) => r.name === 'Open procedure'
    ) as { conditions: string };
    expect(open.conditions).toBeTruthy();
    expect(open.conditions).toContain('interested economic operator');
  });

  it('should include directive reference', () => {
    const result = getProcedureTypes(db, { directive_id: '2014/24/EU' });
    const first = result.results![0] as {
      directive_short_title: string;
      jurisdiction: string;
    };
    expect(first.directive_short_title).toBe('2014/24/EU');
    expect(first.jurisdiction).toBe('EU');
  });
});
