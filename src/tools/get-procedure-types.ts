/**
 * Tool 6: get_procedure_types
 * List procurement procedure types with conditions, candidates, and time limits.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta } from './_meta.js';

export interface GetProcedureTypesParams {
  directive_id?: string;
  jurisdiction?: string;
  above_threshold?: boolean;
  value_eur?: number;
}

export function getProcedureTypes(
  db: DatabaseAdapter,
  params: GetProcedureTypesParams
) {
  const { directive_id, jurisdiction } = params;

  let sql = `
    SELECT
      pt.name,
      pt.conditions,
      pt.min_candidates,
      pt.time_limits_json,
      d.title AS directive_title,
      d.short_title AS directive_short_title,
      d.jurisdiction
    FROM procedure_types pt
    LEFT JOIN directives d ON d.id = pt.directive_id
    WHERE 1=1
  `;

  const sqlParams: (string | number | null)[] = [];

  if (directive_id) {
    sql += ' AND (d.short_title = ? OR d.celex_number = ? OR d.title LIKE ?)';
    sqlParams.push(directive_id, directive_id, `%${directive_id}%`);
  }

  if (jurisdiction) {
    sql += ' AND d.jurisdiction = ?';
    sqlParams.push(jurisdiction);
  }

  sql += ' ORDER BY d.jurisdiction, pt.name';

  const results = db.query<Record<string, unknown>>(sql, sqlParams);

  return {
    results: results.map((r) => {
      let timeLimits: Record<string, number> | null = null;
      if (r.time_limits_json && typeof r.time_limits_json === 'string') {
        try {
          timeLimits = JSON.parse(r.time_limits_json);
        } catch {
          timeLimits = null;
        }
      }

      return {
        name: r.name,
        conditions: r.conditions,
        min_candidates: r.min_candidates,
        time_limits: timeLimits,
        directive_title: r.directive_title,
        directive_short_title: r.directive_short_title,
        jurisdiction: r.jurisdiction,
      };
    }),
    total: results.length,
    _meta: createMeta(),
  };
}
