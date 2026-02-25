import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { getPriceBenchmark } from '../../src/tools/get-price-benchmark.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('get_price_benchmark', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should return benchmark for IT services in Germany', () => {
    const result = getPriceBenchmark(db, { cpv_code: '72200000', nuts_country: 'DE' });
    expect(result.error).toBeUndefined();
    expect(result.benchmarks).toBeDefined();
    expect(result.benchmarks.length).toBeGreaterThan(0);
  });

  it('should include percentile values', () => {
    const result = getPriceBenchmark(db, { cpv_code: '72200000', nuts_country: 'DE' });
    const b = result.benchmarks[0];
    expect(typeof b.p25_value).toBe('number');
    expect(typeof b.median_value).toBe('number');
    expect(typeof b.p75_value).toBe('number');
    // p25 <= median <= p75
    expect(b.p25_value).toBeLessThanOrEqual(b.median_value);
    expect(b.median_value).toBeLessThanOrEqual(b.p75_value);
  });

  it('should include award count and avg bidders', () => {
    const result = getPriceBenchmark(db, { cpv_code: '72200000', nuts_country: 'DE' });
    const b = result.benchmarks[0];
    expect(b.award_count).toBeGreaterThan(0);
    expect(typeof b.avg_bidders).toBe('number');
  });

  it('should include top winners', () => {
    const result = getPriceBenchmark(db, { cpv_code: '72200000', nuts_country: 'DE' });
    const b = result.benchmarks[0];
    expect(b.top_winners).toBeDefined();
    expect(typeof b.top_winners).toBe('string');
    expect(b.top_winners.length).toBeGreaterThan(0);
  });

  it('should filter by year range', () => {
    const result = getPriceBenchmark(db, {
      cpv_code: '72200000',
      nuts_country: 'DE',
      year_from: 2024,
      year_to: 2024,
    });
    expect(result.benchmarks.length).toBeGreaterThan(0);
    for (const b of result.benchmarks) {
      expect(b.year).toBe(2024);
    }
  });

  it('should return benchmarks across years when no year filter', () => {
    const result = getPriceBenchmark(db, { cpv_code: '72200000', nuts_country: 'DE' });
    expect(result.benchmarks.length).toBeGreaterThanOrEqual(2); // 2023 + 2024
  });

  it('should return empty for nonexistent CPV', () => {
    const result = getPriceBenchmark(db, { cpv_code: '99999999' });
    expect(result.benchmarks.length).toBe(0);
  });

  it('should return error for empty cpv_code', () => {
    const result = getPriceBenchmark(db, { cpv_code: '' });
    expect(result.error).toBeDefined();
  });

  it('should include _meta', () => {
    const result = getPriceBenchmark(db, { cpv_code: '72200000' });
    expect(result._meta).toBeDefined();
    expect(result._meta.disclaimer).toBeTruthy();
  });

  it('should return benchmarks without country filter (all countries)', () => {
    const result = getPriceBenchmark(db, { cpv_code: '72200000' });
    expect(result.benchmarks.length).toBeGreaterThanOrEqual(4); // DE+AT+CH+BE
  });
});
