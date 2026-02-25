/**
 * Tool 8: get_time_limits
 * Minimum time limits for procedure types (standstill, submission deadlines).
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta } from './_meta.js';

export interface GetTimeLimitsParams {
  procedure_type?: string;
  directive_id?: string;
  is_prior_information?: boolean;
}

export function getTimeLimits(
  db: DatabaseAdapter,
  params: GetTimeLimitsParams
) {
  const { procedure_type, directive_id } = params;

  let sql = `
    SELECT
      pt.name,
      pt.time_limits_json,
      pt.min_candidates,
      d.title AS directive_title,
      d.short_title AS directive_short_title,
      d.jurisdiction
    FROM procedure_types pt
    JOIN directives d ON d.id = pt.directive_id
    WHERE pt.time_limits_json IS NOT NULL
  `;

  const sqlParams: (string | number | null)[] = [];

  if (procedure_type) {
    sql += ' AND LOWER(pt.name) LIKE ?';
    sqlParams.push(`%${procedure_type.toLowerCase()}%`);
  }

  if (directive_id) {
    sql += ' AND (d.short_title = ? OR d.celex_number = ? OR d.title LIKE ?)';
    sqlParams.push(directive_id, directive_id, `%${directive_id}%`);
  }

  sql += ' ORDER BY d.jurisdiction, pt.name';

  const results = db.query<Record<string, unknown>>(sql, sqlParams);

  return {
    results: results.map((r) => {
      let timeLimits: Record<string, number> = {};
      if (r.time_limits_json && typeof r.time_limits_json === 'string') {
        try {
          timeLimits = JSON.parse(r.time_limits_json);
        } catch {
          timeLimits = {};
        }
      }

      return {
        procedure: r.name,
        time_limits: timeLimits,
        min_candidates: r.min_candidates,
        directive_short_title: r.directive_short_title,
        jurisdiction: r.jurisdiction,
      };
    }),
    total: results.length,
    _meta: createMeta(),
  };
}
