/**
 * Tool 18: get_framework_agreements
 * Find active and recent framework agreements by CPV code and NUTS region.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta, type SqlParam } from './_meta.js';

export interface GetFrameworkAgreementsParams {
  cpv_code: string;
  nuts_region?: string;
  limit?: number;
}

export function getFrameworkAgreements(
  db: DatabaseAdapter,
  params: GetFrameworkAgreementsParams
) {
  const { cpv_code, nuts_region, limit = 20 } = params;

  if (!cpv_code || cpv_code.trim().length === 0) {
    return {
      error: 'cpv_code parameter is required and must not be empty.',
      agreements: [],
      total: 0,
      _meta: createMeta('https://ted.europa.eu/'),
    };
  }

  const effectiveLimit = Math.min(Math.max(1, limit), 50);

  let sql = `
    SELECT
      buyer_name, buyer_nuts, cpv_main, winner_name, winner_country,
      value_estimated, value_awarded, publication_date,
      contract_duration_months, title, procedure_type
    FROM notices
    WHERE framework_agreement = 1
      AND cpv_main LIKE ?
  `;

  const sqlParams: SqlParam[] = [`${cpv_code}%`];

  if (nuts_region) {
    sql += ' AND buyer_nuts LIKE ?';
    sqlParams.push(`${nuts_region}%`);
  }

  sql += ' ORDER BY publication_date DESC LIMIT ?';
  sqlParams.push(effectiveLimit);

  const rows = db.query<Record<string, unknown>>(sql, sqlParams);

  const agreements = rows.map((r) => ({
    buyer_name: r.buyer_name as string,
    buyer_nuts: r.buyer_nuts as string,
    cpv_main: r.cpv_main as string,
    winner_name: r.winner_name as string | null,
    winner_country: r.winner_country as string | null,
    value_estimated: r.value_estimated as number | null,
    value_awarded: r.value_awarded as number | null,
    publication_date: r.publication_date as string,
    contract_duration_months: r.contract_duration_months as number | null,
    title: r.title as string | null,
    procedure_type: r.procedure_type as string | null,
  }));

  return {
    agreements,
    total: agreements.length,
    _meta: createMeta('https://ted.europa.eu/'),
  };
}
