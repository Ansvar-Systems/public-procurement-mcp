/**
 * Tool 2: get_provision
 * Retrieve the full text of a specific article from a procurement directive.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta } from './_meta.js';

export interface GetProvisionParams {
  directive_id: string;
  article?: string;
}

export function getProvision(
  db: DatabaseAdapter,
  params: GetProvisionParams
) {
  const { directive_id, article } = params;

  if (!directive_id || directive_id.trim().length === 0) {
    return {
      error: 'directive_id parameter is required.',
      _meta: createMeta(),
    };
  }

  // Resolve directive by short_title, celex_number, or title
  const directive = db.queryOne<Record<string, unknown>>(
    `SELECT id, title, short_title, jurisdiction, celex_number, effective_date, source_url
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

  if (article) {
    // Fetch a specific article
    const provision = db.queryOne<Record<string, unknown>>(
      `SELECT article_number, title, body
       FROM provisions
       WHERE directive_id = ? AND article_number = ?`,
      [directive.id as number, article]
    );

    if (!provision) {
      return {
        error: `Article ${article} not found in ${directive.short_title ?? directive.title}`,
        directive: {
          title: directive.title,
          short_title: directive.short_title,
          jurisdiction: directive.jurisdiction,
        },
        _meta: createMeta(directive.source_url as string | undefined),
      };
    }

    return {
      article_number: provision.article_number,
      title: provision.title,
      body: provision.body,
      directive: {
        title: directive.title,
        short_title: directive.short_title,
        jurisdiction: directive.jurisdiction,
        celex_number: directive.celex_number,
        effective_date: directive.effective_date,
      },
      _meta: createMeta(directive.source_url as string | undefined),
    };
  }

  // No article specified: return all provisions for the directive
  const provisions = db.query<Record<string, unknown>>(
    `SELECT article_number, title, body
     FROM provisions
     WHERE directive_id = ?
     ORDER BY CAST(article_number AS INTEGER), article_number`,
    [directive.id as number]
  );

  return {
    directive: {
      title: directive.title,
      short_title: directive.short_title,
      jurisdiction: directive.jurisdiction,
      celex_number: directive.celex_number,
      effective_date: directive.effective_date,
    },
    provisions: provisions.map((p) => ({
      article_number: p.article_number,
      title: p.title,
      body: p.body,
    })),
    total: provisions.length,
    _meta: createMeta(directive.source_url as string | undefined),
  };
}
