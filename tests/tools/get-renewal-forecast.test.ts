import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { getRenewalForecast } from '../../src/tools/get-renewal-forecast.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('get_renewal_forecast', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should return contracts likely to re-tender', () => {
    // With months_ahead=60, we should find contracts from 2022 with 24-month durations
    // (expected re-tender around 2024) and many 2023/2024 contracts
    const result = getRenewalForecast(db, { months_ahead: 60 });
    expect(result.error).toBeUndefined();
    expect(result.forecasts).toBeDefined();
    expect(result.forecasts.length).toBeGreaterThan(0);
  });

  it('should include estimated retender date', () => {
    const result = getRenewalForecast(db, { months_ahead: 60 });
    for (const f of result.forecasts) {
      expect(f.estimated_retender_date).toBeDefined();
      expect(f.estimated_retender_date).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  });

  it('should include buyer and winner information', () => {
    const result = getRenewalForecast(db, { months_ahead: 60 });
    const f = result.forecasts[0];
    expect(f.buyer_name).toBeDefined();
    expect(f.winner_name).toBeDefined();
    expect(f.value_awarded).toBeDefined();
    expect(f.cpv_main).toBeDefined();
  });

  it('should filter by CPV code', () => {
    const result = getRenewalForecast(db, { cpv_code: '72200000', months_ahead: 60 });
    for (const f of result.forecasts) {
      expect(f.cpv_main).toMatch(/^72200/);
    }
  });

  it('should filter by NUTS region', () => {
    const result = getRenewalForecast(db, { nuts_region: 'DE', months_ahead: 60 });
    for (const f of result.forecasts) {
      expect(f.buyer_nuts).toMatch(/^DE/);
    }
  });

  it('should sort by estimated retender date ascending', () => {
    const result = getRenewalForecast(db, { months_ahead: 60 });
    for (let i = 1; i < result.forecasts.length; i++) {
      expect(
        result.forecasts[i - 1].estimated_retender_date <= result.forecasts[i].estimated_retender_date
      ).toBe(true);
    }
  });

  it('should only include awards with contract_duration_months', () => {
    const result = getRenewalForecast(db, { months_ahead: 60 });
    for (const f of result.forecasts) {
      expect(f.contract_duration_months).toBeDefined();
      expect(f.contract_duration_months).toBeGreaterThan(0);
    }
  });

  it('should default months_ahead to 12', () => {
    // With 12 months ahead from "now" (test time), fewer contracts should appear
    const result = getRenewalForecast(db, {});
    expect(result.error).toBeUndefined();
    expect(result.months_ahead).toBe(12);
  });

  it('should include _meta', () => {
    const result = getRenewalForecast(db, { months_ahead: 60 });
    expect(result._meta).toBeDefined();
    expect(result._meta.disclaimer).toBeTruthy();
  });

  it('should include total count', () => {
    const result = getRenewalForecast(db, { months_ahead: 60 });
    expect(typeof result.total).toBe('number');
  });
});
