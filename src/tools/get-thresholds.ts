/**
 * Tool 5: get_thresholds
 * Current procurement value thresholds by category and jurisdiction.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta } from './_meta.js';

export interface GetThresholdsParams {
  category?: string;
  jurisdiction?: string;
  as_of_date?: string;
}

export function getThresholds(
  db: DatabaseAdapter,
  params: GetThresholdsParams
) {
  const { category, jurisdiction, as_of_date } = params;

  let sql = `
    SELECT
      t.category,
      t.value_eur,
      t.effective_from,
      t.effective_to,
      d.title AS directive_title,
      d.short_title AS directive_short_title,
      d.jurisdiction
    FROM thresholds t
    LEFT JOIN directives d ON d.id = t.directive_id
    WHERE 1=1
  `;

  const sqlParams: (string | number | null)[] = [];

  if (category) {
    sql += ' AND t.category = ?';
    sqlParams.push(category);
  }

  if (jurisdiction) {
    sql += ' AND d.jurisdiction = ?';
    sqlParams.push(jurisdiction);
  }

  if (as_of_date) {
    sql += ' AND t.effective_from <= ? AND (t.effective_to IS NULL OR t.effective_to >= ?)';
    sqlParams.push(as_of_date, as_of_date);
  }

  sql += ' ORDER BY d.jurisdiction, t.category, t.effective_from DESC';

  const results = db.query<Record<string, unknown>>(sql, sqlParams);

  return {
    results: results.map((r) => ({
      category: r.category,
      value_eur: r.value_eur,
      effective_from: r.effective_from,
      effective_to: r.effective_to,
      directive_title: r.directive_title,
      directive_short_title: r.directive_short_title,
      jurisdiction: r.jurisdiction,
    })),
    total: results.length,
    _meta: createMeta(),
  };
}
