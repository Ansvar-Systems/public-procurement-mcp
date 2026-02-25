/**
 * Test fixture: creates an in-memory SQLite database with realistic
 * public procurement data for unit testing all 10 legal knowledge tools.
 */

import type { DatabaseAdapter } from '../../src/database/adapter.js';

/**
 * Build an in-memory test database with schema + seed data.
 * Returns a DatabaseAdapter that callers must close() after use.
 */
export async function createTestDb(): Promise<DatabaseAdapter> {
  const sqliteModule = await import('node-sqlite3-wasm');
  const Database = sqliteModule.Database;
  const db = new Database(':memory:');

  // ── Schema ──────────────────────────────────────────────────────────────

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

    CREATE TABLE provisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      directive_id INTEGER NOT NULL REFERENCES directives(id),
      article_number TEXT NOT NULL,
      title TEXT,
      body TEXT NOT NULL,
      search_text TEXT,
      UNIQUE(directive_id, article_number)
    );

    CREATE VIRTUAL TABLE provisions_fts USING fts5(
      article_number, title, body, search_text,
      content='provisions', content_rowid='id'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER provisions_ai AFTER INSERT ON provisions BEGIN
      INSERT INTO provisions_fts(rowid, article_number, title, body, search_text)
      VALUES (new.id, new.article_number, new.title, new.body, new.search_text);
    END;
    CREATE TRIGGER provisions_ad AFTER DELETE ON provisions BEGIN
      INSERT INTO provisions_fts(provisions_fts, rowid, article_number, title, body, search_text)
      VALUES ('delete', old.id, old.article_number, old.title, old.body, old.search_text);
    END;
    CREATE TRIGGER provisions_au AFTER UPDATE ON provisions BEGIN
      INSERT INTO provisions_fts(provisions_fts, rowid, article_number, title, body, search_text)
      VALUES ('delete', old.id, old.article_number, old.title, old.body, old.search_text);
      INSERT INTO provisions_fts(rowid, article_number, title, body, search_text)
      VALUES (new.id, new.article_number, new.title, new.body, new.search_text);
    END;

    CREATE TABLE cpv_codes (
      code TEXT PRIMARY KEY,
      description_en TEXT NOT NULL,
      description_de TEXT,
      description_fr TEXT,
      parent_code TEXT,
      level INTEGER NOT NULL
    );

    CREATE TABLE nuts_regions (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      level INTEGER NOT NULL,
      country TEXT NOT NULL
    );

    CREATE TABLE thresholds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      directive_id INTEGER REFERENCES directives(id),
      category TEXT NOT NULL,
      value_eur REAL NOT NULL,
      effective_from TEXT NOT NULL,
      effective_to TEXT
    );

    CREATE TABLE procedure_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      directive_id INTEGER REFERENCES directives(id),
      conditions TEXT,
      min_candidates INTEGER,
      time_limits_json TEXT
    );

    CREATE TABLE exclusion_grounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      directive_id INTEGER REFERENCES directives(id),
      jurisdiction TEXT NOT NULL,
      type TEXT NOT NULL,
      ground TEXT NOT NULL,
      article_reference TEXT,
      description TEXT
    );
  `);

  // ── Seed data: Directives ───────────────────────────────────────────────

  db.exec(`
    INSERT INTO directives (id, title, short_title, jurisdiction, type, celex_number, effective_date, source_url) VALUES
    (1, 'Directive 2014/24/EU on public procurement', '2014/24/EU', 'EU', 'eu_directive', '32014L0024', '2014-02-26', 'https://eur-lex.europa.eu/eli/dir/2014/24/oj'),
    (2, 'Directive 2014/25/EU on procurement by entities in the water, energy, transport and postal services sectors', '2014/25/EU', 'EU', 'eu_directive', '32014L0025', '2014-02-26', 'https://eur-lex.europa.eu/eli/dir/2014/25/oj'),
    (3, 'Bundesgesetz ueber das oeffentliche Beschaffungswesen (BoeB)', 'BoeB', 'CH', 'national_law', NULL, '2019-06-21', 'https://www.fedlex.admin.ch/eli/cc/2020/126/de'),
    (4, 'Gesetz gegen Wettbewerbsbeschraenkungen (GWB) - Teil 4', 'GWB', 'DE', 'national_law', NULL, '2016-04-18', 'https://www.gesetze-im-internet.de/gwb/'),
    (5, 'Bundesvergabegesetz 2018 (BVergG 2018)', 'BVergG 2018', 'AT', 'national_law', NULL, '2018-08-21', 'https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=20010295');
  `);

  // ── Seed data: Provisions (20 articles across directives) ───────────────

  db.exec(`
    INSERT INTO provisions (directive_id, article_number, title, body, search_text) VALUES
    -- 2014/24/EU provisions
    (1, '1', 'Subject matter and scope', 'This Directive establishes rules on the procedures for procurement by contracting authorities with respect to public contracts as well as design contests, whose value is estimated to be not less than the thresholds laid down in Article 4.', 'subject matter scope procurement procedures contracting authorities public contracts design contests thresholds'),
    (1, '2', 'Definitions', 'For the purposes of this Directive, the following definitions apply: (1) "contracting authorities" means the State, regional or local authorities, bodies governed by public law or associations formed by one or more such authorities or one or more such bodies governed by public law; (2) "public contract" means a contract for pecuniary interest concluded in writing between one or more economic operators and one or more contracting authorities and having as their object the execution of works, the supply of products or the provision of services.', 'definitions contracting authorities public contract economic operators works supplies services'),
    (1, '18', 'Principles of procurement', 'Contracting authorities shall treat economic operators equally and without discrimination and shall act in a transparent and proportionate manner. The design of the procurement shall not be made with the intention of excluding it from the scope of this Directive or of artificially narrowing competition.', 'principles procurement equal treatment non-discrimination transparency proportionality competition'),
    (1, '26', 'Choice of procedures', 'When awarding public contracts, contracting authorities shall apply the national procedures adjusted to be in conformity with this Directive, provided that a call for competition has been published in accordance with this Directive.', 'choice procedures public contracts call for competition'),
    (1, '27', 'Open procedure', 'In open procedures, any interested economic operator may submit a tender in response to a call for competition. The minimum time limit for the receipt of tenders shall be 35 days from the date on which the contract notice was sent.', 'open procedure tender economic operator minimum time limit 35 days contract notice'),
    (1, '28', 'Restricted procedure', 'In restricted procedures, any economic operator may submit a request to participate in response to a call for competition. The minimum time limit for receipt of requests to participate shall be 30 days from the date on which the contract notice was sent. The minimum time limit for the receipt of tenders shall be 30 days from the date on which the invitation to tender was sent.', 'restricted procedure request to participate minimum time limit 30 days contract notice invitation to tender'),
    (1, '57', 'Exclusion grounds', 'Contracting authorities shall exclude an economic operator from participation in a procurement procedure where they have established that the economic operator has been convicted by final judgment for participation in a criminal organisation, corruption, fraud, terrorist offences or offences linked to terrorist activities, money laundering or terrorist financing, or child labour and other forms of trafficking in human beings.', 'exclusion grounds mandatory criminal organisation corruption fraud terrorist money laundering child labour trafficking'),
    (1, '58', 'Selection criteria', 'Selection criteria may relate to: (a) suitability to pursue the professional activity; (b) economic and financial standing; (c) technical and professional ability. Contracting authorities may only impose criteria referred to in paragraphs 1, 2 and 3 on economic operators as requirements for participation.', 'selection criteria suitability professional activity economic financial standing technical professional ability'),
    -- 2014/25/EU provisions
    (2, '1', 'Subject matter and scope', 'This Directive establishes rules on the procedures for procurement by contracting entities with respect to contracts whose estimated value is not less than the thresholds laid down in Article 15, for the pursuit of activities in the water, energy, transport and postal services sectors.', 'subject matter scope procurement utilities water energy transport postal services sectors thresholds'),
    (2, '36', 'Principles of procurement', 'Contracting entities shall treat economic operators equally and without discrimination and shall act in a transparent and proportionate manner.', 'principles procurement equal treatment non-discrimination transparency proportionality utilities'),
    (2, '44', 'Choice of procedures', 'Contracting entities may apply open, restricted or negotiated procedures with prior call for competition.', 'choice procedures open restricted negotiated prior call competition utilities'),
    (2, '80', 'Exclusion and selection', 'Contracting entities may apply the exclusion grounds provided for under Articles 57 and 58 of Directive 2014/24/EU, under the same conditions as set out therein.', 'exclusion selection criteria utilities directive 2014/24/EU cross-reference'),
    -- Swiss BoeB provisions
    (3, '1', 'Gegenstand und Zweck', 'Dieses Gesetz regelt die Beschaffung von Leistungen durch Auftraggeberinnen innerhalb und ausserhalb des Staatsvertragsbereichs. Es bezweckt den wirtschaftlichen und den nachhaltigen Einsatz oeffentlicher Mittel.', 'gegenstand zweck beschaffung leistungen auftraggeberinnen staatsvertragsbereich wirtschaftlich nachhaltig oeffentliche mittel'),
    (3, '21', 'Verfahrensarten', 'Die Auftraggeberin waehlt das offene oder das selektive Verfahren. Sie kann das Einladungsverfahren oder das freihändige Verfahren waehlen, wenn die Voraussetzungen nach den Artikeln 22 und 23 erfuellt sind.', 'verfahrensarten offenes selektives einladungsverfahren freihaendiges verfahren procurement procedures'),
    (3, '26', 'Ausschlussgründe und Sanktionen', 'Die Auftraggeberin schliesst eine Anbieterin von einem Vergabeverfahren aus, wenn diese insbesondere wegen Korruption, Betrug, Geldwaescherei oder anderen schweren Straftaten verurteilt wurde.', 'ausschlussgruende sanktionen korruption betrug geldwaescherei straftaten exclusion grounds'),
    -- German GWB provisions
    (4, '97', 'Grundsaetze der Vergabe', 'Oeffentliche Auftraege und Konzessionen werden im Wettbewerb und im Wege transparenter Verfahren vergeben. Dabei werden die Grundsaetze der Wirtschaftlichkeit und der Verhaeltnismaessigkeit gewahrt.', 'grundsaetze vergabe oeffentliche auftraege konzessionen wettbewerb transparenz wirtschaftlichkeit verhaeltnismaessigkeit procurement principles'),
    (4, '119', 'Verfahrensarten', 'Die Vergabe von oeffentlichen Auftraegen erfolgt im offenen Verfahren, im nicht offenen Verfahren, im Verhandlungsverfahren, im wettbewerblichen Dialog oder in der Innovationspartnerschaft.', 'verfahrensarten offenes nicht offenes verhandlungsverfahren wettbewerblicher dialog innovationspartnerschaft procedure types'),
    (4, '123', 'Zwingende Ausschlussgründe', 'Oeffentliche Auftraggeber schliessen ein Unternehmen von der Teilnahme an einem Vergabeverfahren aus, wenn sie Kenntnis davon haben, dass eine Person, die als fuer die Leitung des Unternehmens Verantwortlicher gehandelt hat, rechtskraeftig verurteilt worden ist wegen Bestechung, Betrug zu Lasten der EU, Terrorismus, Geldwaesche oder Menschenhandel.', 'zwingende ausschlussgruende bestechung betrug terrorismus geldwaesche menschenhandel mandatory exclusion grounds'),
    -- Austrian BVergG provisions
    (5, '1', 'Geltungsbereich', 'Dieses Bundesgesetz regelt die Vergabe von Auftraegen durch oeffentliche Auftraggeber und Sektorenauftraggeber.', 'geltungsbereich vergabe auftraege oeffentliche auftraggeber sektorenauftraggeber scope procurement'),
    (5, '78', 'Ausschlussgründe', 'Der oeffentliche Auftraggeber hat einen Unternehmer von der Teilnahme am Vergabeverfahren auszuschliessen, wenn der Unternehmer rechtskraeftig wegen Beteiligung an einer kriminellen Organisation, Korruption, Betrug, terroristischer Straftaten, Geldwaesche oder Menschenhandel verurteilt worden ist.', 'ausschlussgruende kriminelle organisation korruption betrug terrorismus geldwaesche menschenhandel exclusion grounds mandatory');
  `);

  // ── Seed data: CPV codes (30 codes with hierarchy) ──────────────────────

  db.exec(`
    INSERT INTO cpv_codes (code, description_en, description_de, description_fr, parent_code, level) VALUES
    ('45000000', 'Construction work', 'Bauarbeiten', 'Travaux de construction', NULL, 1),
    ('45200000', 'Works for complete or part construction and civil engineering work', 'Komplett- oder Teilbauleistungen im Hochbau sowie Tiefbauarbeiten', 'Travaux de construction complete ou partielle et travaux de genie civil', '45000000', 2),
    ('45210000', 'Building construction work', 'Bauleistungen im Hochbau', 'Travaux de construction de batiments', '45200000', 3),
    ('45300000', 'Building installation work', 'Bauinstallationsarbeiten', 'Travaux dinstallation dans les batiments', '45000000', 2),
    ('48000000', 'Software package and information systems', 'Softwarepaket und Informationssysteme', 'Logiciels et systemes dinformation', NULL, 1),
    ('48100000', 'Industry specific software package', 'Branchenspezifisches Softwarepaket', 'Progiciels pour lindustrie', '48000000', 2),
    ('48200000', 'Networking, Internet and intranet software package', 'Softwarepaket fuer Vernetzung, Internet und Intranet', 'Logiciels de reseau, Internet et intranet', '48000000', 2),
    ('48600000', 'Database and operating software package', 'Datenbank- und Betriebssoftwarepaket', 'Logiciels de bases de donnees et dexploitation', '48000000', 2),
    ('48700000', 'Software package utilities', 'Dienstprogramme fuer Softwarepakete', 'Utilitaires de progiciels', '48000000', 2),
    ('48800000', 'Information systems and servers', 'Informationssysteme und Server', 'Systemes et serveurs dinformation', '48000000', 2),
    ('72000000', 'IT services: consulting, software development, Internet and support', 'IT-Dienste: Beratung, Software-Entwicklung, Internet und Hilfestellung', 'Services de technologies de linformation, conseil, developpement de logiciels, Internet et assistance', NULL, 1),
    ('72100000', 'Hardware consultancy services', 'Hardware-Beratung', 'Services de conseil en materiel informatique', '72000000', 2),
    ('72200000', 'Software programming and consultancy services', 'Softwareprogrammierung und -beratung', 'Services de programmation et de conseil en logiciels', '72000000', 2),
    ('72210000', 'Programming services of packaged software products', 'Programmierung von Softwarepaketen', 'Services de programmation de progiciels', '72200000', 3),
    ('72220000', 'Systems and technical consultancy services', 'Systemberatung und technische Beratung', 'Services de conseil en systemes informatiques et conseils techniques', '72200000', 3),
    ('72230000', 'Custom software development services', 'Entwicklung von kundenspezifischer Software', 'Services de developpement de logiciels personnalises', '72200000', 3),
    ('72240000', 'Systems analysis and programming services', 'Systemanalyse und Programmierung', 'Services danalyse de systemes et de programmation', '72200000', 3),
    ('72250000', 'System and support services', 'Systemdienstleistungen und Unterstuetzungsdienste', 'Services de maintenance de systemes et services dassistance', '72200000', 3),
    ('72260000', 'Software-related services', 'Dienstleistungen in Verbindung mit Software', 'Services relatifs aux logiciels', '72200000', 3),
    ('72300000', 'Data services', 'Datendienste', 'Services de traitement de donnees', '72000000', 2),
    ('72400000', 'Internet services', 'Internetdienste', 'Services Internet', '72000000', 2),
    ('72500000', 'Computer-related services', 'Datenverarbeitungsdienste', 'Services informatiques', '72000000', 2),
    ('72600000', 'Computer support and consultancy services', 'Computerunterstuetzung und -beratung', 'Services dassistance et de conseil en informatique', '72000000', 2),
    ('72700000', 'Computer network services', 'Computernetzwerkdienste', 'Services de reseau informatique', '72000000', 2),
    ('72800000', 'Computer audit and testing services', 'Computeraudit und -testung', 'Services daudit et de test informatiques', '72000000', 2),
    ('72900000', 'Computer back-up and catalogue conversion services', 'Datensicherung und -konvertierung', 'Services de sauvegarde informatique et de conversion de catalogues', '72000000', 2),
    ('79000000', 'Business services: law, marketing, consulting, recruitment, printing and security', 'Unternehmens- und Managementberatung und zugehoerige Dienste', 'Services aux entreprises: droit, marketing, conseil, recrutement, impression et securite', NULL, 1),
    ('79100000', 'Legal services', 'Juristische Dienstleistungen', 'Services juridiques', '79000000', 2),
    ('79200000', 'Accounting, auditing and fiscal services', 'Buchfuehrung, Rechnungspruefung und Steuerwesen', 'Services de comptabilite, daudit et de fiscalite', '79000000', 2),
    ('79400000', 'Business and management consultancy and related services', 'Unternehmens- und Managementberatung und zugehoerige Dienste', 'Conseil en affaires et en gestion et services connexes', '79000000', 2);
  `);

  // ── Seed data: Thresholds ───────────────────────────────────────────────

  db.exec(`
    INSERT INTO thresholds (directive_id, category, value_eur, effective_from, effective_to) VALUES
    (1, 'supplies', 143000, '2024-01-01', NULL),
    (1, 'services', 143000, '2024-01-01', NULL),
    (1, 'works', 5538000, '2024-01-01', NULL),
    (1, 'social_services', 750000, '2024-01-01', NULL),
    (2, 'supplies', 443000, '2024-01-01', NULL),
    (2, 'services', 443000, '2024-01-01', NULL),
    (2, 'works', 5538000, '2024-01-01', NULL),
    (3, 'supplies', 230000, '2024-01-01', NULL),
    (3, 'services', 230000, '2024-01-01', NULL),
    (3, 'works', 8700000, '2024-01-01', NULL);
  `);

  // ── Seed data: Procedure types ──────────────────────────────────────────

  db.exec(`
    INSERT INTO procedure_types (name, directive_id, conditions, min_candidates, time_limits_json) VALUES
    ('Open procedure', 1, 'Any interested economic operator may submit a tender. Used for standard above-threshold procurement.', NULL, '{"tender_receipt": 35, "accelerated": 15}'),
    ('Restricted procedure', 1, 'Any economic operator may request to participate; only invited candidates submit tenders.', 5, '{"request_to_participate": 30, "tender_receipt": 30, "accelerated_request": 15, "accelerated_tender": 10}'),
    ('Competitive procedure with negotiation', 1, 'Contracting authority negotiates with selected candidates. Requires justification under Art. 26(4).', 3, '{"request_to_participate": 30, "tender_receipt": 30}'),
    ('Competitive dialogue', 1, 'For complex contracts. Authority dialogues with candidates to develop solutions.', 3, '{"request_to_participate": 30}'),
    ('Innovation partnership', 1, 'For development of innovative products/services not available on the market.', 3, '{"request_to_participate": 30}'),
    ('Open procedure', 2, 'Any interested economic operator may submit a tender for utilities procurement.', NULL, '{"tender_receipt": 35, "accelerated": 15}'),
    ('Negotiated procedure with prior call for competition', 2, 'Utilities may use negotiated procedure with prior publication.', 3, '{"request_to_participate": 30}'),
    ('Open procedure (offenes Verfahren)', 3, 'Standard procedure under Swiss procurement law (BoeB Art. 21).', NULL, '{"tender_receipt": 40}'),
    ('Selective procedure (selektives Verfahren)', 3, 'Two-stage procedure under Swiss procurement law.', NULL, '{"request_to_participate": 25, "tender_receipt": 40}');
  `);

  // ── Seed data: Exclusion grounds ────────────────────────────────────────

  db.exec(`
    INSERT INTO exclusion_grounds (directive_id, jurisdiction, type, ground, article_reference, description) VALUES
    (1, 'EU', 'mandatory', 'Participation in a criminal organisation', 'Art. 57(1)(a)', 'Conviction by final judgment for participation in a criminal organisation as defined in Article 2 of Council Framework Decision 2008/841/JHA.'),
    (1, 'EU', 'mandatory', 'Corruption', 'Art. 57(1)(b)', 'Conviction by final judgment for corruption as defined in Article 3 of the Convention on the fight against corruption.'),
    (1, 'EU', 'mandatory', 'Fraud', 'Art. 57(1)(c)', 'Conviction by final judgment for fraud within the meaning of Article 1 of the Convention on the protection of the European Communities financial interests.'),
    (1, 'EU', 'mandatory', 'Terrorist offences', 'Art. 57(1)(d)', 'Conviction by final judgment for terrorist offences or offences linked to terrorist activities.'),
    (1, 'EU', 'mandatory', 'Money laundering or terrorist financing', 'Art. 57(1)(e)', 'Conviction by final judgment for money laundering or terrorist financing.'),
    (1, 'EU', 'mandatory', 'Child labour and trafficking', 'Art. 57(1)(f)', 'Conviction by final judgment for child labour and other forms of trafficking in human beings.'),
    (1, 'EU', 'discretionary', 'Bankruptcy or insolvency', 'Art. 57(4)(b)', 'The economic operator is bankrupt or subject to insolvency or winding-up proceedings.'),
    (1, 'EU', 'discretionary', 'Grave professional misconduct', 'Art. 57(4)(c)', 'The contracting authority can demonstrate grave professional misconduct rendering integrity questionable.'),
    (1, 'EU', 'discretionary', 'Distortion of competition', 'Art. 57(4)(d)', 'The contracting authority has sufficiently plausible indications that the economic operator has entered into agreements with other economic operators aimed at distorting competition.'),
    (1, 'EU', 'discretionary', 'Conflict of interest', 'Art. 57(4)(e)', 'A conflict of interest within the meaning of Article 24 cannot be effectively remedied by other less intrusive measures.'),
    (3, 'CH', 'mandatory', 'Korruption (Corruption)', 'Art. 26(1)(a) BoeB', 'Conviction for corruption, fraud, money laundering or other serious criminal offences under Swiss law.'),
    (3, 'CH', 'discretionary', 'Insolvenz (Insolvency)', 'Art. 26(1)(b) BoeB', 'The tenderer is subject to insolvency or debt restructuring proceedings.');
  `);

  // ── Build the adapter ───────────────────────────────────────────────────

  const adapter: DatabaseAdapter = {
    query<T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      params?: unknown[]
    ): T[] {
      try {
        return db.all(sql, params) as T[];
      } catch (error) {
        throw new Error(
          `Query failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },

    queryOne<T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      params?: unknown[]
    ): T | undefined {
      try {
        const result = db.get(sql, params);
        return (result ?? undefined) as T | undefined;
      } catch (error) {
        throw new Error(
          `Query failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },

    execute(sql: string, params?: unknown[]): { changes: number } {
      try {
        const result = db.run(sql, params);
        return { changes: result.changes };
      } catch (error) {
        throw new Error(
          `Execute failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },

    exec(sql: string): void {
      db.exec(sql);
    },

    close(): void {
      db.close();
    },
  };

  return adapter;
}
