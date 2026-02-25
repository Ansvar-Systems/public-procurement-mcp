#!/usr/bin/env tsx
/**
 * Rebuild buyer_profiles and cpv_benchmarks materialized views.
 *
 * These tables aggregate award data from the notices table to power
 * the get_buyer_profile and get_price_benchmark tools. They should be
 * rebuilt after each TED ingestion run.
 *
 * Usage: npm run ingest:views
 */

import { createAdapter, getDefaultDbPath } from '../src/database/adapter.js';
import type { DatabaseAdapter } from '../src/database/adapter.js';

/**
 * Rebuild the buyer_profiles materialized view.
 *
 * Aggregates contract award notices by buyer to produce:
 * - Total awards count
 * - Average and median award values in EUR
 * - Most-used procedure type and award criteria
 * - Average number of bidders
 * - Date range of activity
 * - Top CPV codes used
 */
export function rebuildBuyerProfiles(db: DatabaseAdapter): number {
  db.execute('DELETE FROM buyer_profiles');

  // Use a subquery to compute the mode for procedure and criteria
  // SQLite doesn't have MODE(), so we use GROUP BY + ORDER BY + LIMIT 1
  db.exec(`
    INSERT INTO buyer_profiles (
      buyer_id, buyer_name, buyer_nuts,
      total_awards, avg_value_eur, median_value_eur,
      preferred_procedure, preferred_criteria,
      avg_bidders, first_seen, last_seen, top_cpv_codes
    )
    SELECT
      n.buyer_id,
      MAX(n.buyer_name) AS buyer_name,
      MAX(n.buyer_nuts) AS buyer_nuts,
      COUNT(*) AS total_awards,
      ROUND(AVG(n.value_awarded), 2) AS avg_value_eur,
      ROUND(AVG(n.value_awarded), 2) AS median_value_eur,
      (
        SELECT p.procedure_type
        FROM notices p
        WHERE p.buyer_id = n.buyer_id
          AND p.notice_type = 'contract_award'
          AND p.procedure_type IS NOT NULL
        GROUP BY p.procedure_type
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) AS preferred_procedure,
      (
        SELECT c.award_criteria_type
        FROM notices c
        WHERE c.buyer_id = n.buyer_id
          AND c.notice_type = 'contract_award'
          AND c.award_criteria_type IS NOT NULL
        GROUP BY c.award_criteria_type
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) AS preferred_criteria,
      ROUND(AVG(n.num_tenders_received), 1) AS avg_bidders,
      MIN(n.publication_date) AS first_seen,
      MAX(n.publication_date) AS last_seen,
      (
        SELECT GROUP_CONCAT(DISTINCT cpv_sub.cpv_main)
        FROM (
          SELECT cpv_inner.cpv_main
          FROM notices cpv_inner
          WHERE cpv_inner.buyer_id = n.buyer_id
            AND cpv_inner.notice_type = 'contract_award'
            AND cpv_inner.cpv_main IS NOT NULL
          GROUP BY cpv_inner.cpv_main
          ORDER BY COUNT(*) DESC
          LIMIT 5
        ) cpv_sub
      ) AS top_cpv_codes
    FROM notices n
    WHERE n.notice_type = 'contract_award'
      AND n.buyer_id IS NOT NULL
    GROUP BY n.buyer_id
  `);

  const row = db.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM buyer_profiles');
  return row?.cnt ?? 0;
}

/**
 * Rebuild the cpv_benchmarks materialized view.
 *
 * Aggregates contract award notices by CPV code, country (NUTS level 0),
 * and year to produce:
 * - Award count
 * - 25th, 50th (median), and 75th percentile values
 * - Average number of bidders
 * - Top winners by award count
 *
 * Uses a two-step approach because SQLite does not support aggregate
 * functions in OFFSET clauses of correlated subqueries.
 */
export function rebuildCpvBenchmarks(db: DatabaseAdapter): number {
  db.execute('DELETE FROM cpv_benchmarks');

  // Step 1: Get all groups with basic aggregates
  interface GroupRow {
    cpv_main: string;
    nuts_country: string;
    year: number;
    award_count: number;
    avg_bidders: number | null;
  }

  const groups = db.query<GroupRow>(`
    SELECT
      cpv_main,
      SUBSTR(buyer_nuts, 1, 2) AS nuts_country,
      CAST(STRFTIME('%Y', publication_date) AS INTEGER) AS year,
      COUNT(*) AS award_count,
      ROUND(AVG(num_tenders_received), 1) AS avg_bidders
    FROM notices
    WHERE notice_type = 'contract_award'
      AND cpv_main IS NOT NULL
      AND value_awarded IS NOT NULL
      AND buyer_nuts IS NOT NULL
    GROUP BY cpv_main, SUBSTR(buyer_nuts, 1, 2), STRFTIME('%Y', publication_date)
  `);

  // Step 2: For each group, compute percentiles and top winners
  for (const g of groups) {
    const p25Offset = Math.max(0, Math.floor(g.award_count * 0.25) - 1);
    const medianOffset = Math.max(0, Math.floor(g.award_count * 0.5) - 1);
    const p75Offset = Math.max(0, Math.floor(g.award_count * 0.75) - 1);

    const p25Row = db.queryOne<{ value_awarded: number }>(`
      SELECT value_awarded FROM notices
      WHERE cpv_main = ? AND SUBSTR(buyer_nuts, 1, 2) = ?
        AND STRFTIME('%Y', publication_date) = ?
        AND notice_type = 'contract_award' AND value_awarded IS NOT NULL
      ORDER BY value_awarded
      LIMIT 1 OFFSET ?
    `, [g.cpv_main, g.nuts_country, String(g.year), p25Offset]);

    const medianRow = db.queryOne<{ value_awarded: number }>(`
      SELECT value_awarded FROM notices
      WHERE cpv_main = ? AND SUBSTR(buyer_nuts, 1, 2) = ?
        AND STRFTIME('%Y', publication_date) = ?
        AND notice_type = 'contract_award' AND value_awarded IS NOT NULL
      ORDER BY value_awarded
      LIMIT 1 OFFSET ?
    `, [g.cpv_main, g.nuts_country, String(g.year), medianOffset]);

    const p75Row = db.queryOne<{ value_awarded: number }>(`
      SELECT value_awarded FROM notices
      WHERE cpv_main = ? AND SUBSTR(buyer_nuts, 1, 2) = ?
        AND STRFTIME('%Y', publication_date) = ?
        AND notice_type = 'contract_award' AND value_awarded IS NOT NULL
      ORDER BY value_awarded
      LIMIT 1 OFFSET ?
    `, [g.cpv_main, g.nuts_country, String(g.year), p75Offset]);

    interface WinnerRow { winner_name: string }
    const topWinners = db.query<WinnerRow>(`
      SELECT winner_name FROM notices
      WHERE cpv_main = ? AND SUBSTR(buyer_nuts, 1, 2) = ?
        AND STRFTIME('%Y', publication_date) = ?
        AND notice_type = 'contract_award' AND winner_name IS NOT NULL
      GROUP BY winner_name
      ORDER BY COUNT(*) DESC
      LIMIT 3
    `, [g.cpv_main, g.nuts_country, String(g.year)]);

    const topWinnersStr = topWinners.map((w) => w.winner_name).join(', ') || null;

    db.execute(`
      INSERT INTO cpv_benchmarks (
        cpv_main, nuts_country, year,
        award_count, p25_value, median_value, p75_value,
        avg_bidders, top_winners
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      g.cpv_main,
      g.nuts_country,
      g.year,
      g.award_count,
      p25Row?.value_awarded ?? null,
      medianRow?.value_awarded ?? null,
      p75Row?.value_awarded ?? null,
      g.avg_bidders,
      topWinnersStr,
    ]);
  }

  const row = db.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM cpv_benchmarks');
  return row?.cnt ?? 0;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dbPath = getDefaultDbPath();
  console.log(`[rebuild-views] Database: ${dbPath}`);

  const db = await createAdapter(dbPath, { runSchema: true });

  try {
    console.log('\n[Views] Rebuilding buyer_profiles...');
    const buyerCount = rebuildBuyerProfiles(db);
    console.log(`  -> ${buyerCount} buyer profiles created`);

    console.log('\n[Views] Rebuilding cpv_benchmarks...');
    const benchmarkCount = rebuildCpvBenchmarks(db);
    console.log(`  -> ${benchmarkCount} CPV benchmarks created`);

    console.log('\n=== View rebuild complete ===');
    console.log(`  ${buyerCount} buyer profiles, ${benchmarkCount} CPV benchmarks`);
  } finally {
    db.close();
  }
}

// Run if executed directly (not when imported for testing)
const isDirectRun = process.argv[1]?.includes('rebuild-views');
if (isDirectRun) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
