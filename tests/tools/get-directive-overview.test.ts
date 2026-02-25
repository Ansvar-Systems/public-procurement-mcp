import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { getDirectiveOverview } from '../../src/tools/get-directive-overview.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('get_directive_overview', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should return overview of 2014/24/EU with expected fields', () => {
    const result = getDirectiveOverview(db, { directive_id: '2014/24/EU' });
    expect(result.error).toBeUndefined();
    expect(result.title).toContain('2014/24/EU');
    expect(result.short_title).toBe('2014/24/EU');
    expect(result.jurisdiction).toBe('EU');
    expect(result.type).toBe('eu_directive');
    expect(result.celex_number).toBe('32014L0024');
    expect(result.effective_date).toBe('2014-02-26');
    expect(result._meta).toBeDefined();
  });

  it('should include article count', () => {
    const result = getDirectiveOverview(db, { directive_id: '2014/24/EU' });
    expect(result.article_count).toBeGreaterThan(0);
  });

  it('should include key articles list', () => {
    const result = getDirectiveOverview(db, { directive_id: '2014/24/EU' });
    expect(result.key_articles).toBeDefined();
    expect(result.key_articles!.length).toBeGreaterThan(0);
    const art1 = result.key_articles!.find((a: { article_number: string }) => a.article_number === '1');
    expect(art1).toBeDefined();
    expect(art1!.title).toBe('Subject matter and scope');
  });

  it('should include thresholds', () => {
    const result = getDirectiveOverview(db, { directive_id: '2014/24/EU' });
    expect(result.thresholds).toBeDefined();
    expect(result.thresholds!.length).toBeGreaterThan(0);
    const works = result.thresholds!.find((t: { category: string }) => t.category === 'works');
    expect(works).toBeDefined();
    expect(works!.value_eur).toBe(5538000);
  });

  it('should include procedure types', () => {
    const result = getDirectiveOverview(db, { directive_id: '2014/24/EU' });
    expect(result.procedure_types).toBeDefined();
    expect(result.procedure_types!.length).toBeGreaterThan(0);
    const open = result.procedure_types!.find(
      (p: { name: string }) => p.name === 'Open procedure'
    );
    expect(open).toBeDefined();
  });

  it('should include scope from Article 1', () => {
    const result = getDirectiveOverview(db, { directive_id: '2014/24/EU' });
    expect(result.scope).toBeDefined();
    expect(result.scope).toContain('procurement');
  });

  it('should return error for nonexistent directive', () => {
    const result = getDirectiveOverview(db, { directive_id: 'FAKE' });
    expect(result.error).toBeDefined();
  });

  it('should return error for empty directive_id', () => {
    const result = getDirectiveOverview(db, { directive_id: '' });
    expect(result.error).toBeDefined();
  });

  it('should work for Swiss BoeB', () => {
    const result = getDirectiveOverview(db, { directive_id: 'BoeB' });
    expect(result.error).toBeUndefined();
    expect(result.jurisdiction).toBe('CH');
    expect(result.key_articles!.length).toBeGreaterThan(0);
  });
});
