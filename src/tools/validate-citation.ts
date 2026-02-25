/**
 * Tool 10: validate_citation
 * Validate a procurement law citation against the database.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta } from './_meta.js';

export interface ValidateCitationParams {
  citation: string;
}

interface ParsedCitation {
  article: string | null;
  directive: string | null;
  raw: string;
}

/**
 * Parse a citation string into its components.
 * Supports formats like:
 *   "Article 18, Directive 2014/24/EU"
 *   "Art. 57(1) Directive 2014/24/EU"
 *   "Art. 57 2014/24/EU"
 *   "Section 97 GWB"
 *   "Art. 26(1)(a) BoeB"
 */
function parseCitation(citation: string): ParsedCitation {
  const raw = citation.trim();

  // Pattern 1: "Article NN" or "Art. NN" with optional subsection, then directive ref
  const artMatch = raw.match(
    /(?:Article|Art\.?|Section|Para\.?|§)\s*(\d+(?:\(\d+\)(?:\([a-z]\))?)?)/i
  );

  // Pattern 2: directive reference — look for known formats
  // "Directive 2014/24/EU", "2014/24/EU", "BoeB", "GWB", "BVergG 2018"
  const directivePatterns = [
    /(?:Directive\s+)?(\d{4}\/\d+\/\w+)/i,
    /(?:Regulation\s+)?(\d{4}\/\d+)/i,
    /\b(BoeB|GWB|BVergG\s*\d*|VgV)\b/i,
    /\b(\d{2}\d{3}[A-Z]\d{4})\b/, // CELEX number
  ];

  let directive: string | null = null;
  for (const pattern of directivePatterns) {
    const m = raw.match(pattern);
    if (m) {
      directive = m[1].trim();
      break;
    }
  }

  // If no known directive pattern matched, try the last word(s) after article ref
  if (!directive && artMatch) {
    const afterArticle = raw.substring((artMatch.index ?? 0) + artMatch[0].length).trim();
    // Remove leading comma or comma-space
    const cleaned = afterArticle.replace(/^[,\s]+/, '').trim();
    if (cleaned.length > 0) {
      directive = cleaned;
    }
  }

  const article = artMatch ? artMatch[1] : null;

  return { article, directive, raw };
}

export function validateCitation(
  db: DatabaseAdapter,
  params: ValidateCitationParams
) {
  const { citation } = params;

  if (!citation || citation.trim().length === 0) {
    return {
      valid: false,
      error: 'citation parameter is required.',
      _meta: createMeta(),
    };
  }

  const parsed = parseCitation(citation);

  if (!parsed.directive) {
    return {
      valid: false,
      parsed,
      error: 'Could not identify a directive or law reference in the citation.',
      _meta: createMeta(),
    };
  }

  // Resolve directive
  const directive = db.queryOne<Record<string, unknown>>(
    `SELECT id, title, short_title, jurisdiction, celex_number, effective_date, source_url
     FROM directives
     WHERE short_title = ? OR celex_number = ? OR title LIKE ?
        OR short_title LIKE ?`,
    [parsed.directive, parsed.directive, `%${parsed.directive}%`, `%${parsed.directive}%`]
  );

  if (!directive) {
    return {
      valid: false,
      parsed,
      document_exists: false,
      provision_exists: false,
      error: `Directive or law not found: "${parsed.directive}"`,
      _meta: createMeta(),
    };
  }

  // If no article specified, just validate the directive
  if (!parsed.article) {
    return {
      valid: true,
      parsed,
      document_exists: true,
      provision_exists: null,
      directive: {
        title: directive.title,
        short_title: directive.short_title,
        jurisdiction: directive.jurisdiction,
      },
      message: 'Directive reference is valid. No specific article was cited.',
      _meta: createMeta(directive.source_url as string | undefined),
    };
  }

  // Normalize article number (strip parenthesized subsections for lookup)
  const baseArticle = parsed.article.replace(/\(.*\)/, '').trim();

  // Look up the provision
  const provision = db.queryOne<Record<string, unknown>>(
    `SELECT article_number, title, body
     FROM provisions
     WHERE directive_id = ? AND article_number = ?`,
    [directive.id as number, baseArticle]
  );

  if (!provision) {
    return {
      valid: false,
      parsed,
      document_exists: true,
      provision_exists: false,
      directive: {
        title: directive.title,
        short_title: directive.short_title,
        jurisdiction: directive.jurisdiction,
      },
      error: `Article ${parsed.article} not found in ${directive.short_title ?? directive.title}`,
      _meta: createMeta(directive.source_url as string | undefined),
    };
  }

  // Build the correct citation form
  const correctForm = `Article ${provision.article_number}, ${directive.short_title ?? directive.title}`;

  return {
    valid: true,
    parsed,
    document_exists: true,
    provision_exists: true,
    correct_form: correctForm,
    directive: {
      title: directive.title,
      short_title: directive.short_title,
      jurisdiction: directive.jurisdiction,
    },
    provision: {
      article_number: provision.article_number,
      title: provision.title,
      body: provision.body,
    },
    _meta: createMeta(directive.source_url as string | undefined),
  };
}
