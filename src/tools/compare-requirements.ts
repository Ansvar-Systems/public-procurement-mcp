/**
 * Tool 9: compare_requirements
 * Cross-jurisdiction comparison of procurement requirements on a given topic.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta } from './_meta.js';

export interface CompareRequirementsParams {
  topic: string;
  jurisdictions: string[];
}

export function compareRequirements(
  db: DatabaseAdapter,
  params: CompareRequirementsParams
) {
  const { topic, jurisdictions } = params;

  if (!topic || topic.trim().length === 0) {
    return {
      error: 'topic parameter is required.',
      _meta: createMeta(),
    };
  }

  if (!jurisdictions || jurisdictions.length === 0) {
    return {
      error: 'jurisdictions array must contain at least one jurisdiction.',
      _meta: createMeta(),
    };
  }

  // Decide comparison strategy based on topic keywords
  const topicLower = topic.toLowerCase();

  if (topicLower.includes('threshold')) {
    return compareThresholds(db, jurisdictions);
  }

  if (topicLower.includes('exclusion') || topicLower.includes('ground')) {
    return compareExclusionGrounds(db, jurisdictions);
  }

  if (topicLower.includes('procedure')) {
    return compareProcedures(db, jurisdictions);
  }

  // Generic: FTS search for the topic per jurisdiction
  return compareGeneric(db, topic, jurisdictions);
}

function compareThresholds(db: DatabaseAdapter, jurisdictions: string[]) {
  const placeholders = jurisdictions.map(() => '?').join(', ');
  const results = db.query<Record<string, unknown>>(
    `SELECT
       d.jurisdiction,
       d.short_title AS directive_short_title,
       t.category,
       t.value_eur,
       t.effective_from
     FROM thresholds t
     LEFT JOIN directives d ON d.id = t.directive_id
     WHERE d.jurisdiction IN (${placeholders})
     ORDER BY t.category, d.jurisdiction`,
    jurisdictions
  );

  // Group by category
  const byCategory: Record<string, Record<string, unknown>[]> = {};
  for (const r of results) {
    const cat = r.category as string;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({
      jurisdiction: r.jurisdiction,
      directive: r.directive_short_title,
      value_eur: r.value_eur,
      effective_from: r.effective_from,
    });
  }

  return {
    topic: 'thresholds',
    jurisdictions,
    comparison: byCategory,
    _meta: createMeta(),
  };
}

function compareExclusionGrounds(db: DatabaseAdapter, jurisdictions: string[]) {
  const placeholders = jurisdictions.map(() => '?').join(', ');
  const results = db.query<Record<string, unknown>>(
    `SELECT
       eg.jurisdiction,
       eg.type,
       eg.ground,
       eg.article_reference,
       d.short_title AS directive_short_title
     FROM exclusion_grounds eg
     LEFT JOIN directives d ON d.id = eg.directive_id
     WHERE eg.jurisdiction IN (${placeholders})
     ORDER BY eg.jurisdiction, eg.type, eg.ground`,
    jurisdictions
  );

  // Group by jurisdiction
  const byJurisdiction: Record<string, Record<string, unknown>[]> = {};
  for (const r of results) {
    const j = r.jurisdiction as string;
    if (!byJurisdiction[j]) byJurisdiction[j] = [];
    byJurisdiction[j].push({
      type: r.type,
      ground: r.ground,
      article_reference: r.article_reference,
      directive: r.directive_short_title,
    });
  }

  return {
    topic: 'exclusion_grounds',
    jurisdictions,
    comparison: byJurisdiction,
    _meta: createMeta(),
  };
}

function compareProcedures(db: DatabaseAdapter, jurisdictions: string[]) {
  const placeholders = jurisdictions.map(() => '?').join(', ');
  const results = db.query<Record<string, unknown>>(
    `SELECT
       d.jurisdiction,
       pt.name,
       pt.conditions,
       pt.min_candidates,
       pt.time_limits_json,
       d.short_title AS directive_short_title
     FROM procedure_types pt
     LEFT JOIN directives d ON d.id = pt.directive_id
     WHERE d.jurisdiction IN (${placeholders})
     ORDER BY d.jurisdiction, pt.name`,
    jurisdictions
  );

  // Group by jurisdiction
  const byJurisdiction: Record<string, Record<string, unknown>[]> = {};
  for (const r of results) {
    const j = r.jurisdiction as string;
    if (!byJurisdiction[j]) byJurisdiction[j] = [];

    let timeLimits: Record<string, number> | null = null;
    if (r.time_limits_json && typeof r.time_limits_json === 'string') {
      try {
        timeLimits = JSON.parse(r.time_limits_json);
      } catch {
        timeLimits = null;
      }
    }

    byJurisdiction[j].push({
      name: r.name,
      conditions: r.conditions,
      min_candidates: r.min_candidates,
      time_limits: timeLimits,
      directive: r.directive_short_title,
    });
  }

  return {
    topic: 'procedures',
    jurisdictions,
    comparison: byJurisdiction,
    _meta: createMeta(),
  };
}

function compareGeneric(db: DatabaseAdapter, topic: string, jurisdictions: string[]) {
  const placeholders = jurisdictions.map(() => '?').join(', ');

  // Use FTS to find relevant provisions per jurisdiction
  let results: Record<string, unknown>[];
  try {
    results = db.query<Record<string, unknown>>(
      `SELECT
         p.article_number,
         p.title,
         snippet(provisions_fts, 2, '>>>', '<<<', '...', 32) AS snippet,
         d.jurisdiction,
         d.short_title AS directive_short_title
       FROM provisions_fts
       JOIN provisions p ON p.id = provisions_fts.rowid
       JOIN directives d ON d.id = p.directive_id
       WHERE provisions_fts MATCH ?
         AND d.jurisdiction IN (${placeholders})
       ORDER BY d.jurisdiction, rank
       LIMIT 30`,
      [topic, ...jurisdictions]
    );
  } catch {
    results = [];
  }

  // Group by jurisdiction
  const byJurisdiction: Record<string, Record<string, unknown>[]> = {};
  for (const r of results) {
    const j = r.jurisdiction as string;
    if (!byJurisdiction[j]) byJurisdiction[j] = [];
    byJurisdiction[j].push({
      article_number: r.article_number,
      title: r.title,
      snippet: r.snippet,
      directive: r.directive_short_title,
    });
  }

  return {
    topic,
    jurisdictions,
    comparison: byJurisdiction,
    _meta: createMeta(),
  };
}
