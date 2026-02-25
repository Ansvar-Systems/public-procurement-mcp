import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db.js';
import { validateCitation } from '../../src/tools/validate-citation.js';
import type { DatabaseAdapter } from '../../src/database/adapter.js';

describe('validate_citation', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(() => {
    db?.close();
  });

  it('should validate "Article 18, Directive 2014/24/EU"', () => {
    const result = validateCitation(db, {
      citation: 'Article 18, Directive 2014/24/EU',
    });
    expect(result.valid).toBe(true);
    expect(result.document_exists).toBe(true);
    expect(result.provision_exists).toBe(true);
    expect(result.provision).toBeDefined();
    expect(result.provision!.body).toContain('equal');
    expect(result.correct_form).toContain('Article 18');
    expect(result._meta).toBeDefined();
  });

  it('should validate "Art. 57 2014/24/EU"', () => {
    const result = validateCitation(db, {
      citation: 'Art. 57 2014/24/EU',
    });
    expect(result.valid).toBe(true);
    expect(result.provision_exists).toBe(true);
    expect(result.provision!.body).toContain('exclude');
  });

  it('should validate "Art. 57(1) Directive 2014/24/EU" (with subsection)', () => {
    const result = validateCitation(db, {
      citation: 'Art. 57(1) Directive 2014/24/EU',
    });
    expect(result.valid).toBe(true);
    expect(result.provision_exists).toBe(true);
  });

  it('should return invalid for nonexistent article', () => {
    const result = validateCitation(db, {
      citation: 'Article 999, Directive 2014/24/EU',
    });
    expect(result.valid).toBe(false);
    expect(result.document_exists).toBe(true);
    expect(result.provision_exists).toBe(false);
    expect(result.error).toContain('999');
  });

  it('should return invalid for nonexistent directive', () => {
    const result = validateCitation(db, {
      citation: 'Article 1, Directive 9999/99/XX',
    });
    expect(result.valid).toBe(false);
    expect(result.document_exists).toBe(false);
  });

  it('should validate Swiss law citation "Art. 21 BoeB"', () => {
    const result = validateCitation(db, {
      citation: 'Art. 21 BoeB',
    });
    expect(result.valid).toBe(true);
    expect(result.provision_exists).toBe(true);
    expect(result.directive!.jurisdiction).toBe('CH');
  });

  it('should validate German law citation "Section 97 GWB"', () => {
    const result = validateCitation(db, {
      citation: 'Section 97 GWB',
    });
    expect(result.valid).toBe(true);
    expect(result.provision_exists).toBe(true);
    expect(result.directive!.jurisdiction).toBe('DE');
  });

  it('should validate directive-only citation (no article)', () => {
    const result = validateCitation(db, {
      citation: 'Directive 2014/24/EU',
    });
    expect(result.valid).toBe(true);
    expect(result.document_exists).toBe(true);
    expect(result.provision_exists).toBeNull();
    expect(result.message).toContain('No specific article');
  });

  it('should return error for empty citation', () => {
    const result = validateCitation(db, { citation: '' });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should return error when no directive can be identified', () => {
    const result = validateCitation(db, { citation: 'random text here' });
    expect(result.valid).toBe(false);
  });
});
