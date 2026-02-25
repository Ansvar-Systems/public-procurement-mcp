import { describe, it, expect, afterEach } from 'vitest';
import { createTestDb } from './test-db.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('Test DB fixture', () => {
  let db: DatabaseAdapter;

  afterEach(() => {
    db?.close();
  });

  it('should create an in-memory database with seed data', async () => {
    db = await createTestDb();

    const directives = db.query('SELECT COUNT(*) as cnt FROM directives');
    expect(directives[0].cnt).toBe(5);

    const provisions = db.query('SELECT COUNT(*) as cnt FROM provisions');
    expect((provisions[0].cnt as number)).toBeGreaterThanOrEqual(15);

    const cpv = db.query('SELECT COUNT(*) as cnt FROM cpv_codes');
    expect((cpv[0].cnt as number)).toBeGreaterThanOrEqual(25);

    const thresholds = db.query('SELECT COUNT(*) as cnt FROM thresholds');
    expect((thresholds[0].cnt as number)).toBeGreaterThanOrEqual(5);
  });

  it('should have working FTS5 index', async () => {
    db = await createTestDb();

    const results = db.query(
      "SELECT * FROM provisions_fts WHERE provisions_fts MATCH 'procurement'"
    );
    expect(results.length).toBeGreaterThan(0);
  });
});
