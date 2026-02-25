#!/usr/bin/env tsx
/**
 * Report data freshness per source.
 *
 * Checks the most recent data in each table and reports staleness.
 * Exits with code 1 if any source exceeds its freshness threshold.
 *
 * Thresholds:
 * - TED notices: 2 days (daily ingestion expected)
 * - Legal content: 90 days (quarterly updates acceptable)
 *
 * Usage: npm run check-freshness
 */

import { createAdapter, getDefaultDbPath } from '../src/database/adapter.js';
import type { DatabaseAdapter } from '../src/database/adapter.js';

export interface FreshnessResult {
  source: string;
  latestDate: string | null;
  daysSinceUpdate: number | null;
  threshold: number;
  isFresh: boolean;
}

/**
 * Check freshness of all data sources.
 * Returns an array of freshness results.
 */
export function checkFreshness(db: DatabaseAdapter): FreshnessResult[] {
  const results: FreshnessResult[] = [];
  const now = new Date();

  // TED notices freshness
  const tedRow = db.queryOne<{ max_date: string | null }>(
    "SELECT MAX(publication_date) AS max_date FROM notices"
  );
  const tedDate = tedRow?.max_date ?? null;
  const tedDays = tedDate ? daysBetween(new Date(tedDate), now) : null;

  results.push({
    source: 'TED notices',
    latestDate: tedDate,
    daysSinceUpdate: tedDays,
    threshold: 2,
    isFresh: tedDays !== null && tedDays <= 2,
  });

  // Legal content freshness
  const legalRow = db.queryOne<{ max_date: string | null }>(
    "SELECT MAX(created_at) AS max_date FROM directives"
  );
  const legalDate = legalRow?.max_date ?? null;
  const legalDays = legalDate ? daysBetween(new Date(legalDate), now) : null;

  results.push({
    source: 'Legal content',
    latestDate: legalDate,
    daysSinceUpdate: legalDays,
    threshold: 90,
    isFresh: legalDays !== null && legalDays <= 90,
  });

  // Buyer profiles freshness (rebuilt after TED ingestion)
  const buyerRow = db.queryOne<{ max_date: string | null }>(
    "SELECT MAX(updated_at) AS max_date FROM buyer_profiles"
  );
  const buyerDate = buyerRow?.max_date ?? null;
  const buyerDays = buyerDate ? daysBetween(new Date(buyerDate), now) : null;

  results.push({
    source: 'Buyer profiles',
    latestDate: buyerDate,
    daysSinceUpdate: buyerDays,
    threshold: 3,
    isFresh: buyerDays !== null && buyerDays <= 3,
  });

  return results;
}

/**
 * Calculate the number of days between two dates.
 */
export function daysBetween(from: Date, to: Date): number {
  const diffMs = to.getTime() - from.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Format a freshness report for console output.
 */
export function formatReport(results: FreshnessResult[]): string {
  const lines: string[] = ['=== Data Freshness Report ===', ''];

  for (const r of results) {
    const status = r.isFresh ? 'FRESH' : 'STALE';
    const icon = r.isFresh ? '[OK]' : '[!!]';
    const days =
      r.daysSinceUpdate !== null ? `${r.daysSinceUpdate} days ago` : 'NO DATA';
    const date = r.latestDate || 'N/A';

    lines.push(
      `${icon} ${r.source}: ${status} (latest: ${date}, ${days}, threshold: ${r.threshold} days)`
    );
  }

  lines.push('');

  const stale = results.filter((r) => !r.isFresh);
  if (stale.length > 0) {
    lines.push(`WARNING: ${stale.length} source(s) are stale!`);
    for (const s of stale) {
      lines.push(`  - ${s.source}: ${s.daysSinceUpdate ?? 'no data'} days (max: ${s.threshold})`);
    }
  } else {
    lines.push('All sources are within freshness thresholds.');
  }

  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dbPath = getDefaultDbPath();
  console.log(`[check-freshness] Database: ${dbPath}`);

  const db = await createAdapter(dbPath, { runSchema: true, readonly: false });

  try {
    const results = checkFreshness(db);
    console.log('\n' + formatReport(results));

    // Exit with error if any source is stale
    const hasStale = results.some((r) => !r.isFresh);
    if (hasStale) {
      process.exit(1);
    }
  } finally {
    db.close();
  }
}

// Run if executed directly (not when imported for testing)
const isDirectRun = process.argv[1]?.includes('check-freshness');
if (isDirectRun) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
