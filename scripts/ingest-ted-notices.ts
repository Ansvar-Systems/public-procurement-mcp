#!/usr/bin/env tsx
/**
 * Ingest TED award notices into SQLite.
 *
 * Fetches notices from the TED public search API and inserts them
 * into the `notices` table. Supports date-range backfill and daily
 * incremental updates.
 *
 * Usage:
 *   npm run ingest:ted                                        # yesterday's notices
 *   npm run ingest:ted -- --from 2024-01-01 --to 2024-12-31   # backfill
 *   npm run ingest:ted -- --from 2024-06-01                   # from date to yesterday
 */

import { createAdapter, getDefaultDbPath } from '../src/database/adapter.js';
import type { DatabaseAdapter } from '../src/database/adapter.js';
import { TedApiClient } from './lib/ted-api.js';
import { parseNotice } from './lib/ted-parser.js';
import type { ParsedNotice } from './lib/ted-parser.js';
import type { TedRawNotice } from './lib/ted-api.js';

// ── CLI argument parsing ────────────────────────────────────────────────────

interface CliArgs {
  from: string;
  to: string;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  let from: string | undefined;
  let to: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) {
      from = args[i + 1];
      i++;
    } else if (args[i] === '--to' && args[i + 1]) {
      to = args[i + 1];
      i++;
    }
  }

  // Default: yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  return {
    from: from || yesterdayStr,
    to: to || yesterdayStr,
  };
}

// ── Upsert logic ────────────────────────────────────────────────────────────

/**
 * Upsert a parsed notice into the notices table.
 * Uses INSERT OR REPLACE keyed on ted_id (UNIQUE constraint).
 */
export function upsertNotice(db: DatabaseAdapter, notice: ParsedNotice): void {
  db.execute(
    `INSERT OR REPLACE INTO notices (
      ted_id, notice_type, publication_date,
      buyer_id, buyer_name, buyer_nuts,
      cpv_main, cpv_additional,
      title, description,
      procedure_type,
      value_estimated, value_awarded, currency,
      winner_name, winner_country,
      num_tenders_received, award_criteria_type,
      contract_duration_months, framework_agreement,
      original_language, deadline
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      notice.ted_id,
      notice.notice_type,
      notice.publication_date,
      notice.buyer_id,
      notice.buyer_name,
      notice.buyer_nuts,
      notice.cpv_main,
      notice.cpv_additional,
      notice.title,
      notice.description,
      notice.procedure_type,
      notice.value_estimated,
      notice.value_awarded,
      notice.currency,
      notice.winner_name,
      notice.winner_country,
      notice.num_tenders_received,
      notice.award_criteria_type,
      notice.contract_duration_months,
      notice.framework_agreement,
      notice.original_language,
      notice.deadline,
    ]
  );
}

/**
 * Process a batch of raw TED notices: parse and upsert each one.
 * Returns the total number of rows inserted/replaced.
 */
export function processBatch(
  db: DatabaseAdapter,
  rawNotices: TedRawNotice[]
): number {
  let count = 0;

  for (const raw of rawNotices) {
    const parsed = parseNotice(raw as Record<string, unknown>);
    for (const notice of parsed) {
      upsertNotice(db, notice);
      count++;
    }
  }

  return count;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { from, to } = parseCliArgs(process.argv);

  const dbPath = getDefaultDbPath();
  console.log(`[ingest-ted] Database: ${dbPath}`);
  console.log(`[ingest-ted] Date range: ${from} to ${to}`);

  const db = await createAdapter(dbPath, { runSchema: true });

  try {
    const client = new TedApiClient();
    let totalInserted = 0;

    // Fetch all notice types
    const noticeTypes = ['CN', 'CAN', 'PIN', 'CORR'];

    console.log(`\n[TED] Fetching notices (types: ${noticeTypes.join(', ')})...`);

    const rawNotices = await client.searchAll({
      noticeType: noticeTypes,
      publicationDateFrom: from,
      publicationDateTo: to,
      pageSize: 100,
    });

    console.log(`  -> ${rawNotices.length} raw notices fetched`);

    // Process in batches for progress reporting
    const BATCH_SIZE = 1000;
    for (let i = 0; i < rawNotices.length; i += BATCH_SIZE) {
      const batch = rawNotices.slice(i, i + BATCH_SIZE);
      const batchCount = processBatch(db, batch);
      totalInserted += batchCount;

      if (rawNotices.length > BATCH_SIZE) {
        console.log(
          `  -> Processed ${Math.min(i + BATCH_SIZE, rawNotices.length)}/${rawNotices.length} notices (${totalInserted} rows)`
        );
      }
    }

    console.log(`\n=== TED ingestion complete ===`);
    console.log(
      `Ingested ${totalInserted} notice rows for date range ${from} to ${to}`
    );
    console.log(`API requests made: ${client.totalRequests}`);
  } finally {
    db.close();
  }
}

// Run if executed directly (not when imported for testing)
const isDirectRun = process.argv[1]?.includes('ingest-ted-notices');
if (isDirectRun) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
