import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { listSources } from '../../src/tools/list-sources.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('list_sources', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should return table counts for all key tables', () => {
    const result = listSources(db);
    expect(result.error).toBeUndefined();
    expect(result.tables).toBeDefined();
    expect(result.tables.directives).toBeGreaterThan(0);
    expect(result.tables.provisions).toBeGreaterThan(0);
    expect(result.tables.cpv_codes).toBeGreaterThan(0);
    expect(result.tables.notices).toBeGreaterThan(0);
    expect(result.tables.buyer_profiles).toBeGreaterThan(0);
    expect(result.tables.cpv_benchmarks).toBeGreaterThan(0);
  });

  it('should return data sources list', () => {
    const result = listSources(db);
    expect(result.sources).toBeDefined();
    expect(result.sources.length).toBeGreaterThan(0);
    // Should include known sources
    const sourceNames = result.sources.map((s: { name: string }) => s.name);
    expect(sourceNames).toContain('EUR-Lex');
    expect(sourceNames).toContain('TED');
  });

  it('should include coverage notes', () => {
    const result = listSources(db);
    expect(result.coverage).toBeDefined();
    expect(typeof result.coverage).toBe('string');
    expect(result.coverage.length).toBeGreaterThan(0);
  });

  it('should include _meta', () => {
    const result = listSources(db);
    expect(result._meta).toBeDefined();
    expect(result._meta.disclaimer).toBeTruthy();
  });

  it('should return accurate counts matching actual data', () => {
    const result = listSources(db);
    // We seeded 5 directives
    expect(result.tables.directives).toBe(5);
    // We seeded 20 provisions
    expect(result.tables.provisions).toBe(20);
  });

  it('should include jurisdiction coverage in sources', () => {
    const result = listSources(db);
    expect(result.jurisdictions).toBeDefined();
    expect(result.jurisdictions.length).toBeGreaterThan(0);
    expect(result.jurisdictions).toContain('EU');
    expect(result.jurisdictions).toContain('DE');
    expect(result.jurisdictions).toContain('AT');
    expect(result.jurisdictions).toContain('CH');
  });
});
