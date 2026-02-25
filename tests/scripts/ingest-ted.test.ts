/**
 * Tests for the TED notice ingestion pipeline.
 *
 * All tests run without network access — they use fixture data
 * and in-memory SQLite databases.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { normalizeNoticeType, convertToEur, parseNotice, EUR_RATES } from '../../scripts/lib/ted-parser.js';
import { buildSearchQuery } from '../../scripts/lib/ted-api.js';
import { upsertNotice, processBatch, parseCliArgs } from '../../scripts/ingest-ted-notices.js';
import { rebuildBuyerProfiles, rebuildCpvBenchmarks } from '../../scripts/rebuild-views.js';
import { checkFreshness, daysBetween, formatReport } from '../../scripts/check-freshness.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';
import type { ParsedNotice } from '../../scripts/lib/ted-parser.js';

// ── Test DB helper ──────────────────────────────────────────────────────────

async function createInMemoryDb(): Promise<DatabaseAdapter> {
  const sqliteModule = await import('node-sqlite3-wasm');
  const Database = sqliteModule.Database;
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE directives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      short_title TEXT,
      jurisdiction TEXT NOT NULL,
      type TEXT NOT NULL,
      celex_number TEXT,
      effective_date TEXT,
      source_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ted_id TEXT UNIQUE NOT NULL,
      notice_type TEXT NOT NULL,
      publication_date TEXT NOT NULL,
      buyer_id TEXT,
      buyer_name TEXT,
      buyer_nuts TEXT,
      cpv_main TEXT,
      cpv_additional TEXT,
      title TEXT,
      description TEXT,
      procedure_type TEXT,
      value_estimated REAL,
      value_awarded REAL,
      currency TEXT DEFAULT 'EUR',
      winner_name TEXT,
      winner_country TEXT,
      num_tenders_received INTEGER,
      award_criteria_type TEXT,
      contract_duration_months INTEGER,
      framework_agreement INTEGER DEFAULT 0,
      original_language TEXT,
      deadline TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_notices_cpv ON notices(cpv_main);
    CREATE INDEX idx_notices_buyer ON notices(buyer_id);
    CREATE INDEX idx_notices_winner ON notices(winner_name);
    CREATE INDEX idx_notices_date ON notices(publication_date);
    CREATE INDEX idx_notices_type ON notices(notice_type);
    CREATE INDEX idx_notices_nuts ON notices(buyer_nuts);

    CREATE TABLE buyer_profiles (
      buyer_id TEXT PRIMARY KEY,
      buyer_name TEXT,
      buyer_nuts TEXT,
      total_awards INTEGER,
      avg_value_eur REAL,
      median_value_eur REAL,
      preferred_procedure TEXT,
      preferred_criteria TEXT,
      avg_bidders REAL,
      first_seen TEXT,
      last_seen TEXT,
      top_cpv_codes TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE cpv_benchmarks (
      cpv_main TEXT,
      nuts_country TEXT,
      year INTEGER,
      award_count INTEGER,
      p25_value REAL,
      median_value REAL,
      p75_value REAL,
      avg_bidders REAL,
      top_winners TEXT,
      PRIMARY KEY (cpv_main, nuts_country, year)
    );
  `);

  return {
    query<T>(sql: string, params?: unknown[]): T[] {
      try {
        return db.all(sql, params) as T[];
      } catch (error) {
        throw new Error(`Query failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    queryOne<T>(sql: string, params?: unknown[]): T | undefined {
      try {
        const result = db.get(sql, params);
        return (result ?? undefined) as T | undefined;
      } catch (error) {
        throw new Error(`Query failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    execute(sql: string, params?: unknown[]): { changes: number } {
      try {
        const result = db.run(sql, params);
        return { changes: result.changes };
      } catch (error) {
        throw new Error(`Execute failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    exec(sql: string): void {
      db.exec(sql);
    },
    close(): void {
      db.close();
    },
  };
}

// ── Fixtures ────────────────────────────────────────────────────────────────

function createBasicNoticeFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    'notice-id': 'TED-2024-123456',
    'notice-type': 'CAN',
    'publication-date': '2024-06-15',
    'buyer-id': 'BUYER-001',
    'buyer-name': 'Stadt München',
    'buyer-nuts-code': 'DE212',
    'cpv-code': '72000000',
    'title-text': 'IT Services Contract',
    'description-text': 'Provision of IT maintenance and support services',
    'procedure-type': 'Open procedure',
    'value-estimated': 500000,
    'value-awarded': 450000,
    'currency': 'EUR',
    'winner-name': 'TechCorp GmbH',
    'winner-country': 'DE',
    'number-tenders-received': 5,
    'award-criteria-type': 'best-price-quality-ratio',
    'contract-duration-months': 36,
    'framework-agreement': false,
    'original-language': 'DE',
    'deadline': '2024-05-01',
    ...overrides,
  };
}

function createMultiLotFixture(): Record<string, unknown> {
  return {
    'notice-id': 'TED-2024-MULTI',
    'notice-type': 'CAN',
    'publication-date': '2024-07-01',
    'buyer-id': 'BUYER-002',
    'buyer-name': 'Bundesamt für Informatik',
    'buyer-nuts-code': 'CH01',
    'procedure-type': 'Selective procedure',
    'currency': 'CHF',
    'original-language': 'DE',
    lots: [
      {
        'cpv-code': '72200000',
        'title': 'Lot 1: Software Development',
        'value-awarded': 200000,
        'winner-name': 'SwissDev AG',
        'winner-country': 'CH',
        'number-tenders-received': 3,
        'award-criteria-type': 'best-price-quality-ratio',
      },
      {
        'cpv-code': '72300000',
        'title': 'Lot 2: Data Processing',
        'value-awarded': 150000,
        'winner-name': 'DataProc SA',
        'winner-country': 'CH',
        'number-tenders-received': 4,
        'award-criteria-type': 'lowest-price',
      },
      {
        'cpv-code': '72400000',
        'title': 'Lot 3: Internet Services',
        'value-awarded': 80000,
        'winner-name': 'NetService GmbH',
        'winner-country': 'DE',
        'number-tenders-received': 2,
        'award-criteria-type': 'best-price-quality-ratio',
      },
    ],
  };
}

// ── normalizeNoticeType tests ───────────────────────────────────────────────

describe('normalizeNoticeType', () => {
  it('should normalize legacy TED codes', () => {
    expect(normalizeNoticeType('CN')).toBe('contract_notice');
    expect(normalizeNoticeType('CAN')).toBe('contract_award');
    expect(normalizeNoticeType('PIN')).toBe('prior_information');
    expect(normalizeNoticeType('CORR')).toBe('modification');
  });

  it('should normalize case-insensitively', () => {
    expect(normalizeNoticeType('cn')).toBe('contract_notice');
    expect(normalizeNoticeType('Can')).toBe('contract_award');
    expect(normalizeNoticeType('pin')).toBe('prior_information');
    expect(normalizeNoticeType('Corr')).toBe('modification');
  });

  it('should normalize eForms subtypes', () => {
    expect(normalizeNoticeType('planning')).toBe('prior_information');
    expect(normalizeNoticeType('competition')).toBe('contract_notice');
    expect(normalizeNoticeType('result')).toBe('contract_award');
    expect(normalizeNoticeType('change')).toBe('modification');
  });

  it('should normalize numeric codes', () => {
    expect(normalizeNoticeType('1')).toBe('prior_information');
    expect(normalizeNoticeType('2')).toBe('contract_notice');
    expect(normalizeNoticeType('3')).toBe('contract_award');
  });

  it('should pass through already-normalized types', () => {
    expect(normalizeNoticeType('contract_notice')).toBe('contract_notice');
    expect(normalizeNoticeType('contract_award')).toBe('contract_award');
    expect(normalizeNoticeType('prior_information')).toBe('prior_information');
    expect(normalizeNoticeType('modification')).toBe('modification');
  });

  it('should handle space-separated type names', () => {
    expect(normalizeNoticeType('contract notice')).toBe('contract_notice');
    expect(normalizeNoticeType('contract award')).toBe('contract_award');
    expect(normalizeNoticeType('prior information notice')).toBe('prior_information');
  });

  it('should return lowercased input for unknown codes', () => {
    expect(normalizeNoticeType('UNKNOWN_TYPE')).toBe('unknown_type');
    expect(normalizeNoticeType('SomeOtherType')).toBe('someothertype');
  });

  it('should trim whitespace', () => {
    expect(normalizeNoticeType('  CN  ')).toBe('contract_notice');
    expect(normalizeNoticeType(' CAN ')).toBe('contract_award');
  });
});

// ── convertToEur tests ──────────────────────────────────────────────────────

describe('convertToEur', () => {
  it('should return EUR values unchanged', () => {
    expect(convertToEur(100000, 'EUR')).toBe(100000);
    expect(convertToEur(0, 'EUR')).toBe(0);
  });

  it('should convert GBP to EUR', () => {
    // GBP rate: 0.86 → 100 GBP = 100/0.86 ≈ 116.28 EUR
    const result = convertToEur(100, 'GBP');
    expect(result).toBeCloseTo(116.28, 0);
    expect(result).toBeGreaterThan(100); // GBP is worth more than EUR
  });

  it('should convert SEK to EUR', () => {
    // SEK rate: 11.3 → 1000 SEK = 1000/11.3 ≈ 88.50 EUR
    const result = convertToEur(1000, 'SEK');
    expect(result).toBeCloseTo(88.50, 0);
    expect(result).toBeLessThan(1000); // SEK is worth less than EUR
  });

  it('should convert CHF to EUR', () => {
    // CHF rate: 0.95 → 1000 CHF = 1000/0.95 ≈ 1052.63 EUR
    const result = convertToEur(1000, 'CHF');
    expect(result).toBeCloseTo(1052.63, 0);
  });

  it('should convert DKK to EUR', () => {
    // DKK rate: 7.46 → 7460 DKK = 7460/7.46 = 1000 EUR
    const result = convertToEur(7460, 'DKK');
    expect(result).toBeCloseTo(1000, 0);
  });

  it('should convert PLN to EUR', () => {
    const result = convertToEur(4320, 'PLN');
    expect(result).toBeCloseTo(1000, 0);
  });

  it('should convert CZK to EUR', () => {
    const result = convertToEur(25100, 'CZK');
    expect(result).toBeCloseTo(1000, 0);
  });

  it('should convert HUF to EUR', () => {
    const result = convertToEur(395000, 'HUF');
    expect(result).toBeCloseTo(1000, 0);
  });

  it('should handle case-insensitive currency codes', () => {
    expect(convertToEur(100, 'eur')).toBe(100);
    expect(convertToEur(100, 'Eur')).toBe(100);
  });

  it('should return value as-is for unknown currencies', () => {
    expect(convertToEur(1000, 'XYZ')).toBe(1000);
    expect(convertToEur(500, 'UNKNOWN')).toBe(500);
  });

  it('should round to 2 decimal places', () => {
    const result = convertToEur(100, 'GBP');
    const decimals = result.toString().split('.')[1];
    expect(!decimals || decimals.length <= 2).toBe(true);
  });

  it('should handle zero values', () => {
    expect(convertToEur(0, 'GBP')).toBe(0);
    expect(convertToEur(0, 'SEK')).toBe(0);
  });

  it('should have rates for all common EU currencies', () => {
    const expectedCurrencies = ['EUR', 'GBP', 'SEK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'CHF', 'NOK'];
    for (const currency of expectedCurrencies) {
      expect(EUR_RATES[currency]).toBeDefined();
      expect(EUR_RATES[currency]).toBeGreaterThan(0);
    }
  });
});

// ── parseNotice tests ───────────────────────────────────────────────────────

describe('parseNotice', () => {
  it('should parse a basic contract award notice', () => {
    const raw = createBasicNoticeFixture();
    const results = parseNotice(raw);

    expect(results).toHaveLength(1);
    const notice = results[0];

    expect(notice.ted_id).toBe('TED-2024-123456');
    expect(notice.notice_type).toBe('contract_award');
    expect(notice.publication_date).toBe('2024-06-15');
    expect(notice.buyer_id).toBe('BUYER-001');
    expect(notice.buyer_name).toBe('Stadt München');
    expect(notice.buyer_nuts).toBe('DE212');
    expect(notice.cpv_main).toBe('72000000');
    expect(notice.title).toBe('IT Services Contract');
    expect(notice.description).toBe('Provision of IT maintenance and support services');
    expect(notice.procedure_type).toBe('Open procedure');
    expect(notice.value_estimated).toBe(500000);
    expect(notice.value_awarded).toBe(450000);
    expect(notice.currency).toBe('EUR');
    expect(notice.winner_name).toBe('TechCorp GmbH');
    expect(notice.winner_country).toBe('DE');
    expect(notice.num_tenders_received).toBe(5);
    expect(notice.award_criteria_type).toBe('best-price-quality-ratio');
    expect(notice.contract_duration_months).toBe(36);
    expect(notice.framework_agreement).toBe(0);
    expect(notice.original_language).toBe('DE');
    expect(notice.deadline).toBe('2024-05-01');
  });

  it('should return empty array for notice without ID', () => {
    const raw = createBasicNoticeFixture();
    delete (raw as Record<string, unknown>)['notice-id'];
    const results = parseNotice(raw);
    expect(results).toHaveLength(0);
  });

  it('should normalize notice types', () => {
    const cn = parseNotice(createBasicNoticeFixture({ 'notice-type': 'CN' }));
    expect(cn[0].notice_type).toBe('contract_notice');

    const pin = parseNotice(createBasicNoticeFixture({ 'notice-type': 'PIN' }));
    expect(pin[0].notice_type).toBe('prior_information');

    const corr = parseNotice(createBasicNoticeFixture({ 'notice-type': 'CORR' }));
    expect(corr[0].notice_type).toBe('modification');
  });

  it('should convert non-EUR values to EUR', () => {
    const raw = createBasicNoticeFixture({
      'value-awarded': 1000,
      'currency': 'GBP',
    });
    const results = parseNotice(raw);
    expect(results[0].value_awarded).toBeGreaterThan(1000); // GBP > EUR
    expect(results[0].currency).toBe('EUR'); // Normalized
  });

  it('should handle missing optional fields', () => {
    const raw: Record<string, unknown> = {
      'notice-id': 'TED-MINIMAL',
      'notice-type': 'CN',
      'publication-date': '2024-01-01',
    };
    const results = parseNotice(raw);
    expect(results).toHaveLength(1);

    const notice = results[0];
    expect(notice.ted_id).toBe('TED-MINIMAL');
    expect(notice.notice_type).toBe('contract_notice');
    expect(notice.buyer_id).toBeNull();
    expect(notice.buyer_name).toBeNull();
    expect(notice.cpv_main).toBeNull();
    expect(notice.value_awarded).toBeNull();
    expect(notice.winner_name).toBeNull();
  });

  it('should detect framework agreements', () => {
    const withFramework = parseNotice(
      createBasicNoticeFixture({ 'framework-agreement': true })
    );
    expect(withFramework[0].framework_agreement).toBe(1);

    const withoutFramework = parseNotice(
      createBasicNoticeFixture({ 'framework-agreement': false })
    );
    expect(withoutFramework[0].framework_agreement).toBe(0);
  });

  it('should handle camelCase field names', () => {
    const raw: Record<string, unknown> = {
      'noticeId': 'TED-CAMEL',
      'noticeType': 'result',
      'publicationDate': '2024-03-15',
      'buyerName': 'Camel Buyer',
      'cpvCode': '48000000',
      'valueAwarded': 100000,
    };
    const results = parseNotice(raw);
    expect(results).toHaveLength(1);
    expect(results[0].ted_id).toBe('TED-CAMEL');
    expect(results[0].notice_type).toBe('contract_award');
    expect(results[0].buyer_name).toBe('Camel Buyer');
    expect(results[0].cpv_main).toBe('48000000');
    expect(results[0].value_awarded).toBe(100000);
  });
});

// ── Multi-lot parsing tests ─────────────────────────────────────────────────

describe('parseNotice (multi-lot)', () => {
  it('should produce one row per lot', () => {
    const raw = createMultiLotFixture();
    const results = parseNotice(raw);

    expect(results).toHaveLength(3);
  });

  it('should generate unique ted_ids per lot', () => {
    const raw = createMultiLotFixture();
    const results = parseNotice(raw);

    const ids = results.map((r) => r.ted_id);
    expect(ids[0]).toBe('TED-2024-MULTI-LOT1');
    expect(ids[1]).toBe('TED-2024-MULTI-LOT2');
    expect(ids[2]).toBe('TED-2024-MULTI-LOT3');

    // All unique
    expect(new Set(ids).size).toBe(3);
  });

  it('should inherit common fields from parent notice', () => {
    const raw = createMultiLotFixture();
    const results = parseNotice(raw);

    for (const r of results) {
      expect(r.buyer_id).toBe('BUYER-002');
      expect(r.buyer_name).toBe('Bundesamt für Informatik');
      expect(r.buyer_nuts).toBe('CH01');
      expect(r.procedure_type).toBe('Selective procedure');
      expect(r.notice_type).toBe('contract_award');
      expect(r.publication_date).toBe('2024-07-01');
      expect(r.original_language).toBe('DE');
    }
  });

  it('should use lot-specific CPV codes', () => {
    const raw = createMultiLotFixture();
    const results = parseNotice(raw);

    expect(results[0].cpv_main).toBe('72200000');
    expect(results[1].cpv_main).toBe('72300000');
    expect(results[2].cpv_main).toBe('72400000');
  });

  it('should use lot-specific winners', () => {
    const raw = createMultiLotFixture();
    const results = parseNotice(raw);

    expect(results[0].winner_name).toBe('SwissDev AG');
    expect(results[1].winner_name).toBe('DataProc SA');
    expect(results[2].winner_name).toBe('NetService GmbH');
  });

  it('should convert lot values from CHF to EUR', () => {
    const raw = createMultiLotFixture();
    const results = parseNotice(raw);

    // CHF rate: 0.95, so 200000 CHF ≈ 210526.32 EUR
    expect(results[0].value_awarded).toBeGreaterThan(200000);
    expect(results[0].currency).toBe('EUR');
  });

  it('should use lot-specific tender counts', () => {
    const raw = createMultiLotFixture();
    const results = parseNotice(raw);

    expect(results[0].num_tenders_received).toBe(3);
    expect(results[1].num_tenders_received).toBe(4);
    expect(results[2].num_tenders_received).toBe(2);
  });

  it('should handle single-element lot (no suffix)', () => {
    const raw: Record<string, unknown> = {
      'notice-id': 'TED-SINGLE-LOT',
      'notice-type': 'CAN',
      'publication-date': '2024-01-01',
      'buyer-id': 'B1',
      lots: [
        {
          'cpv-code': '72000000',
          'value-awarded': 100000,
          'winner-name': 'Solo Corp',
        },
      ],
    };
    const results = parseNotice(raw);
    // With a single lot, the original ID is used (no suffix)
    expect(results).toHaveLength(1);
    expect(results[0].ted_id).toBe('TED-SINGLE-LOT');
  });
});

// ── buildSearchQuery tests ──────────────────────────────────────────────────

describe('buildSearchQuery', () => {
  it('should build date range query', () => {
    const q = buildSearchQuery({
      publicationDateFrom: '2024-01-01',
      publicationDateTo: '2024-12-31',
    });
    expect(q).toBe('PD=[2024-01-01 TO 2024-12-31]');
  });

  it('should build notice type query', () => {
    const q = buildSearchQuery({ noticeType: ['CN', 'CAN'] });
    expect(q).toBe('TD=("CN" OR "CAN")');
  });

  it('should combine multiple filters with AND', () => {
    const q = buildSearchQuery({
      publicationDateFrom: '2024-01-01',
      publicationDateTo: '2024-01-31',
      noticeType: ['CAN'],
      cpvCode: '72000000',
    });
    expect(q).toContain('PD=');
    expect(q).toContain('AND');
    expect(q).toContain('TD=');
    expect(q).toContain('PC=');
  });

  it('should return wildcard for empty params', () => {
    expect(buildSearchQuery({})).toBe('*');
  });

  it('should handle from-only date', () => {
    const q = buildSearchQuery({ publicationDateFrom: '2024-01-01' });
    expect(q).toBe('PD>=2024-01-01');
  });

  it('should handle to-only date', () => {
    const q = buildSearchQuery({ publicationDateTo: '2024-12-31' });
    expect(q).toBe('PD<=2024-12-31');
  });

  it('should handle NUTS code filter', () => {
    const q = buildSearchQuery({ nutsCode: 'DE212' });
    expect(q).toBe('NUTS="DE212"');
  });
});

// ── Database integration: deduplication ─────────────────────────────────────

describe('Notice deduplication (database)', () => {
  let db: DatabaseAdapter;

  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  afterEach(() => {
    db.close();
  });

  it('should insert a notice successfully', () => {
    const raw = createBasicNoticeFixture();
    const notices = parseNotice(raw);
    upsertNotice(db, notices[0]);

    const row = db.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM notices');
    expect(row?.cnt).toBe(1);
  });

  it('should deduplicate by ted_id', () => {
    const raw = createBasicNoticeFixture();
    const notices = parseNotice(raw);

    // Insert same notice twice
    upsertNotice(db, notices[0]);
    upsertNotice(db, notices[0]);

    const row = db.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM notices');
    expect(row?.cnt).toBe(1);
  });

  it('should update fields on re-insert (INSERT OR REPLACE)', () => {
    const raw1 = createBasicNoticeFixture();
    const notices1 = parseNotice(raw1);
    upsertNotice(db, notices1[0]);

    // Re-insert with updated value
    const raw2 = createBasicNoticeFixture({ 'value-awarded': 999999 });
    const notices2 = parseNotice(raw2);
    upsertNotice(db, notices2[0]);

    const row = db.queryOne<{ value_awarded: number }>(
      'SELECT value_awarded FROM notices WHERE ted_id = ?',
      ['TED-2024-123456']
    );
    expect(row?.value_awarded).toBe(999999);
  });

  it('should handle multiple distinct notices', () => {
    const raw1 = createBasicNoticeFixture({ 'notice-id': 'TED-A' });
    const raw2 = createBasicNoticeFixture({ 'notice-id': 'TED-B' });
    const raw3 = createBasicNoticeFixture({ 'notice-id': 'TED-C' });

    for (const raw of [raw1, raw2, raw3]) {
      const notices = parseNotice(raw);
      for (const n of notices) upsertNotice(db, n);
    }

    const row = db.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM notices');
    expect(row?.cnt).toBe(3);
  });
});

// ── processBatch tests ──────────────────────────────────────────────────────

describe('processBatch', () => {
  let db: DatabaseAdapter;

  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  afterEach(() => {
    db.close();
  });

  it('should process a batch of raw notices', () => {
    const batch = [
      createBasicNoticeFixture({ 'notice-id': 'TED-BATCH-1' }),
      createBasicNoticeFixture({ 'notice-id': 'TED-BATCH-2' }),
      createBasicNoticeFixture({ 'notice-id': 'TED-BATCH-3' }),
    ];

    const count = processBatch(db, batch);
    expect(count).toBe(3);

    const row = db.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM notices');
    expect(row?.cnt).toBe(3);
  });

  it('should handle multi-lot notices in a batch', () => {
    const batch = [
      createBasicNoticeFixture({ 'notice-id': 'TED-SINGLE' }),
      createMultiLotFixture(),
    ];

    const count = processBatch(db, batch);
    expect(count).toBe(4); // 1 single + 3 lots

    const row = db.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM notices');
    expect(row?.cnt).toBe(4);
  });

  it('should skip notices without IDs', () => {
    const batch = [
      createBasicNoticeFixture({ 'notice-id': 'TED-VALID' }),
      { 'notice-type': 'CN', 'publication-date': '2024-01-01' } as Record<string, unknown>, // No ID
    ];

    const count = processBatch(db, batch);
    expect(count).toBe(1);
  });

  it('should return 0 for empty batch', () => {
    const count = processBatch(db, []);
    expect(count).toBe(0);
  });
});

// ── Buyer profiles rebuild tests ────────────────────────────────────────────

describe('rebuildBuyerProfiles', () => {
  let db: DatabaseAdapter;

  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  afterEach(() => {
    db.close();
  });

  it('should create profiles from contract awards', () => {
    // Insert award notices for two buyers
    const notices: ParsedNotice[] = [
      {
        ted_id: 'TED-BP-1',
        notice_type: 'contract_award',
        publication_date: '2024-01-15',
        buyer_id: 'B-ALPHA',
        buyer_name: 'Alpha Corp',
        buyer_nuts: 'DE11',
        cpv_main: '72000000',
        cpv_additional: null,
        title: 'IT Services',
        description: null,
        procedure_type: 'Open procedure',
        value_estimated: null,
        value_awarded: 100000,
        currency: 'EUR',
        winner_name: 'Winner A',
        winner_country: 'DE',
        num_tenders_received: 5,
        award_criteria_type: 'best-price-quality-ratio',
        contract_duration_months: 12,
        framework_agreement: 0,
        original_language: 'DE',
        deadline: null,
      },
      {
        ted_id: 'TED-BP-2',
        notice_type: 'contract_award',
        publication_date: '2024-06-15',
        buyer_id: 'B-ALPHA',
        buyer_name: 'Alpha Corp',
        buyer_nuts: 'DE11',
        cpv_main: '48000000',
        cpv_additional: null,
        title: 'Software',
        description: null,
        procedure_type: 'Open procedure',
        value_estimated: null,
        value_awarded: 200000,
        currency: 'EUR',
        winner_name: 'Winner B',
        winner_country: 'DE',
        num_tenders_received: 3,
        award_criteria_type: 'best-price-quality-ratio',
        contract_duration_months: 24,
        framework_agreement: 0,
        original_language: 'DE',
        deadline: null,
      },
      {
        ted_id: 'TED-BP-3',
        notice_type: 'contract_award',
        publication_date: '2024-03-01',
        buyer_id: 'B-BETA',
        buyer_name: 'Beta GmbH',
        buyer_nuts: 'AT13',
        cpv_main: '45000000',
        cpv_additional: null,
        title: 'Construction',
        description: null,
        procedure_type: 'Restricted procedure',
        value_estimated: null,
        value_awarded: 500000,
        currency: 'EUR',
        winner_name: 'Builder X',
        winner_country: 'AT',
        num_tenders_received: 8,
        award_criteria_type: 'lowest-price',
        contract_duration_months: 36,
        framework_agreement: 0,
        original_language: 'DE',
        deadline: null,
      },
    ];

    for (const n of notices) upsertNotice(db, n);

    const count = rebuildBuyerProfiles(db);
    expect(count).toBe(2); // 2 unique buyers

    // Verify Alpha profile
    const alpha = db.queryOne<{
      buyer_id: string;
      total_awards: number;
      avg_value_eur: number;
      first_seen: string;
      last_seen: string;
      preferred_procedure: string;
    }>('SELECT * FROM buyer_profiles WHERE buyer_id = ?', ['B-ALPHA']);

    expect(alpha).toBeDefined();
    expect(alpha!.total_awards).toBe(2);
    expect(alpha!.avg_value_eur).toBeCloseTo(150000, -1);
    expect(alpha!.first_seen).toBe('2024-01-15');
    expect(alpha!.last_seen).toBe('2024-06-15');
    expect(alpha!.preferred_procedure).toBe('Open procedure');

    // Verify Beta profile
    const beta = db.queryOne<{
      buyer_id: string;
      total_awards: number;
      avg_value_eur: number;
    }>('SELECT * FROM buyer_profiles WHERE buyer_id = ?', ['B-BETA']);

    expect(beta).toBeDefined();
    expect(beta!.total_awards).toBe(1);
    expect(beta!.avg_value_eur).toBeCloseTo(500000, -1);
  });

  it('should exclude non-award notices', () => {
    // Insert a contract notice (not an award)
    upsertNotice(db, {
      ted_id: 'TED-CN-ONLY',
      notice_type: 'contract_notice',
      publication_date: '2024-01-01',
      buyer_id: 'B-CN',
      buyer_name: 'CN Buyer',
      buyer_nuts: 'DE',
      cpv_main: '72000000',
      cpv_additional: null,
      title: 'Upcoming',
      description: null,
      procedure_type: 'Open procedure',
      value_estimated: 100000,
      value_awarded: null,
      currency: 'EUR',
      winner_name: null,
      winner_country: null,
      num_tenders_received: null,
      award_criteria_type: null,
      contract_duration_months: null,
      framework_agreement: 0,
      original_language: 'DE',
      deadline: '2024-02-01',
    });

    const count = rebuildBuyerProfiles(db);
    expect(count).toBe(0); // No awards, no profiles
  });

  it('should clear old profiles before rebuilding', () => {
    // Insert a profile manually
    db.execute(
      `INSERT INTO buyer_profiles (buyer_id, buyer_name, total_awards) VALUES (?, ?, ?)`,
      ['OLD-BUYER', 'Old Buyer', 99]
    );

    // Rebuild with no data
    rebuildBuyerProfiles(db);

    const row = db.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM buyer_profiles');
    expect(row?.cnt).toBe(0);
  });
});

// ── CPV benchmarks rebuild tests ────────────────────────────────────────────

describe('rebuildCpvBenchmarks', () => {
  let db: DatabaseAdapter;

  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  afterEach(() => {
    db.close();
  });

  it('should create benchmarks grouped by CPV, country, year', () => {
    // Insert several awards for the same CPV in the same country/year
    const awards: ParsedNotice[] = [
      {
        ted_id: 'BM-1', notice_type: 'contract_award', publication_date: '2024-03-01',
        buyer_id: 'B1', buyer_name: 'Buyer1', buyer_nuts: 'DE11',
        cpv_main: '72000000', cpv_additional: null, title: null, description: null,
        procedure_type: 'Open', value_estimated: null, value_awarded: 100000,
        currency: 'EUR', winner_name: 'W1', winner_country: 'DE',
        num_tenders_received: 3, award_criteria_type: 'bpqr',
        contract_duration_months: 12, framework_agreement: 0,
        original_language: 'DE', deadline: null,
      },
      {
        ted_id: 'BM-2', notice_type: 'contract_award', publication_date: '2024-06-01',
        buyer_id: 'B2', buyer_name: 'Buyer2', buyer_nuts: 'DE21',
        cpv_main: '72000000', cpv_additional: null, title: null, description: null,
        procedure_type: 'Open', value_estimated: null, value_awarded: 200000,
        currency: 'EUR', winner_name: 'W1', winner_country: 'DE',
        num_tenders_received: 5, award_criteria_type: 'bpqr',
        contract_duration_months: 24, framework_agreement: 0,
        original_language: 'DE', deadline: null,
      },
      {
        ted_id: 'BM-3', notice_type: 'contract_award', publication_date: '2024-09-01',
        buyer_id: 'B3', buyer_name: 'Buyer3', buyer_nuts: 'DE31',
        cpv_main: '72000000', cpv_additional: null, title: null, description: null,
        procedure_type: 'Open', value_estimated: null, value_awarded: 300000,
        currency: 'EUR', winner_name: 'W2', winner_country: 'DE',
        num_tenders_received: 7, award_criteria_type: 'lowest',
        contract_duration_months: 36, framework_agreement: 0,
        original_language: 'DE', deadline: null,
      },
    ];

    for (const a of awards) upsertNotice(db, a);

    const count = rebuildCpvBenchmarks(db);
    expect(count).toBe(1); // 1 group: 72000000 / DE / 2024

    const benchmark = db.queryOne<{
      cpv_main: string;
      nuts_country: string;
      year: number;
      award_count: number;
      p25_value: number;
      median_value: number;
      p75_value: number;
      avg_bidders: number;
    }>('SELECT * FROM cpv_benchmarks WHERE cpv_main = ?', ['72000000']);

    expect(benchmark).toBeDefined();
    expect(benchmark!.nuts_country).toBe('DE');
    expect(benchmark!.year).toBe(2024);
    expect(benchmark!.award_count).toBe(3);
    expect(benchmark!.p25_value).toBeLessThanOrEqual(benchmark!.median_value);
    expect(benchmark!.median_value).toBeLessThanOrEqual(benchmark!.p75_value);
    expect(benchmark!.avg_bidders).toBe(5); // (3+5+7)/3
  });

  it('should separate benchmarks by country', () => {
    const awards: ParsedNotice[] = [
      {
        ted_id: 'BM-DE', notice_type: 'contract_award', publication_date: '2024-01-01',
        buyer_id: 'B-DE', buyer_name: 'DE Buyer', buyer_nuts: 'DE11',
        cpv_main: '72000000', cpv_additional: null, title: null, description: null,
        procedure_type: 'Open', value_estimated: null, value_awarded: 100000,
        currency: 'EUR', winner_name: 'W1', winner_country: 'DE',
        num_tenders_received: 3, award_criteria_type: null,
        contract_duration_months: null, framework_agreement: 0,
        original_language: null, deadline: null,
      },
      {
        ted_id: 'BM-AT', notice_type: 'contract_award', publication_date: '2024-01-01',
        buyer_id: 'B-AT', buyer_name: 'AT Buyer', buyer_nuts: 'AT13',
        cpv_main: '72000000', cpv_additional: null, title: null, description: null,
        procedure_type: 'Open', value_estimated: null, value_awarded: 150000,
        currency: 'EUR', winner_name: 'W2', winner_country: 'AT',
        num_tenders_received: 4, award_criteria_type: null,
        contract_duration_months: null, framework_agreement: 0,
        original_language: null, deadline: null,
      },
    ];

    for (const a of awards) upsertNotice(db, a);

    const count = rebuildCpvBenchmarks(db);
    expect(count).toBe(2); // DE and AT

    const deRow = db.queryOne<{ median_value: number }>(
      'SELECT median_value FROM cpv_benchmarks WHERE nuts_country = ?', ['DE']
    );
    const atRow = db.queryOne<{ median_value: number }>(
      'SELECT median_value FROM cpv_benchmarks WHERE nuts_country = ?', ['AT']
    );

    expect(deRow).toBeDefined();
    expect(atRow).toBeDefined();
    expect(deRow!.median_value).toBe(100000);
    expect(atRow!.median_value).toBe(150000);
  });

  it('should separate benchmarks by year', () => {
    const awards: ParsedNotice[] = [
      {
        ted_id: 'BM-Y1', notice_type: 'contract_award', publication_date: '2023-06-01',
        buyer_id: 'B1', buyer_name: 'B', buyer_nuts: 'DE11',
        cpv_main: '72000000', cpv_additional: null, title: null, description: null,
        procedure_type: null, value_estimated: null, value_awarded: 50000,
        currency: 'EUR', winner_name: 'W', winner_country: 'DE',
        num_tenders_received: null, award_criteria_type: null,
        contract_duration_months: null, framework_agreement: 0,
        original_language: null, deadline: null,
      },
      {
        ted_id: 'BM-Y2', notice_type: 'contract_award', publication_date: '2024-06-01',
        buyer_id: 'B1', buyer_name: 'B', buyer_nuts: 'DE11',
        cpv_main: '72000000', cpv_additional: null, title: null, description: null,
        procedure_type: null, value_estimated: null, value_awarded: 80000,
        currency: 'EUR', winner_name: 'W', winner_country: 'DE',
        num_tenders_received: null, award_criteria_type: null,
        contract_duration_months: null, framework_agreement: 0,
        original_language: null, deadline: null,
      },
    ];

    for (const a of awards) upsertNotice(db, a);

    const count = rebuildCpvBenchmarks(db);
    expect(count).toBe(2); // 2023 and 2024
  });

  it('should clear old benchmarks before rebuilding', () => {
    db.execute(
      `INSERT INTO cpv_benchmarks (cpv_main, nuts_country, year, award_count, p25_value, median_value, p75_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['99000000', 'XX', 2020, 100, 1000, 2000, 3000]
    );

    rebuildCpvBenchmarks(db);

    const row = db.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM cpv_benchmarks');
    expect(row?.cnt).toBe(0);
  });

  it('should include top winners', () => {
    const awards: ParsedNotice[] = [
      {
        ted_id: 'TW-1', notice_type: 'contract_award', publication_date: '2024-01-01',
        buyer_id: 'B1', buyer_name: 'B', buyer_nuts: 'DE11',
        cpv_main: '72000000', cpv_additional: null, title: null, description: null,
        procedure_type: null, value_estimated: null, value_awarded: 100000,
        currency: 'EUR', winner_name: 'Frequent Winner', winner_country: 'DE',
        num_tenders_received: null, award_criteria_type: null,
        contract_duration_months: null, framework_agreement: 0,
        original_language: null, deadline: null,
      },
      {
        ted_id: 'TW-2', notice_type: 'contract_award', publication_date: '2024-02-01',
        buyer_id: 'B2', buyer_name: 'B', buyer_nuts: 'DE11',
        cpv_main: '72000000', cpv_additional: null, title: null, description: null,
        procedure_type: null, value_estimated: null, value_awarded: 200000,
        currency: 'EUR', winner_name: 'Frequent Winner', winner_country: 'DE',
        num_tenders_received: null, award_criteria_type: null,
        contract_duration_months: null, framework_agreement: 0,
        original_language: null, deadline: null,
      },
      {
        ted_id: 'TW-3', notice_type: 'contract_award', publication_date: '2024-03-01',
        buyer_id: 'B3', buyer_name: 'B', buyer_nuts: 'DE11',
        cpv_main: '72000000', cpv_additional: null, title: null, description: null,
        procedure_type: null, value_estimated: null, value_awarded: 150000,
        currency: 'EUR', winner_name: 'Other Winner', winner_country: 'DE',
        num_tenders_received: null, award_criteria_type: null,
        contract_duration_months: null, framework_agreement: 0,
        original_language: null, deadline: null,
      },
    ];

    for (const a of awards) upsertNotice(db, a);
    rebuildCpvBenchmarks(db);

    const bm = db.queryOne<{ top_winners: string }>(
      'SELECT top_winners FROM cpv_benchmarks WHERE cpv_main = ?', ['72000000']
    );
    expect(bm).toBeDefined();
    expect(bm!.top_winners).toContain('Frequent Winner');
  });
});

// ── Check freshness tests ───────────────────────────────────────────────────

describe('checkFreshness', () => {
  let db: DatabaseAdapter;

  beforeEach(async () => {
    db = await createInMemoryDb();
  });

  afterEach(() => {
    db.close();
  });

  it('should report stale when no data exists', () => {
    const results = checkFreshness(db);

    expect(results.length).toBeGreaterThanOrEqual(2);

    const ted = results.find((r) => r.source === 'TED notices');
    expect(ted).toBeDefined();
    expect(ted!.isFresh).toBe(false);
    expect(ted!.latestDate).toBeNull();
    expect(ted!.daysSinceUpdate).toBeNull();

    const legal = results.find((r) => r.source === 'Legal content');
    expect(legal).toBeDefined();
    expect(legal!.isFresh).toBe(false);
  });

  it('should report fresh when data is recent', () => {
    // Insert a notice with today's date
    const today = new Date().toISOString().slice(0, 10);
    db.execute(
      `INSERT INTO notices (ted_id, notice_type, publication_date) VALUES (?, ?, ?)`,
      ['FRESH-1', 'contract_award', today]
    );

    // Insert a directive with recent timestamp
    db.execute(
      `INSERT INTO directives (title, jurisdiction, type) VALUES (?, ?, ?)`,
      ['Test Directive', 'EU', 'eu_directive']
    );

    const results = checkFreshness(db);

    const ted = results.find((r) => r.source === 'TED notices');
    expect(ted).toBeDefined();
    expect(ted!.isFresh).toBe(true);
    expect(ted!.daysSinceUpdate).toBeLessThanOrEqual(1);
  });

  it('should report stale when TED data is old', () => {
    // Insert a notice from 10 days ago
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);
    const oldDateStr = oldDate.toISOString().slice(0, 10);

    db.execute(
      `INSERT INTO notices (ted_id, notice_type, publication_date) VALUES (?, ?, ?)`,
      ['OLD-1', 'contract_award', oldDateStr]
    );

    const results = checkFreshness(db);

    const ted = results.find((r) => r.source === 'TED notices');
    expect(ted).toBeDefined();
    expect(ted!.isFresh).toBe(false);
    expect(ted!.daysSinceUpdate).toBeGreaterThanOrEqual(9);
  });
});

describe('daysBetween', () => {
  it('should calculate days between two dates', () => {
    const from = new Date('2024-01-01');
    const to = new Date('2024-01-10');
    expect(daysBetween(from, to)).toBe(9);
  });

  it('should return 0 for same day', () => {
    const date = new Date('2024-06-15');
    expect(daysBetween(date, date)).toBe(0);
  });

  it('should handle month boundaries', () => {
    const from = new Date('2024-01-30');
    const to = new Date('2024-02-02');
    expect(daysBetween(from, to)).toBe(3);
  });
});

describe('formatReport', () => {
  it('should format fresh sources with OK marker', () => {
    const results = [
      {
        source: 'TED notices',
        latestDate: '2024-06-15',
        daysSinceUpdate: 1,
        threshold: 2,
        isFresh: true,
      },
    ];

    const report = formatReport(results);
    expect(report).toContain('[OK]');
    expect(report).toContain('FRESH');
    expect(report).toContain('TED notices');
  });

  it('should format stale sources with warning marker', () => {
    const results = [
      {
        source: 'TED notices',
        latestDate: '2024-01-01',
        daysSinceUpdate: 100,
        threshold: 2,
        isFresh: false,
      },
    ];

    const report = formatReport(results);
    expect(report).toContain('[!!]');
    expect(report).toContain('STALE');
    expect(report).toContain('WARNING');
  });

  it('should handle no-data sources', () => {
    const results = [
      {
        source: 'TED notices',
        latestDate: null,
        daysSinceUpdate: null,
        threshold: 2,
        isFresh: false,
      },
    ];

    const report = formatReport(results);
    expect(report).toContain('NO DATA');
    expect(report).toContain('N/A');
  });

  it('should report all-fresh status', () => {
    const results = [
      {
        source: 'Source A',
        latestDate: '2024-06-15',
        daysSinceUpdate: 0,
        threshold: 2,
        isFresh: true,
      },
    ];

    const report = formatReport(results);
    expect(report).toContain('All sources are within freshness thresholds');
  });
});

// ── CLI args parsing tests ──────────────────────────────────────────────────

describe('parseCliArgs', () => {
  it('should parse --from and --to flags', () => {
    const args = parseCliArgs(['node', 'script.ts', '--from', '2024-01-01', '--to', '2024-12-31']);
    expect(args.from).toBe('2024-01-01');
    expect(args.to).toBe('2024-12-31');
  });

  it('should default to yesterday when no flags provided', () => {
    const args = parseCliArgs(['node', 'script.ts']);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const expectedDate = yesterday.toISOString().slice(0, 10);

    expect(args.from).toBe(expectedDate);
    expect(args.to).toBe(expectedDate);
  });

  it('should use yesterday for --to when only --from is provided', () => {
    const args = parseCliArgs(['node', 'script.ts', '--from', '2024-01-01']);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const expectedDate = yesterday.toISOString().slice(0, 10);

    expect(args.from).toBe('2024-01-01');
    expect(args.to).toBe(expectedDate);
  });

  it('should use yesterday for --from when only --to is provided', () => {
    const args = parseCliArgs(['node', 'script.ts', '--to', '2024-12-31']);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const expectedDate = yesterday.toISOString().slice(0, 10);

    expect(args.from).toBe(expectedDate);
    expect(args.to).toBe('2024-12-31');
  });
});
