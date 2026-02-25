/**
 * Tool 17: get_price_benchmark
 * Get price benchmarks for a CPV code: percentiles, average bidders, top winners.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta, type SqlParam } from './_meta.js';

export interface GetPriceBenchmarkParams {
  cpv_code: string;
  nuts_country?: string;
  year_from?: number;
  year_to?: number;
}

interface BenchmarkEntry {
  cpv_main: string;
  nuts_country: string;
  year: number;
  award_count: number;
  p25_value: number;
  median_value: number;
  p75_value: number;
  avg_bidders: number;
  top_winners: string;
}

export function getPriceBenchmark(
  db: DatabaseAdapter,
  params: GetPriceBenchmarkParams
) {
  const { cpv_code, nuts_country, year_from, year_to } = params;

  if (!cpv_code || cpv_code.trim().length === 0) {
    return {
      error: 'cpv_code parameter is required and must not be empty.',
      benchmarks: [],
      _meta: createMeta('https://ted.europa.eu/'),
    };
  }

  let sql = `
    SELECT cpv_main, nuts_country, year, award_count,
           p25_value, median_value, p75_value, avg_bidders, top_winners
    FROM cpv_benchmarks
    WHERE cpv_main = ?
  `;
  const sqlParams: SqlParam[] = [cpv_code];

  if (nuts_country) {
    sql += ' AND nuts_country = ?';
    sqlParams.push(nuts_country);
  }

  if (year_from) {
    sql += ' AND year >= ?';
    sqlParams.push(year_from);
  }

  if (year_to) {
    sql += ' AND year <= ?';
    sqlParams.push(year_to);
  }

  sql += ' ORDER BY nuts_country, year DESC';

  const rows = db.query<Record<string, unknown>>(sql, sqlParams);

  const benchmarks: BenchmarkEntry[] = rows.map((r) => ({
    cpv_main: r.cpv_main as string,
    nuts_country: r.nuts_country as string,
    year: r.year as number,
    award_count: r.award_count as number,
    p25_value: r.p25_value as number,
    median_value: r.median_value as number,
    p75_value: r.p75_value as number,
    avg_bidders: r.avg_bidders as number,
    top_winners: r.top_winners as string,
  }));

  return {
    benchmarks,
    total: benchmarks.length,
    _meta: createMeta('https://ted.europa.eu/'),
  };
}
