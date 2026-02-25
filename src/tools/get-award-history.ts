/**
 * Tool 15: get_award_history
 * Search TED award notices with filters for CPV, NUTS region, and date range.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta, type SqlParam } from './_meta.js';

export interface GetAwardHistoryParams {
  cpv_code: string;
  nuts_region?: string;
  year_from?: number;
  year_to?: number;
  limit?: number;
}

export function getAwardHistory(
  db: DatabaseAdapter,
  params: GetAwardHistoryParams
) {
  const { cpv_code, nuts_region, year_from, year_to, limit = 20 } = params;

  if (!cpv_code || cpv_code.trim().length === 0) {
    return {
      error: 'cpv_code parameter is required and must not be empty.',
      awards: [],
      total: 0,
      _meta: createMeta('https://ted.europa.eu/'),
    };
  }

  const effectiveLimit = Math.min(Math.max(1, limit), 50);

  let sql = `
    SELECT
      buyer_name, buyer_nuts, cpv_main, winner_name, winner_country,
      value_awarded, publication_date, num_tenders_received,
      procedure_type, title, contract_duration_months
    FROM notices
    WHERE notice_type = 'contract_award'
      AND cpv_main LIKE ?
  `;

  const sqlParams: SqlParam[] = [`${cpv_code}%`];

  if (nuts_region) {
    sql += ' AND buyer_nuts LIKE ?';
    sqlParams.push(`${nuts_region}%`);
  }

  if (year_from) {
    sql += ' AND publication_date >= ?';
    sqlParams.push(`${year_from}-01-01`);
  }

  if (year_to) {
    sql += ' AND publication_date <= ?';
    sqlParams.push(`${year_to}-12-31`);
  }

  sql += ' ORDER BY publication_date DESC LIMIT ?';
  sqlParams.push(effectiveLimit);

  const rows = db.query<Record<string, unknown>>(sql, sqlParams);

  const awards = rows.map((r) => ({
    buyer_name: r.buyer_name as string,
    buyer_nuts: r.buyer_nuts as string,
    cpv_main: r.cpv_main as string,
    winner_name: r.winner_name as string,
    winner_country: r.winner_country as string | null,
    value_awarded: r.value_awarded as number | null,
    publication_date: r.publication_date as string,
    num_tenders_received: r.num_tenders_received as number | null,
    procedure_type: r.procedure_type as string | null,
    title: r.title as string | null,
    contract_duration_months: r.contract_duration_months as number | null,
  }));

  return {
    awards,
    total: awards.length,
    _meta: createMeta('https://ted.europa.eu/'),
  };
}
