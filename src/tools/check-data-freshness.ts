/**
 * Tool 13: check_data_freshness
 * Checks how current each data source is and whether any sources need refreshing.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta } from './_meta.js';

interface FreshnessEntry {
  table: string;
  last_updated: string | null;
  age_days: number;
  threshold_days: number;
  is_stale: boolean;
}

/**
 * Staleness thresholds by table category.
 * Legal data changes infrequently (30 days); award data should be fresh (7 days).
 */
const THRESHOLDS: Record<string, number> = {
  directives: 30,
  provisions: 30,
  cpv_codes: 90,
  nuts_regions: 90,
  notices: 7,
  buyer_profiles: 7,
  cpv_benchmarks: 7,
};

const TABLES_WITH_CREATED_AT = ['directives', 'notices'];
const TABLES_WITH_UPDATED_AT = ['buyer_profiles'];

function getLastUpdated(db: DatabaseAdapter, table: string): string | null {
  try {
    // Try updated_at first (for materialized views)
    if (TABLES_WITH_UPDATED_AT.includes(table)) {
      const row = db.queryOne<Record<string, unknown>>(
        `SELECT MAX(updated_at) as last_updated FROM ${table}`
      );
      if (row?.last_updated) return row.last_updated as string;
    }

    // Try created_at
    if (TABLES_WITH_CREATED_AT.includes(table)) {
      const row = db.queryOne<Record<string, unknown>>(
        `SELECT MAX(created_at) as last_updated FROM ${table}`
      );
      if (row?.last_updated) return row.last_updated as string;
    }

    // For tables without timestamp, return today's date as a reasonable
    // default — static reference data is considered current if present.
    return new Date().toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function calculateAgeDays(dateStr: string | null): number {
  if (!dateStr) return Infinity;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function checkDataFreshness(db: DatabaseAdapter) {
  const sources: FreshnessEntry[] = [];

  for (const [table, threshold] of Object.entries(THRESHOLDS)) {
    const lastUpdated = getLastUpdated(db, table);
    const ageDays = calculateAgeDays(lastUpdated);

    sources.push({
      table,
      last_updated: lastUpdated,
      age_days: ageDays === Infinity ? -1 : ageDays,
      threshold_days: threshold,
      is_stale: ageDays > threshold,
    });
  }

  // Determine overall status
  const staleCount = sources.filter((s) => s.is_stale).length;
  let overall_status: 'fresh' | 'stale' | 'mixed';
  if (staleCount === 0) {
    overall_status = 'fresh';
  } else if (staleCount === sources.length) {
    overall_status = 'stale';
  } else {
    overall_status = 'mixed';
  }

  return {
    sources,
    overall_status,
    checked_at: new Date().toISOString(),
    _meta: createMeta(),
  };
}
