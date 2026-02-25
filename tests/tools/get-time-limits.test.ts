import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { getTimeLimits } from '../../src/tools/get-time-limits.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('get_time_limits', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should return all time limits when no filters', () => {
    const result = getTimeLimits(db, {});
    expect(result.results).toBeDefined();
    expect(result.results!.length).toBeGreaterThan(0);
    expect(result._meta).toBeDefined();
  });

  it('should return 35-day minimum for EU open procedure', () => {
    const result = getTimeLimits(db, {
      procedure_type: 'open',
      directive_id: '2014/24/EU',
    });
    expect(result.results!.length).toBeGreaterThan(0);
    const open = result.results![0] as {
      time_limits: Record<string, number>;
    };
    expect(open).toBeDefined();
    expect(open.time_limits.tender_receipt).toBe(35);
  });

  it('should return 30-day minimum for restricted procedure request to participate', () => {
    const result = getTimeLimits(db, { procedure_type: 'restricted' });
    const restricted = result.results![0] as {
      time_limits: Record<string, number>;
    };
    expect(restricted.time_limits.request_to_participate).toBe(30);
    expect(restricted.time_limits.tender_receipt).toBe(30);
  });

  it('should filter by directive', () => {
    const result = getTimeLimits(db, { directive_id: '2014/24/EU' });
    expect(result.results!.length).toBeGreaterThan(0);
    for (const r of result.results!) {
      expect((r as { directive_short_title: string }).directive_short_title).toBe(
        '2014/24/EU'
      );
    }
  });

  it('should include accelerated time limits', () => {
    const result = getTimeLimits(db, {
      procedure_type: 'open',
      directive_id: '2014/24/EU',
    });
    const open = result.results![0] as {
      time_limits: Record<string, number>;
    };
    expect(open.time_limits.accelerated).toBe(15);
  });

  it('should return Swiss time limits', () => {
    const result = getTimeLimits(db, { directive_id: 'BoeB' });
    expect(result.results!.length).toBeGreaterThan(0);
    for (const r of result.results!) {
      expect((r as { jurisdiction: string }).jurisdiction).toBe('CH');
    }
  });

  it('should include procedure name and jurisdiction', () => {
    const result = getTimeLimits(db, {});
    const first = result.results![0] as {
      procedure: string;
      jurisdiction: string;
    };
    expect(first.procedure).toBeTruthy();
    expect(first.jurisdiction).toBeTruthy();
  });
});
