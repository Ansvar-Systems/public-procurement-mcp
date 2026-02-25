import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { searchLegislation } from '../../src/tools/search-legislation.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('search_legislation', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should return results for "procurement"', () => {
    const result = searchLegislation(db, { query: 'procurement' });
    expect(result.error).toBeUndefined();
    expect(result.results).toBeDefined();
    expect(result.results!.length).toBeGreaterThan(0);
    expect(result._meta).toBeDefined();
    expect(result._meta.disclaimer).toBeTruthy();
  });

  it('should filter by jurisdiction', () => {
    const result = searchLegislation(db, {
      query: 'procurement',
      jurisdiction: 'EU',
    });
    expect(result.results).toBeDefined();
    for (const r of result.results!) {
      expect(r.jurisdiction).toBe('EU');
    }
  });

  it('should filter by directive', () => {
    const result = searchLegislation(db, {
      query: 'procurement',
      directive: '2014/24/EU',
    });
    expect(result.results).toBeDefined();
    for (const r of result.results!) {
      expect(r.directive_short_title).toBe('2014/24/EU');
    }
  });

  it('should respect limit parameter', () => {
    const result = searchLegislation(db, { query: 'procurement', limit: 2 });
    expect(result.results!.length).toBeLessThanOrEqual(2);
  });

  it('should cap limit at 50', () => {
    const result = searchLegislation(db, { query: 'procurement', limit: 100 });
    // Should not error — just clamps to 50
    expect(result.results).toBeDefined();
  });

  it('should return snippet text', () => {
    const result = searchLegislation(db, { query: 'procurement' });
    const first = result.results![0];
    expect(first.snippet).toBeDefined();
    expect(first.snippet.length).toBeGreaterThan(0);
    // Snippet should contain relevant content
    expect(first.snippet.toLowerCase()).toMatch(/procurement|procedure|contract/);
  });

  it('should return error for empty query', () => {
    const result = searchLegislation(db, { query: '' });
    expect(result.error).toBeDefined();
  });

  it('should return results including directive title and article number', () => {
    const result = searchLegislation(db, { query: 'exclusion' });
    expect(result.results).toBeDefined();
    const first = result.results![0];
    expect(first.article_number).toBeDefined();
    expect(first.directive_title).toBeDefined();
    expect(first.jurisdiction).toBeDefined();
  });

  it('should find German-language content', () => {
    const result = searchLegislation(db, { query: 'Vergabe' });
    expect(result.results).toBeDefined();
    expect(result.results!.length).toBeGreaterThan(0);
  });
});
