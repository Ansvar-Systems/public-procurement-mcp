import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { getProvision } from '../../src/tools/get-provision.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('get_provision', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should return a specific article by short_title and article number', () => {
    const result = getProvision(db, {
      directive_id: '2014/24/EU',
      article: '18',
    });
    expect(result.error).toBeUndefined();
    expect(result.article_number).toBe('18');
    expect(result.title).toBe('Principles of procurement');
    expect(result.body).toContain('equal');
    expect(result.directive).toBeDefined();
    expect(result.directive!.short_title).toBe('2014/24/EU');
    expect(result._meta).toBeDefined();
  });

  it('should return error for nonexistent article', () => {
    const result = getProvision(db, {
      directive_id: '2014/24/EU',
      article: '999',
    });
    expect(result.error).toBeDefined();
    expect(result.error).toContain('999');
    expect(result.directive).toBeDefined();
  });

  it('should return error for nonexistent directive', () => {
    const result = getProvision(db, {
      directive_id: 'NONEXISTENT',
    });
    expect(result.error).toBeDefined();
    expect(result.error).toContain('NONEXISTENT');
  });

  it('should return all provisions when no article specified', () => {
    const result = getProvision(db, {
      directive_id: '2014/24/EU',
    });
    expect(result.error).toBeUndefined();
    expect(result.provisions).toBeDefined();
    expect(result.provisions!.length).toBeGreaterThan(0);
    expect(result.total).toBe(result.provisions!.length);
  });

  it('should resolve by celex_number', () => {
    const result = getProvision(db, {
      directive_id: '32014L0024',
      article: '1',
    });
    expect(result.error).toBeUndefined();
    expect(result.article_number).toBe('1');
    expect(result.directive!.celex_number).toBe('32014L0024');
  });

  it('should resolve Swiss BoeB by short_title', () => {
    const result = getProvision(db, {
      directive_id: 'BoeB',
      article: '21',
    });
    expect(result.error).toBeUndefined();
    expect(result.article_number).toBe('21');
    expect(result.directive!.jurisdiction).toBe('CH');
  });

  it('should return error for empty directive_id', () => {
    const result = getProvision(db, { directive_id: '' });
    expect(result.error).toBeDefined();
  });

  it('should include effective_date in directive metadata', () => {
    const result = getProvision(db, {
      directive_id: '2014/24/EU',
      article: '1',
    });
    expect(result.directive!.effective_date).toBe('2014-02-26');
  });
});
