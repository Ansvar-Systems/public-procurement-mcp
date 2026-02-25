/**
 * Tool 1: search_legislation
 * FTS5 full-text search across procurement provisions with BM25 ranking.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta, type SqlParam } from './_meta.js';

export interface SearchLegislationParams {
  query: string;
  jurisdiction?: string;
  directive?: string;
  limit?: number;
}

export interface SearchLegislationResult {
  article_number: string;
  title: string | null;
  directive_title: string;
  directive_short_title: string | null;
  jurisdiction: string;
  snippet: string;
  rank: number;
}

export function searchLegislation(
  db: DatabaseAdapter,
  params: SearchLegislationParams
) {
  const { query, jurisdiction, directive, limit = 20 } = params;

  if (!query || query.trim().length === 0) {
    return {
      error: 'Query parameter is required and must not be empty.',
      _meta: createMeta(),
    };
  }

  const effectiveLimit = Math.min(Math.max(1, limit), 50);

  // Build the query with optional filters
  let sql = `
    SELECT
      p.article_number,
      p.title,
      d.title AS directive_title,
      d.short_title AS directive_short_title,
      d.jurisdiction,
      snippet(provisions_fts, 2, '>>>', '<<<', '...', 32) AS snippet,
      rank
    FROM provisions_fts
    JOIN provisions p ON p.id = provisions_fts.rowid
    JOIN directives d ON d.id = p.directive_id
    WHERE provisions_fts MATCH ?
  `;

  const sqlParams: SqlParam[] = [query];

  if (jurisdiction) {
    sql += ' AND d.jurisdiction = ?';
    sqlParams.push(jurisdiction);
  }

  if (directive) {
    sql += ' AND (d.short_title = ? OR d.celex_number = ? OR d.title LIKE ?)';
    sqlParams.push(directive, directive, `%${directive}%`);
  }

  sql += ' ORDER BY rank LIMIT ?';
  sqlParams.push(effectiveLimit);

  try {
    const results = db.query<SearchLegislationResult & Record<string, unknown>>(sql, sqlParams);

    return {
      results: results.map((r) => ({
        article_number: r.article_number,
        title: r.title,
        directive_title: r.directive_title,
        directive_short_title: r.directive_short_title,
        jurisdiction: r.jurisdiction,
        snippet: r.snippet,
      })),
      total: results.length,
      query,
      _meta: createMeta(),
    };
  } catch (error) {
    return {
      error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
      _meta: createMeta(),
    };
  }
}
