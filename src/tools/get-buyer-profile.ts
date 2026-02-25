/**
 * Tool 14: get_buyer_profile
 * Get a contracting authority profile from the buyer_profiles materialized view.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta, type SqlParam } from './_meta.js';

export interface GetBuyerProfileParams {
  buyer_id?: string;
  buyer_name?: string;
}

export function getBuyerProfile(
  db: DatabaseAdapter,
  params: GetBuyerProfileParams
) {
  const { buyer_id, buyer_name } = params;

  if (!buyer_id && !buyer_name) {
    return {
      error: 'Either buyer_id or buyer_name is required.',
      _meta: createMeta('https://ted.europa.eu/'),
    };
  }

  let sql: string;
  const sqlParams: SqlParam[] = [];

  if (buyer_id) {
    sql = `SELECT * FROM buyer_profiles WHERE buyer_id = ?`;
    sqlParams.push(buyer_id);
  } else {
    sql = `SELECT * FROM buyer_profiles WHERE buyer_name LIKE ?`;
    sqlParams.push(`%${buyer_name}%`);
  }

  const row = db.queryOne<Record<string, unknown>>(sql, sqlParams);

  if (!row) {
    const identifier = buyer_id ?? buyer_name;
    return {
      error: `Buyer not found: "${identifier}"`,
      _meta: createMeta('https://ted.europa.eu/'),
    };
  }

  return {
    profile: {
      buyer_id: row.buyer_id as string,
      buyer_name: row.buyer_name as string,
      buyer_nuts: row.buyer_nuts as string | null,
      total_awards: row.total_awards as number,
      avg_value_eur: row.avg_value_eur as number,
      median_value_eur: row.median_value_eur as number,
      preferred_procedure: row.preferred_procedure as string | null,
      preferred_criteria: row.preferred_criteria as string | null,
      avg_bidders: row.avg_bidders as number,
      top_cpv_codes: row.top_cpv_codes as string | null,
      first_seen: row.first_seen as string | null,
      last_seen: row.last_seen as string | null,
    },
    _meta: createMeta('https://ted.europa.eu/'),
  };
}
