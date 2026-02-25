/**
 * Tool 4: get_cpv_codes
 * Search CPV (Common Procurement Vocabulary) taxonomy by keyword or code prefix.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta } from './_meta.js';

export interface GetCpvCodesParams {
  query: string;
  level?: number;
  limit?: number;
}

export function getCpvCodes(
  db: DatabaseAdapter,
  params: GetCpvCodesParams
) {
  const { query, level, limit = 20 } = params;

  if (!query || query.trim().length === 0) {
    return {
      error: 'Query parameter is required.',
      _meta: createMeta(),
    };
  }

  const effectiveLimit = Math.min(Math.max(1, limit), 50);

  // Determine if query looks like a CPV code (starts with digits)
  const isCodePrefix = /^\d+/.test(query.trim());

  let sql: string;
  const sqlParams: (string | number | null)[] = [];

  if (isCodePrefix) {
    // Search by code prefix
    sql = `
      SELECT code, description_en, description_de, description_fr, parent_code, level
      FROM cpv_codes
      WHERE code LIKE ?
    `;
    sqlParams.push(`${query.trim()}%`);
  } else {
    // Search by keyword in descriptions
    const searchTerm = `%${query.trim().toLowerCase()}%`;
    sql = `
      SELECT code, description_en, description_de, description_fr, parent_code, level
      FROM cpv_codes
      WHERE LOWER(description_en) LIKE ?
         OR LOWER(description_de) LIKE ?
         OR LOWER(description_fr) LIKE ?
    `;
    sqlParams.push(searchTerm, searchTerm, searchTerm);
  }

  if (level !== undefined) {
    sql += ' AND level = ?';
    sqlParams.push(level);
  }

  sql += ' ORDER BY code LIMIT ?';
  sqlParams.push(effectiveLimit);

  const results = db.query<Record<string, unknown>>(sql, sqlParams);

  return {
    results: results.map((r) => ({
      code: r.code,
      description_en: r.description_en,
      description_de: r.description_de,
      description_fr: r.description_fr,
      parent_code: r.parent_code,
      level: r.level,
    })),
    total: results.length,
    query,
    _meta: createMeta('https://simap.ted.europa.eu/cpv'),
  };
}
