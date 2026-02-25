import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { about } from '../../src/tools/about.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('about', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should return server name and version', () => {
    const result = about(db);
    expect(result.error).toBeUndefined();
    expect(result.name).toBe('@ansvar/public-procurement-mcp');
    expect(result.version).toBe('0.1.0');
  });

  it('should return a description', () => {
    const result = about(db);
    expect(result.description).toBeDefined();
    expect(typeof result.description).toBe('string');
    expect(result.description.length).toBeGreaterThan(0);
  });

  it('should return coverage summary with counts', () => {
    const result = about(db);
    expect(result.coverage).toBeDefined();
    expect(result.coverage.directives).toBeGreaterThan(0);
    expect(result.coverage.provisions).toBeGreaterThan(0);
    expect(result.coverage.award_notices).toBeGreaterThan(0);
    expect(result.coverage.cpv_codes).toBeGreaterThan(0);
  });

  it('should return supported jurisdictions', () => {
    const result = about(db);
    expect(result.jurisdictions).toBeDefined();
    expect(result.jurisdictions.length).toBeGreaterThan(0);
    expect(result.jurisdictions).toContain('EU');
  });

  it('should include security posture', () => {
    const result = about(db);
    expect(result.security).toBeDefined();
    expect(result.security.read_only).toBe(true);
    expect(result.security.no_network).toBe(true);
  });

  it('should include _meta', () => {
    const result = about(db);
    expect(result._meta).toBeDefined();
    expect(result._meta.disclaimer).toBeTruthy();
  });

  it('should include tool count', () => {
    const result = about(db);
    expect(result.tool_count).toBe(19);
  });
});
