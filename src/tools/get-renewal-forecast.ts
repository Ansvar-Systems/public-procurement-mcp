/**
 * Tool 19: get_renewal_forecast
 * Predict upcoming contract renewals based on award date + contract duration.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta, type SqlParam } from './_meta.js';

export interface GetRenewalForecastParams {
  cpv_code?: string;
  nuts_region?: string;
  months_ahead?: number;
  limit?: number;
}

interface ForecastEntry {
  buyer_name: string;
  buyer_nuts: string;
  cpv_main: string;
  winner_name: string;
  value_awarded: number | null;
  publication_date: string;
  contract_duration_months: number;
  estimated_retender_date: string;
  title: string | null;
}

export function getRenewalForecast(
  db: DatabaseAdapter,
  params: GetRenewalForecastParams
) {
  const { cpv_code, nuts_region, months_ahead = 12, limit = 20 } = params;

  const effectiveLimit = Math.min(Math.max(1, limit), 50);
  const now = new Date();
  const forecastEnd = new Date(now);
  forecastEnd.setMonth(forecastEnd.getMonth() + months_ahead);

  const nowStr = now.toISOString().split('T')[0];
  const forecastEndStr = forecastEnd.toISOString().split('T')[0];

  // Calculate estimated retender date as publication_date + contract_duration_months
  // Using SQLite date functions
  let sql = `
    SELECT
      buyer_name, buyer_nuts, cpv_main, winner_name, value_awarded,
      publication_date, contract_duration_months, title,
      date(publication_date, '+' || contract_duration_months || ' months') as estimated_retender_date
    FROM notices
    WHERE notice_type = 'contract_award'
      AND contract_duration_months IS NOT NULL
      AND contract_duration_months > 0
      AND date(publication_date, '+' || contract_duration_months || ' months') >= ?
      AND date(publication_date, '+' || contract_duration_months || ' months') <= ?
  `;

  const sqlParams: SqlParam[] = [nowStr, forecastEndStr];

  if (cpv_code) {
    sql += ' AND cpv_main LIKE ?';
    sqlParams.push(`${cpv_code}%`);
  }

  if (nuts_region) {
    sql += ' AND buyer_nuts LIKE ?';
    sqlParams.push(`${nuts_region}%`);
  }

  sql += ' ORDER BY estimated_retender_date ASC LIMIT ?';
  sqlParams.push(effectiveLimit);

  const rows = db.query<Record<string, unknown>>(sql, sqlParams);

  const forecasts: ForecastEntry[] = rows.map((r) => ({
    buyer_name: r.buyer_name as string,
    buyer_nuts: r.buyer_nuts as string,
    cpv_main: r.cpv_main as string,
    winner_name: r.winner_name as string,
    value_awarded: r.value_awarded as number | null,
    publication_date: r.publication_date as string,
    contract_duration_months: r.contract_duration_months as number,
    estimated_retender_date: r.estimated_retender_date as string,
    title: r.title as string | null,
  }));

  return {
    forecasts,
    total: forecasts.length,
    months_ahead,
    forecast_window: {
      from: nowStr,
      to: forecastEndStr,
    },
    _meta: createMeta('https://ted.europa.eu/'),
  };
}
