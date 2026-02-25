/**
 * Tool 7: get_exclusion_grounds
 * Mandatory and discretionary exclusion grounds with article references.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta } from './_meta.js';

export interface GetExclusionGroundsParams {
  jurisdiction: string;
  type?: 'mandatory' | 'discretionary' | 'both';
}

export function getExclusionGrounds(
  db: DatabaseAdapter,
  params: GetExclusionGroundsParams
) {
  const { jurisdiction, type = 'both' } = params;

  if (!jurisdiction || jurisdiction.trim().length === 0) {
    return {
      error: 'jurisdiction parameter is required.',
      _meta: createMeta(),
    };
  }

  let sql = `
    SELECT
      eg.type,
      eg.ground,
      eg.article_reference,
      eg.description,
      d.title AS directive_title,
      d.short_title AS directive_short_title
    FROM exclusion_grounds eg
    JOIN directives d ON d.id = eg.directive_id
    WHERE eg.jurisdiction = ?
  `;

  const sqlParams: (string | number | null)[] = [jurisdiction];

  if (type !== 'both') {
    sql += ' AND eg.type = ?';
    sqlParams.push(type);
  }

  sql += ' ORDER BY eg.type, eg.ground';

  const results = db.query<Record<string, unknown>>(sql, sqlParams);

  // Group by type
  const mandatory = results
    .filter((r) => r.type === 'mandatory')
    .map((r) => ({
      ground: r.ground,
      article_reference: r.article_reference,
      description: r.description,
      directive_short_title: r.directive_short_title,
    }));

  const discretionary = results
    .filter((r) => r.type === 'discretionary')
    .map((r) => ({
      ground: r.ground,
      article_reference: r.article_reference,
      description: r.description,
      directive_short_title: r.directive_short_title,
    }));

  return {
    jurisdiction,
    mandatory: type === 'discretionary' ? undefined : mandatory,
    discretionary: type === 'mandatory' ? undefined : discretionary,
    total: results.length,
    _meta: createMeta(),
  };
}
