/**
 * Tool 3: get_directive_overview
 * Summary overview of a procurement directive including scope, key articles,
 * threshold data, and procedure types.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta } from './_meta.js';

export interface GetDirectiveOverviewParams {
  directive_id: string;
}

export function getDirectiveOverview(
  db: DatabaseAdapter,
  params: GetDirectiveOverviewParams
) {
  const { directive_id } = params;

  if (!directive_id || directive_id.trim().length === 0) {
    return {
      error: 'directive_id parameter is required.',
      _meta: createMeta(),
    };
  }

  // Resolve directive
  const directive = db.queryOne<Record<string, unknown>>(
    `SELECT id, title, short_title, jurisdiction, type, celex_number, effective_date, source_url
     FROM directives
     WHERE short_title = ? OR celex_number = ? OR title LIKE ?`,
    [directive_id, directive_id, `%${directive_id}%`]
  );

  if (!directive) {
    return {
      error: `Directive not found: "${directive_id}"`,
      _meta: createMeta(),
    };
  }

  // Count articles
  const articleCount = db.queryOne<Record<string, unknown>>(
    `SELECT COUNT(*) as cnt FROM provisions WHERE directive_id = ?`,
    [directive.id as number]
  );

  // Get key articles (list of article numbers and titles)
  const articles = db.query<Record<string, unknown>>(
    `SELECT article_number, title
     FROM provisions
     WHERE directive_id = ?
     ORDER BY CAST(article_number AS INTEGER), article_number`,
    [directive.id as number]
  );

  // Get thresholds
  const thresholds = db.query<Record<string, unknown>>(
    `SELECT category, value_eur, effective_from, effective_to
     FROM thresholds
     WHERE directive_id = ?
     ORDER BY category`,
    [directive.id as number]
  );

  // Get procedure types
  const procedures = db.query<Record<string, unknown>>(
    `SELECT name, conditions, min_candidates
     FROM procedure_types
     WHERE directive_id = ?`,
    [directive.id as number]
  );

  // Get scope from Article 1 if it exists
  const scopeArticle = db.queryOne<Record<string, unknown>>(
    `SELECT body FROM provisions WHERE directive_id = ? AND article_number = '1'`,
    [directive.id as number]
  );

  return {
    title: directive.title,
    short_title: directive.short_title,
    jurisdiction: directive.jurisdiction,
    type: directive.type,
    celex_number: directive.celex_number,
    effective_date: directive.effective_date,
    scope: scopeArticle?.body ?? null,
    article_count: articleCount?.cnt ?? 0,
    key_articles: articles.map((a) => ({
      article_number: a.article_number,
      title: a.title,
    })),
    thresholds: thresholds.map((t) => ({
      category: t.category,
      value_eur: t.value_eur,
      effective_from: t.effective_from,
      effective_to: t.effective_to,
    })),
    procedure_types: procedures.map((p) => ({
      name: p.name,
      conditions: p.conditions,
      min_candidates: p.min_candidates,
    })),
    _meta: createMeta(directive.source_url as string | undefined),
  };
}
