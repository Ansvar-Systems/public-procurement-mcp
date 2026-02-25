#!/usr/bin/env tsx
/**
 * Ingest EU procurement directives and national laws into SQLite.
 *
 * Reads data/census.json and for each source:
 * - EU directives: fetches from EUR-Lex
 * - Swiss laws: fetches from Fedlex
 * - Austrian laws: fetches from RIS
 * - German laws: fetches from gesetze-im-internet.de
 *
 * Inserts into `directives` + `provisions` tables.
 * Idempotent: uses INSERT OR REPLACE to avoid duplicates.
 *
 * Usage: npm run ingest:legal
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createAdapter, getDefaultDbPath } from '../src/database/adapter.js';
import { fetchAndParseDirective, parseEurLexHtml } from './lib/eurlex-parser.js';
import { fetchSwissLaw } from './ingest-swiss.js';
import { fetchAustrianLaw } from './ingest-austrian.js';
import { fetchGermanLaw } from './ingest-german.js';
import type { ParsedArticle } from './lib/html-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface EuCensusEntry {
  celex: string;
  title: string;
  short_title: string;
  jurisdiction: string;
  type: string;
  source: string;
}

interface NationalCensusEntry {
  id: string;
  title: string;
  short_title: string;
  jurisdiction: string;
  type: string;
  source: string;
}

interface Census {
  eu: EuCensusEntry[];
  ch: NationalCensusEntry[];
  at: NationalCensusEntry[];
  de: NationalCensusEntry[];
}

/**
 * Load census.json.
 */
export function loadCensus(): Census {
  const censusPath = join(__dirname, '..', 'data', 'census.json');
  const raw = readFileSync(censusPath, 'utf-8');
  return JSON.parse(raw) as Census;
}

/**
 * Insert or replace a directive in the database.
 * Returns the directive ID.
 */
export function upsertDirective(
  db: Awaited<ReturnType<typeof createAdapter>>,
  entry: {
    title: string;
    short_title: string;
    jurisdiction: string;
    type: string;
    celex_number?: string | null;
    effective_date?: string | null;
    source_url?: string | null;
  }
): number {
  // Check if already exists by title or celex
  let existing: { id: number } | undefined;

  if (entry.celex_number) {
    existing = db.queryOne<{ id: number }>(
      'SELECT id FROM directives WHERE celex_number = ?',
      [entry.celex_number]
    );
  }

  if (!existing) {
    existing = db.queryOne<{ id: number }>(
      'SELECT id FROM directives WHERE short_title = ? AND jurisdiction = ?',
      [entry.short_title, entry.jurisdiction]
    );
  }

  if (existing) {
    // Update existing
    db.execute(
      `UPDATE directives SET title = ?, effective_date = COALESCE(?, effective_date),
       source_url = COALESCE(?, source_url) WHERE id = ?`,
      [entry.title, entry.effective_date ?? null, entry.source_url ?? null, existing.id]
    );
    return existing.id;
  }

  // Insert new
  db.execute(
    `INSERT INTO directives (title, short_title, jurisdiction, type, celex_number, effective_date, source_url)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.title,
      entry.short_title,
      entry.jurisdiction,
      entry.type,
      entry.celex_number ?? null,
      entry.effective_date ?? null,
      entry.source_url ?? null,
    ]
  );

  const row = db.queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
  return row!.id;
}

/**
 * Insert provisions for a directive (idempotent via INSERT OR REPLACE).
 */
export function upsertProvisions(
  db: Awaited<ReturnType<typeof createAdapter>>,
  directiveId: number,
  articles: ParsedArticle[]
): number {
  let count = 0;

  for (const article of articles) {
    const searchText = [article.article_number, article.title, article.body]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    db.execute(
      `INSERT OR REPLACE INTO provisions (directive_id, article_number, title, body, search_text)
       VALUES (?, ?, ?, ?, ?)`,
      [directiveId, article.article_number, article.title || null, article.body, searchText]
    );
    count++;
  }

  return count;
}

/**
 * Rebuild FTS5 index after bulk inserts.
 */
export function rebuildFts(db: Awaited<ReturnType<typeof createAdapter>>): void {
  // Ensure triggers exist
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS provisions_ai AFTER INSERT ON provisions BEGIN
      INSERT INTO provisions_fts(rowid, article_number, title, body, search_text)
      VALUES (new.id, new.article_number, new.title, new.body, new.search_text);
    END;
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS provisions_ad AFTER DELETE ON provisions BEGIN
      INSERT INTO provisions_fts(provisions_fts, rowid, article_number, title, body, search_text)
      VALUES ('delete', old.id, old.article_number, old.title, old.body, old.search_text);
    END;
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS provisions_au AFTER UPDATE ON provisions BEGIN
      INSERT INTO provisions_fts(provisions_fts, rowid, article_number, title, body, search_text)
      VALUES ('delete', old.id, old.article_number, old.title, old.body, old.search_text);
      INSERT INTO provisions_fts(rowid, article_number, title, body, search_text)
      VALUES (new.id, new.article_number, new.title, new.body, new.search_text);
    END;
  `);

  // Rebuild the FTS index from scratch
  db.exec("INSERT INTO provisions_fts(provisions_fts) VALUES ('rebuild')");
}

/**
 * Main ingestion orchestrator.
 */
async function main(): Promise<void> {
  const dbPath = getDefaultDbPath();
  console.log(`[ingest-legal] Database: ${dbPath}`);

  const db = await createAdapter(dbPath, { runSchema: true });

  try {
    const census = loadCensus();
    let totalProvisions = 0;
    let totalDirectives = 0;

    // ── EU directives ─────────────────────────────────────────────
    console.log(`\n[EU] Ingesting ${census.eu.length} directives from EUR-Lex...`);
    for (const entry of census.eu) {
      try {
        console.log(`  Fetching ${entry.short_title} (${entry.celex})...`);
        const result = await fetchAndParseDirective(entry.celex);

        const directiveId = upsertDirective(db, {
          title: result.title || entry.title,
          short_title: entry.short_title,
          jurisdiction: entry.jurisdiction,
          type: entry.type,
          celex_number: entry.celex,
          effective_date: result.effective_date,
          source_url: result.source_url,
        });

        const count = upsertProvisions(db, directiveId, result.articles);
        totalProvisions += count;
        totalDirectives++;
        console.log(`  -> ${count} articles ingested (directive id: ${directiveId})`);
      } catch (err) {
        console.error(`  ERROR ingesting ${entry.short_title}: ${err instanceof Error ? err.message : err}`);
      }
    }

    // ── Swiss laws ────────────────────────────────────────────────
    console.log(`\n[CH] Ingesting ${census.ch.length} Swiss laws from Fedlex...`);
    for (const entry of census.ch) {
      try {
        console.log(`  Fetching ${entry.short_title} (${entry.id})...`);
        const result = await fetchSwissLaw(entry.id);

        const directiveId = upsertDirective(db, {
          title: result.title || entry.title,
          short_title: entry.short_title,
          jurisdiction: entry.jurisdiction,
          type: entry.type,
          effective_date: result.effective_date,
          source_url: result.source_url,
        });

        const count = upsertProvisions(db, directiveId, result.articles);
        totalProvisions += count;
        totalDirectives++;
        console.log(`  -> ${count} articles ingested (directive id: ${directiveId})`);
      } catch (err) {
        console.error(`  ERROR ingesting ${entry.short_title}: ${err instanceof Error ? err.message : err}`);
      }
    }

    // ── Austrian laws ─────────────────────────────────────────────
    console.log(`\n[AT] Ingesting ${census.at.length} Austrian laws from RIS...`);
    for (const entry of census.at) {
      try {
        console.log(`  Fetching ${entry.short_title} (${entry.id})...`);
        const result = await fetchAustrianLaw(entry.id);

        const directiveId = upsertDirective(db, {
          title: result.title || entry.title,
          short_title: entry.short_title,
          jurisdiction: entry.jurisdiction,
          type: entry.type,
          effective_date: result.effective_date,
          source_url: result.source_url,
        });

        const count = upsertProvisions(db, directiveId, result.articles);
        totalProvisions += count;
        totalDirectives++;
        console.log(`  -> ${count} articles ingested (directive id: ${directiveId})`);
      } catch (err) {
        console.error(`  ERROR ingesting ${entry.short_title}: ${err instanceof Error ? err.message : err}`);
      }
    }

    // ── German laws ───────────────────────────────────────────────
    console.log(`\n[DE] Ingesting ${census.de.length} German laws from gesetze-im-internet.de...`);
    for (const entry of census.de) {
      try {
        console.log(`  Fetching ${entry.short_title} (${entry.id})...`);
        const result = await fetchGermanLaw(entry.id);

        const directiveId = upsertDirective(db, {
          title: result.title || entry.title,
          short_title: entry.short_title,
          jurisdiction: entry.jurisdiction,
          type: entry.type,
          effective_date: result.effective_date,
          source_url: result.source_url,
        });

        const count = upsertProvisions(db, directiveId, result.articles);
        totalProvisions += count;
        totalDirectives++;
        console.log(`  -> ${count} articles ingested (directive id: ${directiveId})`);
      } catch (err) {
        console.error(`  ERROR ingesting ${entry.short_title}: ${err instanceof Error ? err.message : err}`);
      }
    }

    // ── Rebuild FTS ───────────────────────────────────────────────
    console.log('\n[FTS] Rebuilding full-text search index...');
    rebuildFts(db);

    console.log(`\n=== Ingestion complete ===`);
    console.log(`Ingested ${totalProvisions} provisions from ${totalDirectives} directives`);
  } finally {
    db.close();
  }
}

// Run if executed directly (not when imported for testing)
const isDirectRun = process.argv[1]?.includes('ingest-legal');
if (isDirectRun) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
