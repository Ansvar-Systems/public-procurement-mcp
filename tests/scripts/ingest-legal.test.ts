/**
 * Tests for the legal content ingestion pipeline.
 *
 * Tests HTML parser, EUR-Lex parser, and ingestion helpers
 * using fixture HTML without network access.
 */

import { describe, it, expect } from 'vitest';
import {
  stripHtml,
  normalizeWhitespace,
  parseArticles,
  parseParagraphs,
} from '../../scripts/lib/html-parser.js';
import {
  parseEurLexHtml,
  extractTitle,
  extractEffectiveDate,
  buildEurLexUrl,
  parseEurLexArticles,
} from '../../scripts/lib/eurlex-parser.js';
import { parseSwissHtml, parseSwissArticles, buildFedlexUrl } from '../../scripts/ingest-swiss.js';
import { parseAustrianHtml, parseAustrianArticles, buildRisUrl } from '../../scripts/ingest-austrian.js';
import { parseGermanHtml, parseGermanArticles, buildGiiUrl } from '../../scripts/ingest-german.js';
import { loadCensus, upsertDirective, upsertProvisions, rebuildFts } from '../../scripts/ingest-legal.js';

// ── Fixture HTML ────────────────────────────────────────────────────────────

const EURLEX_FIXTURE = `
<!DOCTYPE html>
<html>
<head><title>Directive 2014/24/EU of the European Parliament</title></head>
<body>
<p class="oj-doc-ti">DIRECTIVE 2014/24/EU OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL
of 26 February 2014 on public procurement</p>

<p class="oj-ti-art">Article 1</p>
<p class="oj-normal">Subject-matter and scope</p>
<p class="oj-normal">1. This Directive establishes rules on the procedures for procurement by contracting authorities with respect to public contracts.</p>
<p class="oj-normal">2. Procurement within the meaning of this Directive is the acquisition by means of a public contract of works, supplies or services by contracting authorities.</p>

<p class="oj-ti-art">Article 2</p>
<p class="oj-normal">Definitions</p>
<p class="oj-normal">1. For the purposes of this Directive, the following definitions apply:</p>
<p class="oj-normal">(a) 'contracting authorities' means the State, regional or local authorities.</p>
<p class="oj-normal">(b) 'central government authorities' means authorities listed in Annex I.</p>

<p class="oj-ti-art">Article 3</p>
<p class="oj-normal">Mixed procurement</p>
<p class="oj-normal">Where contracts relate to two or more types of procurement, the applicable rules shall be determined.</p>

<p class="oj-ti-art">Article 57</p>
<p class="oj-normal">Exclusion grounds</p>
<p class="oj-normal">1. Contracting authorities shall exclude an economic operator from participation in a procurement procedure where they have established that the economic operator has been convicted.</p>
<p class="oj-normal">This Directive shall apply from 18 April 2016.</p>
</body>
</html>
`;

const SWISS_FIXTURE = `
<!DOCTYPE html>
<html>
<head><title>Federal Act on Public Procurement (BöB)</title></head>
<body>
<h1>Federal Act on Public Procurement</h1>
<p>of 21 June 2019</p>

<p>Art. 1 Subject matter and purpose</p>
<p>This Act governs the procurement of supplies, services and construction work by contracting authorities.</p>

<p>Art. 2 Scope</p>
<p>This Act applies to the procurement of supplies, services and construction work by contracting authorities within and outside the scope of international agreements.</p>

<p>Art. 21 Types of procedure</p>
<p>The contracting authority shall choose the open or the selective procedure.</p>

<p>Art. 44 Exclusion grounds</p>
<p>The contracting authority shall exclude a tenderer from a procurement procedure if the tenderer has been convicted of corruption.</p>
</body>
</html>
`;

const AUSTRIAN_FIXTURE = `
<!DOCTYPE html>
<html>
<head><title>Bundesvergabegesetz 2018</title></head>
<body>
<h1>Bundesvergabegesetz 2018 (BVergG 2018)</h1>
<p>Inkrafttretedatum: 21.08.2018</p>

<p>§ 1 Geltungsbereich</p>
<p>Dieses Bundesgesetz regelt die Vergabe von Aufträgen durch öffentliche Auftraggeber.</p>

<p>§ 2 Begriffsbestimmungen</p>
<p>Im Sinne dieses Bundesgesetzes gelten folgende Begriffsbestimmungen.</p>

<p>§ 78 Ausschlussgründe</p>
<p>Der öffentliche Auftraggeber hat einen Unternehmer auszuschließen wenn dieser verurteilt wurde.</p>
</body>
</html>
`;

const GERMAN_FIXTURE = `
<!DOCTYPE html>
<html>
<head><title>GWB - Gesetz gegen Wettbewerbsbeschränkungen</title></head>
<body>
<span class="jnlangue">Gesetz gegen Wettbewerbsbeschränkungen</span>
<p>Ausfertigungsdatum: 26.06.2013</p>

<p>§ 97 Grundsätze der Vergabe</p>
<p>Öffentliche Aufträge und Konzessionen werden im Wettbewerb und im Wege transparenter Verfahren vergeben.</p>

<p>§ 119 Verfahrensarten</p>
<p>Die Vergabe von öffentlichen Aufträgen erfolgt im offenen Verfahren, im nicht offenen Verfahren, oder im Verhandlungsverfahren.</p>

<p>§ 123 Zwingende Ausschlussgründe</p>
<p>Öffentliche Auftraggeber schließen ein Unternehmen von der Teilnahme an einem Vergabeverfahren aus.</p>
</body>
</html>
`;

// ── HTML Parser Tests ───────────────────────────────────────────────────────

describe('HTML Parser', () => {
  describe('stripHtml', () => {
    it('should remove HTML tags', () => {
      expect(stripHtml('<p>Hello <b>world</b></p>')).toContain('Hello');
      expect(stripHtml('<p>Hello <b>world</b></p>')).toContain('world');
      expect(stripHtml('<p>Hello <b>world</b></p>')).not.toContain('<p>');
      expect(stripHtml('<p>Hello <b>world</b></p>')).not.toContain('<b>');
    });

    it('should decode HTML entities', () => {
      expect(stripHtml('&amp; &lt; &gt; &quot;')).toBe('& < > "');
    });

    it('should convert <br> to newline', () => {
      expect(stripHtml('line1<br>line2')).toContain('\n');
    });

    it('should convert </p> to double newline', () => {
      expect(stripHtml('<p>para1</p><p>para2</p>')).toContain('\n\n');
    });
  });

  describe('normalizeWhitespace', () => {
    it('should collapse multiple spaces', () => {
      expect(normalizeWhitespace('hello   world')).toBe('hello world');
    });

    it('should collapse multiple newlines', () => {
      expect(normalizeWhitespace('a\n\n\n\nb')).toBe('a\n\nb');
    });

    it('should trim leading/trailing whitespace', () => {
      expect(normalizeWhitespace('  hello  ')).toBe('hello');
    });
  });

  describe('parseArticles', () => {
    it('should extract articles from HTML with "Article N" headings', () => {
      const html = `
        <h2>Article 1</h2>
        <p>Subject matter</p>
        <p>This directive establishes rules.</p>
        <h2>Article 2</h2>
        <p>Definitions</p>
        <p>The following definitions apply.</p>
      `;
      const articles = parseArticles(html);
      expect(articles.length).toBe(2);
      expect(articles[0].article_number).toBe('1');
      expect(articles[1].article_number).toBe('2');
    });

    it('should extract articles with § notation', () => {
      const html = `
        <p>§ 1 Scope</p>
        <p>This law governs procurement.</p>
        <p>§ 2 Definitions</p>
        <p>For the purposes of this law.</p>
      `;
      const articles = parseArticles(html);
      expect(articles.length).toBe(2);
      expect(articles[0].article_number).toBe('1');
    });

    it('should extract articles with "Section N" notation', () => {
      const html = `
        <p>Section 1 General</p>
        <p>This act applies to all procurement.</p>
        <p>Section 2 Scope</p>
        <p>The scope is defined as follows.</p>
      `;
      const articles = parseArticles(html);
      expect(articles.length).toBe(2);
      expect(articles[0].article_number).toBe('1');
    });

    it('should handle empty HTML gracefully', () => {
      const articles = parseArticles('');
      expect(articles).toEqual([]);
    });

    it('should handle HTML with no articles', () => {
      const articles = parseArticles('<p>Some random text without articles.</p>');
      expect(articles).toEqual([]);
    });

    it('should deduplicate repeated article numbers', () => {
      const html = `
        <p>Article 1 in TOC</p>
        <p>Link text</p>
        <p>Article 1 Subject matter</p>
        <p>This directive establishes rules.</p>
        <p>Article 2 Definitions</p>
        <p>Definitions here.</p>
      `;
      const articles = parseArticles(html);
      const art1Count = articles.filter((a) => a.article_number === '1').length;
      expect(art1Count).toBe(1);
    });

    it('should extract title from first line after heading', () => {
      const html = `
        <h2>Article 5</h2>
        <p>Principles of procurement</p>
        <p>Contracting authorities shall treat economic operators equally.</p>
      `;
      const articles = parseArticles(html);
      expect(articles.length).toBe(1);
      expect(articles[0].title).toBe('Principles of procurement');
      expect(articles[0].body).toContain('Contracting authorities');
    });
  });

  describe('parseParagraphs', () => {
    it('should parse German § paragraphs', () => {
      const html = `
        <p>§ 97 Grundsätze</p>
        <p>Öffentliche Aufträge werden vergeben.</p>
        <p>§ 119 Verfahrensarten</p>
        <p>Die Vergabe erfolgt im offenen Verfahren.</p>
      `;
      const articles = parseParagraphs(html);
      expect(articles.length).toBe(2);
      expect(articles[0].article_number).toBe('97');
      expect(articles[1].article_number).toBe('119');
    });
  });
});

// ── EUR-Lex Parser Tests ────────────────────────────────────────────────────

describe('EUR-Lex Parser', () => {
  it('should build correct EUR-Lex URL', () => {
    const url = buildEurLexUrl('32014L0024');
    expect(url).toBe('https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32014L0024');
  });

  it('should extract title from oj-doc-ti', () => {
    const title = extractTitle(EURLEX_FIXTURE);
    expect(title).toContain('DIRECTIVE 2014/24/EU');
    expect(title).toContain('public procurement');
  });

  it('should extract effective date', () => {
    const date = extractEffectiveDate(EURLEX_FIXTURE);
    expect(date).toBe('2016-04-18');
  });

  it('should parse EUR-Lex articles using oj-ti-art format', () => {
    const articles = parseEurLexArticles(EURLEX_FIXTURE);
    expect(articles.length).toBeGreaterThanOrEqual(4);

    const art1 = articles.find((a) => a.article_number === '1');
    expect(art1).toBeDefined();
    expect(art1!.title).toBe('Subject-matter and scope');
    expect(art1!.body).toContain('procurement');

    const art57 = articles.find((a) => a.article_number === '57');
    expect(art57).toBeDefined();
    expect(art57!.body).toContain('exclude');
  });

  it('should parse full EUR-Lex HTML into result object', () => {
    const result = parseEurLexHtml(EURLEX_FIXTURE, '32014L0024');
    expect(result.title).toContain('2014/24/EU');
    expect(result.articles.length).toBeGreaterThanOrEqual(4);
    expect(result.source_url).toContain('32014L0024');
    expect(result.effective_date).toBe('2016-04-18');
  });

  it('should handle malformed HTML with no articles', () => {
    const result = parseEurLexHtml('<html><body>Nothing here</body></html>', '32014L0024');
    expect(result.articles).toEqual([]);
    expect(result.title).toBeTruthy();
  });

  it('should handle eli-subdivision format', () => {
    const eliHtml = `
      <html><head><title>Test Directive</title></head><body>
      <div class="eli-subdivision" id="art_1">
        <p>Article 1</p>
        <p>Subject matter</p>
        <p>This directive establishes rules on procurement procedures.</p>
      </div>
      <div class="eli-subdivision" id="art_2">
        <p>Article 2</p>
        <p>Definitions</p>
        <p>For the purposes of this Directive, the following definitions apply.</p>
      </div>
      </body></html>
    `;
    const articles = parseEurLexArticles(eliHtml);
    expect(articles.length).toBe(2);
    expect(articles[0].article_number).toBe('1');
    expect(articles[1].article_number).toBe('2');
  });
});

// ── Swiss Parser Tests ──────────────────────────────────────────────────────

describe('Swiss Parser', () => {
  it('should build correct Fedlex URL', () => {
    const url = buildFedlexUrl('SR-172.056.1');
    expect(url).toContain('fedlex.admin.ch');
  });

  it('should parse Swiss articles with Art. notation', () => {
    const articles = parseSwissArticles(SWISS_FIXTURE);
    expect(articles.length).toBeGreaterThanOrEqual(4);

    const art1 = articles.find((a) => a.article_number === '1');
    expect(art1).toBeDefined();
    expect(art1!.body).toContain('procurement');
  });

  it('should parse Swiss HTML into result object', () => {
    const result = parseSwissHtml(SWISS_FIXTURE, 'SR-172.056.1');
    expect(result.articles.length).toBeGreaterThanOrEqual(4);
    expect(result.source_url).toContain('fedlex');
    expect(result.effective_date).toBe('2019-06-21');
  });
});

// ── Austrian Parser Tests ───────────────────────────────────────────────────

describe('Austrian Parser', () => {
  it('should build correct RIS URL', () => {
    const url = buildRisUrl('BVergG_2018');
    expect(url).toContain('ris.bka.gv.at');
    expect(url).toContain('20010295');
  });

  it('should parse Austrian articles with § notation', () => {
    const articles = parseAustrianArticles(AUSTRIAN_FIXTURE);
    expect(articles.length).toBeGreaterThanOrEqual(3);

    const para1 = articles.find((a) => a.article_number === '1');
    expect(para1).toBeDefined();
    expect(para1!.body).toContain('Vergabe');
  });

  it('should parse Austrian HTML into result object', () => {
    const result = parseAustrianHtml(AUSTRIAN_FIXTURE, 'BVergG_2018');
    expect(result.articles.length).toBeGreaterThanOrEqual(3);
    expect(result.source_url).toContain('ris.bka.gv.at');
    expect(result.effective_date).toBe('2018-08-21');
  });
});

// ── German Parser Tests ─────────────────────────────────────────────────────

describe('German Parser', () => {
  it('should build correct gesetze-im-internet URL', () => {
    const url = buildGiiUrl('GWB_4');
    expect(url).toContain('gesetze-im-internet.de');
    expect(url).toContain('gwb');
  });

  it('should parse German articles with § notation', () => {
    const articles = parseGermanArticles(GERMAN_FIXTURE);
    expect(articles.length).toBeGreaterThanOrEqual(3);

    const para97 = articles.find((a) => a.article_number === '97');
    expect(para97).toBeDefined();
    expect(para97!.body).toContain('Wettbewerb');
  });

  it('should parse German HTML into result object', () => {
    const result = parseGermanHtml(GERMAN_FIXTURE, 'GWB_4');
    expect(result.articles.length).toBeGreaterThanOrEqual(3);
    expect(result.source_url).toContain('gesetze-im-internet.de');
    expect(result.title).toContain('Gesetz gegen Wettbewerbsbeschränkungen');
    expect(result.effective_date).toBe('2013-06-26');
  });
});

// ── Census Tests ────────────────────────────────────────────────────────────

describe('Census', () => {
  it('should load census.json successfully', () => {
    const census = loadCensus();
    expect(census.eu).toBeDefined();
    expect(census.ch).toBeDefined();
    expect(census.at).toBeDefined();
    expect(census.de).toBeDefined();
  });

  it('should have 5 EU directives', () => {
    const census = loadCensus();
    expect(census.eu.length).toBe(5);
  });

  it('should have valid CELEX numbers for EU directives', () => {
    const census = loadCensus();
    for (const entry of census.eu) {
      expect(entry.celex).toMatch(/^\d{5}[A-Z]\d{4}$/);
      expect(entry.source).toBe('eurlex');
      expect(entry.jurisdiction).toBe('EU');
      expect(entry.type).toBe('eu_directive');
    }
  });

  it('should have 2 Swiss laws', () => {
    const census = loadCensus();
    expect(census.ch.length).toBe(2);
    for (const entry of census.ch) {
      expect(entry.jurisdiction).toBe('CH');
      expect(entry.source).toBe('fedlex');
    }
  });

  it('should have 2 Austrian laws', () => {
    const census = loadCensus();
    expect(census.at.length).toBe(2);
    for (const entry of census.at) {
      expect(entry.jurisdiction).toBe('AT');
      expect(entry.source).toBe('ris');
    }
  });

  it('should have 5 German laws', () => {
    const census = loadCensus();
    expect(census.de.length).toBe(5);
    for (const entry of census.de) {
      expect(entry.jurisdiction).toBe('DE');
      expect(entry.source).toBe('gesetze_im_internet');
    }
  });

  it('should have all required fields in each entry', () => {
    const census = loadCensus();
    const allEntries = [...census.eu, ...census.ch, ...census.at, ...census.de];
    for (const entry of allEntries) {
      expect(entry.title).toBeTruthy();
      expect(entry.short_title).toBeTruthy();
      expect(entry.jurisdiction).toBeTruthy();
      expect(entry.type).toBeTruthy();
      expect(entry.source).toBeTruthy();
    }
  });
});

// ── Ingestion Helper Tests ──────────────────────────────────────────────────

describe('Ingestion Helpers', () => {
  it('should upsert directive and provisions into in-memory DB', async () => {
    const sqliteModule = await import('node-sqlite3-wasm');
    const Database = sqliteModule.Database;
    const db = new Database(':memory:');

    // Create schema
    db.exec(`
      CREATE TABLE directives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, short_title TEXT, jurisdiction TEXT NOT NULL,
        type TEXT NOT NULL, celex_number TEXT, effective_date TEXT,
        source_url TEXT, created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE provisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        directive_id INTEGER NOT NULL REFERENCES directives(id),
        article_number TEXT NOT NULL, title TEXT, body TEXT NOT NULL,
        search_text TEXT, UNIQUE(directive_id, article_number)
      );
      CREATE VIRTUAL TABLE provisions_fts USING fts5(
        article_number, title, body, search_text,
        content='provisions', content_rowid='id'
      );
    `);

    // Wrap in adapter interface
    const adapter = {
      query: <T extends Record<string, unknown>>(sql: string, params?: unknown[]): T[] => db.all(sql, params) as T[],
      queryOne: <T extends Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined => (db.get(sql, params) ?? undefined) as T | undefined,
      execute: (sql: string, params?: unknown[]) => { const r = db.run(sql, params); return { changes: r.changes }; },
      exec: (sql: string) => db.exec(sql),
      close: () => db.close(),
    };

    // Test upsertDirective
    const id1 = upsertDirective(adapter, {
      title: 'Test Directive',
      short_title: 'TEST/01',
      jurisdiction: 'EU',
      type: 'eu_directive',
      celex_number: '32014L9999',
      effective_date: '2014-01-01',
      source_url: 'https://example.com',
    });
    expect(id1).toBe(1);

    // Test idempotent upsert (same celex)
    const id2 = upsertDirective(adapter, {
      title: 'Test Directive Updated',
      short_title: 'TEST/01',
      jurisdiction: 'EU',
      type: 'eu_directive',
      celex_number: '32014L9999',
      effective_date: '2014-02-01',
      source_url: 'https://example.com/updated',
    });
    expect(id2).toBe(id1);

    // Test upsertProvisions
    const count = upsertProvisions(adapter, id1, [
      { article_number: '1', title: 'Scope', body: 'This directive covers procurement.' },
      { article_number: '2', title: 'Definitions', body: 'Definitions for this directive.' },
    ]);
    expect(count).toBe(2);

    // Verify provisions were inserted
    const provisions = adapter.query('SELECT * FROM provisions WHERE directive_id = ?', [id1]);
    expect(provisions.length).toBe(2);

    // Test idempotent provision upsert
    const count2 = upsertProvisions(adapter, id1, [
      { article_number: '1', title: 'Scope Updated', body: 'Updated scope text.' },
    ]);
    expect(count2).toBe(1);

    // Should still have 2 provisions, not 3
    const provisionsAfter = adapter.query('SELECT * FROM provisions WHERE directive_id = ?', [id1]);
    expect(provisionsAfter.length).toBe(2);

    adapter.close();
  });

  it('should rebuild FTS index', async () => {
    const sqliteModule = await import('node-sqlite3-wasm');
    const Database = sqliteModule.Database;
    const db = new Database(':memory:');

    db.exec(`
      CREATE TABLE directives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, short_title TEXT, jurisdiction TEXT NOT NULL,
        type TEXT NOT NULL, celex_number TEXT, effective_date TEXT,
        source_url TEXT, created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE provisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        directive_id INTEGER NOT NULL REFERENCES directives(id),
        article_number TEXT NOT NULL, title TEXT, body TEXT NOT NULL,
        search_text TEXT, UNIQUE(directive_id, article_number)
      );
      CREATE VIRTUAL TABLE provisions_fts USING fts5(
        article_number, title, body, search_text,
        content='provisions', content_rowid='id'
      );
    `);

    const adapter = {
      query: <T extends Record<string, unknown>>(sql: string, params?: unknown[]): T[] => db.all(sql, params) as T[],
      queryOne: <T extends Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined => (db.get(sql, params) ?? undefined) as T | undefined,
      execute: (sql: string, params?: unknown[]) => { const r = db.run(sql, params); return { changes: r.changes }; },
      exec: (sql: string) => db.exec(sql),
      close: () => db.close(),
    };

    // Insert test data
    adapter.execute(
      "INSERT INTO directives (title, short_title, jurisdiction, type) VALUES ('Test', 'TEST', 'EU', 'eu_directive')"
    );
    adapter.execute(
      "INSERT INTO provisions (directive_id, article_number, title, body, search_text) VALUES (1, '1', 'Scope', 'This covers procurement procedures.', 'scope procurement procedures')"
    );

    // Rebuild FTS
    rebuildFts(adapter);

    // Verify FTS works
    const results = adapter.query<{ article_number: string }>(
      "SELECT article_number FROM provisions_fts WHERE provisions_fts MATCH 'procurement'"
    );
    expect(results.length).toBe(1);
    expect(results[0].article_number).toBe('1');

    adapter.close();
  });
});
