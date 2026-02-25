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

  // ── Seed data: Notices (100 sample award notices) ─────────────────────
  // Schema: notices(id, ted_id, notice_type, publication_date, buyer_id, buyer_name, buyer_nuts,
  //   cpv_main, cpv_additional, title, description, procedure_type, value_estimated, value_awarded,
  //   currency, winner_name, winner_country, num_tenders_received, award_criteria_type,
  //   contract_duration_months, framework_agreement, original_language, deadline, created_at)

  db.exec(`
    CREATE TABLE IF NOT EXISTS notices (
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

    CREATE INDEX IF NOT EXISTS idx_notices_cpv ON notices(cpv_main);
    CREATE INDEX IF NOT EXISTS idx_notices_buyer ON notices(buyer_id);
    CREATE INDEX IF NOT EXISTS idx_notices_winner ON notices(winner_name);
    CREATE INDEX IF NOT EXISTS idx_notices_date ON notices(publication_date);
    CREATE INDEX IF NOT EXISTS idx_notices_type ON notices(notice_type);
    CREATE INDEX IF NOT EXISTS idx_notices_nuts ON notices(buyer_nuts);

    CREATE TABLE IF NOT EXISTS buyer_profiles (
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

    CREATE TABLE IF NOT EXISTS cpv_benchmarks (
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

  // Insert 100 sample award notices with realistic data
  db.exec(`
    INSERT INTO notices (ted_id, notice_type, publication_date, buyer_id, buyer_name, buyer_nuts, cpv_main, cpv_additional, title, description, procedure_type, value_estimated, value_awarded, currency, winner_name, winner_country, num_tenders_received, award_criteria_type, contract_duration_months, framework_agreement, original_language, deadline) VALUES
    -- German buyers, IT services (72 prefix)
    ('2024/S 001-000001', 'contract_award', '2024-01-15', 'BUY-DE-001', 'Bundesamt fuer Sicherheit in der Informationstechnik', 'DE300', '72200000', '72210000', 'IT Security Consulting', 'Cybersecurity advisory services', 'Open procedure', 500000, 480000, 'EUR', 'SecurIT GmbH', 'DE', 5, 'best_value', 24, 0, 'de', '2024-01-05'),
    ('2024/S 001-000002', 'contract_award', '2024-02-20', 'BUY-DE-001', 'Bundesamt fuer Sicherheit in der Informationstechnik', 'DE300', '72230000', NULL, 'Custom Software Development', 'Development of security platform', 'Restricted procedure', 2000000, 1850000, 'EUR', 'Siemens AG', 'DE', 8, 'best_value', 36, 0, 'de', '2024-02-10'),
    ('2024/S 001-000003', 'contract_award', '2024-03-10', 'BUY-DE-001', 'Bundesamt fuer Sicherheit in der Informationstechnik', 'DE300', '72220000', NULL, 'Systems Consultancy', 'Technical architecture consultancy', 'Open procedure', 300000, 275000, 'EUR', 'Capgemini Deutschland', 'DE', 4, 'best_value', 12, 0, 'de', '2024-02-28'),
    ('2024/S 001-000004', 'contract_award', '2024-04-05', 'BUY-DE-002', 'Stadt Muenchen', 'DE212', '72200000', NULL, 'IT Consulting Services', 'Digital transformation consulting', 'Open procedure', 750000, 720000, 'EUR', 'Accenture GmbH', 'DE', 6, 'best_value', 24, 0, 'de', '2024-03-25'),
    ('2024/S 001-000005', 'contract_award', '2024-04-15', 'BUY-DE-002', 'Stadt Muenchen', 'DE212', '48000000', '48200000', 'Enterprise Software Licenses', 'Office and collaboration software', 'Open procedure', 1200000, 1100000, 'EUR', 'Microsoft Deutschland', 'DE', 3, 'lowest_price', 48, 1, 'de', '2024-04-01'),
    ('2024/S 001-000006', 'contract_award', '2024-05-20', 'BUY-DE-002', 'Stadt Muenchen', 'DE212', '72250000', NULL, 'System Support Services', 'Ongoing IT support and maintenance', 'Open procedure', 400000, 380000, 'EUR', 'SecurIT GmbH', 'DE', 7, 'best_value', 36, 1, 'de', '2024-05-10'),
    ('2024/S 001-000007', 'contract_award', '2024-06-01', 'BUY-DE-003', 'Deutsche Bahn AG', 'DE300', '72200000', NULL, 'Railway IT Modernization', 'Modernization of ticketing systems', 'Restricted procedure', 5000000, 4800000, 'EUR', 'SAP SE', 'DE', 4, 'best_value', 48, 0, 'de', '2024-05-20'),
    ('2024/S 001-000008', 'contract_award', '2024-06-15', 'BUY-DE-003', 'Deutsche Bahn AG', 'DE300', '72230000', NULL, 'Mobile App Development', 'Passenger mobile application', 'Competitive dialogue', 3000000, 2900000, 'EUR', 'Capgemini Deutschland', 'DE', 6, 'best_value', 24, 0, 'de', '2024-06-01'),
    ('2024/S 001-000009', 'contract_award', '2024-07-10', 'BUY-DE-003', 'Deutsche Bahn AG', 'DE300', '72800000', NULL, 'IT Security Audit', 'Penetration testing and security audit', 'Open procedure', 200000, 185000, 'EUR', 'SecurIT GmbH', 'DE', 9, 'best_value', 6, 0, 'de', '2024-06-30'),
    ('2024/S 001-000010', 'contract_award', '2024-07-25', 'BUY-DE-004', 'Universitaet Heidelberg', 'DE125', '72200000', NULL, 'Research Computing Services', 'HPC cluster management', 'Open procedure', 600000, 550000, 'EUR', 'Atos SE', 'DE', 3, 'best_value', 36, 0, 'de', '2024-07-15'),

    -- Austrian buyers, mixed CPV
    ('2024/S 002-000001', 'contract_award', '2024-01-20', 'BUY-AT-001', 'Bundesrechenzentrum GmbH', 'AT130', '72200000', NULL, 'Cloud Infrastructure Services', 'Government cloud hosting', 'Open procedure', 800000, 750000, 'EUR', 'A1 Telekom Austria', 'AT', 4, 'best_value', 48, 1, 'de', '2024-01-10'),
    ('2024/S 002-000002', 'contract_award', '2024-02-15', 'BUY-AT-001', 'Bundesrechenzentrum GmbH', 'AT130', '72230000', NULL, 'E-Government Portal Development', 'Citizen service portal development', 'Restricted procedure', 1500000, 1400000, 'EUR', 'Siemens AG', 'AT', 5, 'best_value', 24, 0, 'de', '2024-02-05'),
    ('2024/S 002-000003', 'contract_award', '2024-03-25', 'BUY-AT-001', 'Bundesrechenzentrum GmbH', 'AT130', '48600000', NULL, 'Database Software Licenses', 'Enterprise database platform', 'Open procedure', 500000, 480000, 'EUR', 'Oracle Austria', 'AT', 2, 'lowest_price', 36, 0, 'de', '2024-03-15'),
    ('2024/S 002-000004', 'contract_award', '2024-04-10', 'BUY-AT-002', 'Stadt Wien', 'AT130', '72200000', NULL, 'Smart City Consulting', 'Smart city strategy consulting', 'Open procedure', 350000, 320000, 'EUR', 'Accenture GmbH', 'AT', 6, 'best_value', 18, 0, 'de', '2024-03-30'),
    ('2024/S 002-000005', 'contract_award', '2024-05-05', 'BUY-AT-002', 'Stadt Wien', 'AT130', '72250000', NULL, 'IT Support Framework', 'Multi-vendor IT support agreement', 'Open procedure', 900000, 850000, 'EUR', 'Kapsch BusinessCom', 'AT', 8, 'best_value', 48, 1, 'de', '2024-04-25'),
    ('2024/S 002-000006', 'contract_award', '2024-06-20', 'BUY-AT-002', 'Stadt Wien', 'AT130', '72800000', NULL, 'Cybersecurity Assessment', 'Security audit and compliance check', 'Open procedure', 150000, 140000, 'EUR', 'SecurIT GmbH', 'AT', 5, 'best_value', 6, 0, 'de', '2024-06-10'),
    ('2024/S 002-000007', 'contract_award', '2024-07-15', 'BUY-AT-003', 'Oesterreichische Bundesbahnen', 'AT130', '72200000', NULL, 'Railway Ticketing Platform', 'Online ticketing system', 'Restricted procedure', 2500000, 2300000, 'EUR', 'Siemens AG', 'AT', 4, 'best_value', 36, 0, 'de', '2024-07-05'),
    ('2024/S 002-000008', 'contract_award', '2024-08-01', 'BUY-AT-003', 'Oesterreichische Bundesbahnen', 'AT130', '72230000', NULL, 'Mobile Ticketing App', 'Mobile application development', 'Open procedure', 800000, 760000, 'EUR', 'Kapsch BusinessCom', 'AT', 5, 'best_value', 18, 0, 'de', '2024-07-22'),

    -- Swiss buyers
    ('2024/S 003-000001', 'contract_award', '2024-01-25', 'BUY-CH-001', 'Bundesamt fuer Informatik und Telekommunikation', 'CH011', '72200000', NULL, 'IT Strategy Consulting', 'Federal IT strategy development', 'Open procedure', 400000, 380000, 'CHF', 'Deloitte AG', 'CH', 4, 'best_value', 12, 0, 'de', '2024-01-15'),
    ('2024/S 003-000002', 'contract_award', '2024-03-15', 'BUY-CH-001', 'Bundesamt fuer Informatik und Telekommunikation', 'CH011', '72230000', NULL, 'Government Platform Development', 'Citizen services platform', 'Selective procedure', 3000000, 2800000, 'CHF', 'Swisscom IT Services', 'CH', 6, 'best_value', 36, 0, 'de', '2024-03-05'),
    ('2024/S 003-000003', 'contract_award', '2024-05-10', 'BUY-CH-001', 'Bundesamt fuer Informatik und Telekommunikation', 'CH011', '72800000', NULL, 'IT Security Testing', 'Penetration testing services', 'Open procedure', 200000, 190000, 'CHF', 'SecurIT GmbH', 'CH', 7, 'best_value', 12, 0, 'de', '2024-04-30'),
    ('2024/S 003-000004', 'contract_award', '2024-06-25', 'BUY-CH-002', 'ETH Zurich', 'CH040', '72200000', NULL, 'Research Computing Infrastructure', 'HPC infrastructure management', 'Open procedure', 1000000, 950000, 'CHF', 'Atos SE', 'CH', 3, 'best_value', 48, 0, 'de', '2024-06-15'),
    ('2024/S 003-000005', 'contract_award', '2024-07-20', 'BUY-CH-002', 'ETH Zurich', 'CH040', '48600000', NULL, 'Scientific Database Platform', 'Research data management system', 'Open procedure', 500000, 470000, 'CHF', 'Oracle Austria', 'CH', 2, 'lowest_price', 24, 0, 'de', '2024-07-10'),

    -- EU institution buyers
    ('2024/S 004-000001', 'contract_award', '2024-02-01', 'BUY-EU-001', 'European Commission - DG DIGIT', 'BE100', '72200000', NULL, 'IT Service Management', 'ITSM framework implementation', 'Open procedure', 2000000, 1900000, 'EUR', 'Capgemini Deutschland', 'BE', 7, 'best_value', 48, 1, 'en', '2024-01-20'),
    ('2024/S 004-000002', 'contract_award', '2024-03-20', 'BUY-EU-001', 'European Commission - DG DIGIT', 'BE100', '72230000', NULL, 'EU Portal Development', 'Citizens portal development', 'Restricted procedure', 4000000, 3800000, 'EUR', 'Accenture GmbH', 'BE', 5, 'best_value', 36, 0, 'en', '2024-03-10'),
    ('2024/S 004-000003', 'contract_award', '2024-05-15', 'BUY-EU-001', 'European Commission - DG DIGIT', 'BE100', '72800000', NULL, 'Cybersecurity Services', 'CERT and SOC services', 'Restricted procedure', 3000000, 2850000, 'EUR', 'SecurIT GmbH', 'BE', 4, 'best_value', 36, 0, 'en', '2024-05-05'),
    ('2024/S 004-000004', 'contract_award', '2024-06-10', 'BUY-EU-002', 'European Parliament', 'BE100', '72200000', NULL, 'Digital Workplace Services', 'Collaboration tools and support', 'Open procedure', 1500000, 1400000, 'EUR', 'Atos SE', 'BE', 6, 'best_value', 48, 1, 'en', '2024-05-30'),
    ('2024/S 004-000005', 'contract_award', '2024-07-05', 'BUY-EU-002', 'European Parliament', 'BE100', '48000000', NULL, 'Document Management System', 'Enterprise DMS implementation', 'Open procedure', 800000, 750000, 'EUR', 'SAP SE', 'BE', 4, 'lowest_price', 24, 0, 'en', '2024-06-25'),

    -- Construction and works contracts
    ('2024/S 005-000001', 'contract_award', '2024-01-30', 'BUY-DE-002', 'Stadt Muenchen', 'DE212', '45210000', NULL, 'School Construction', 'New school building construction', 'Open procedure', 8000000, 7500000, 'EUR', 'HOCHTIEF AG', 'DE', 5, 'best_value', 24, 0, 'de', '2024-01-20'),
    ('2024/S 005-000002', 'contract_award', '2024-03-05', 'BUY-DE-002', 'Stadt Muenchen', 'DE212', '45300000', NULL, 'Building Installation Works', 'Electrical and HVAC installation', 'Open procedure', 3000000, 2800000, 'EUR', 'Imtech Deutschland', 'DE', 7, 'lowest_price', 18, 0, 'de', '2024-02-23'),
    ('2024/S 005-000003', 'contract_award', '2024-04-20', 'BUY-AT-002', 'Stadt Wien', 'AT130', '45210000', NULL, 'Hospital Extension', 'Hospital wing construction', 'Restricted procedure', 15000000, 14200000, 'EUR', 'STRABAG SE', 'AT', 4, 'best_value', 36, 0, 'de', '2024-04-10'),
    ('2024/S 005-000004', 'contract_award', '2024-06-05', 'BUY-AT-002', 'Stadt Wien', 'AT130', '45200000', NULL, 'Bridge Rehabilitation', 'Danube bridge structural repair', 'Open procedure', 6000000, 5700000, 'EUR', 'PORR AG', 'AT', 3, 'lowest_price', 18, 0, 'de', '2024-05-25'),

    -- Legal/consulting services
    ('2024/S 006-000001', 'contract_award', '2024-02-10', 'BUY-DE-001', 'Bundesamt fuer Sicherheit in der Informationstechnik', 'DE300', '79100000', NULL, 'Legal Advisory Services', 'Data protection legal advisory', 'Open procedure', 300000, 280000, 'EUR', 'CMS Hasche Sigle', 'DE', 4, 'best_value', 24, 1, 'de', '2024-01-30'),
    ('2024/S 006-000002', 'contract_award', '2024-04-25', 'BUY-AT-001', 'Bundesrechenzentrum GmbH', 'AT130', '79400000', NULL, 'Management Consulting', 'IT governance consulting', 'Open procedure', 250000, 230000, 'EUR', 'McKinsey Austria', 'AT', 3, 'best_value', 12, 0, 'de', '2024-04-15'),

    -- Notices from 2023 (older data for history/benchmarking)
    ('2023/S 001-000001', 'contract_award', '2023-02-15', 'BUY-DE-001', 'Bundesamt fuer Sicherheit in der Informationstechnik', 'DE300', '72200000', NULL, 'IT Consulting 2023', 'Annual IT consulting contract', 'Open procedure', 450000, 420000, 'EUR', 'SecurIT GmbH', 'DE', 6, 'best_value', 12, 0, 'de', '2023-02-05'),
    ('2023/S 001-000002', 'contract_award', '2023-05-20', 'BUY-DE-001', 'Bundesamt fuer Sicherheit in der Informationstechnik', 'DE300', '72230000', NULL, 'Software Development 2023', 'Custom development project', 'Restricted procedure', 1800000, 1700000, 'EUR', 'Capgemini Deutschland', 'DE', 5, 'best_value', 24, 0, 'de', '2023-05-10'),
    ('2023/S 001-000003', 'contract_award', '2023-08-10', 'BUY-DE-002', 'Stadt Muenchen', 'DE212', '72200000', NULL, 'Digital Services 2023', 'Digital transformation project', 'Open procedure', 650000, 620000, 'EUR', 'Accenture GmbH', 'DE', 4, 'best_value', 18, 0, 'de', '2023-07-31'),
    ('2023/S 001-000004', 'contract_award', '2023-09-05', 'BUY-DE-003', 'Deutsche Bahn AG', 'DE300', '72200000', NULL, 'IT Infrastructure 2023', 'Network infrastructure upgrade', 'Open procedure', 4000000, 3800000, 'EUR', 'Atos SE', 'DE', 5, 'best_value', 36, 0, 'de', '2023-08-25'),
    ('2023/S 001-000005', 'contract_award', '2023-10-20', 'BUY-AT-001', 'Bundesrechenzentrum GmbH', 'AT130', '72200000', NULL, 'Cloud Services 2023', 'Government cloud migration', 'Open procedure', 700000, 650000, 'EUR', 'A1 Telekom Austria', 'AT', 3, 'best_value', 24, 1, 'de', '2023-10-10'),
    ('2023/S 001-000006', 'contract_award', '2023-11-15', 'BUY-AT-002', 'Stadt Wien', 'AT130', '72200000', NULL, 'Smart City Phase 2', 'Smart city platform upgrade', 'Open procedure', 400000, 370000, 'EUR', 'Kapsch BusinessCom', 'AT', 5, 'best_value', 12, 0, 'de', '2023-11-05'),
    ('2023/S 001-000007', 'contract_award', '2023-03-15', 'BUY-CH-001', 'Bundesamt fuer Informatik und Telekommunikation', 'CH011', '72200000', NULL, 'Federal IT Services 2023', 'Annual IT support contract', 'Open procedure', 350000, 330000, 'CHF', 'Swisscom IT Services', 'CH', 4, 'best_value', 12, 0, 'de', '2023-03-05'),
    ('2023/S 001-000008', 'contract_award', '2023-06-25', 'BUY-EU-001', 'European Commission - DG DIGIT', 'BE100', '72200000', NULL, 'IT Framework Contract 2023', 'IT services framework', 'Open procedure', 1800000, 1700000, 'EUR', 'Capgemini Deutschland', 'BE', 6, 'best_value', 48, 1, 'en', '2023-06-15'),

    -- Framework agreements (additional)
    ('2024/S 007-000001', 'contract_award', '2024-02-25', 'BUY-DE-001', 'Bundesamt fuer Sicherheit in der Informationstechnik', 'DE300', '72200000', NULL, 'IT Security Framework Agreement', 'Multi-year security services framework', 'Open procedure', 2000000, 1900000, 'EUR', 'SecurIT GmbH', 'DE', 8, 'best_value', 48, 1, 'de', '2024-02-15'),
    ('2024/S 007-000002', 'contract_award', '2024-03-30', 'BUY-DE-003', 'Deutsche Bahn AG', 'DE300', '72230000', NULL, 'Software Development Framework', 'Ongoing dev services framework', 'Open procedure', 10000000, 9500000, 'EUR', 'SAP SE', 'DE', 5, 'best_value', 48, 1, 'de', '2024-03-20'),
    ('2024/S 007-000003', 'contract_award', '2024-05-25', 'BUY-AT-002', 'Stadt Wien', 'AT130', '72200000', NULL, 'IT Services Framework Wien', 'Citywide IT services framework', 'Open procedure', 3000000, 2800000, 'EUR', 'Kapsch BusinessCom', 'AT', 6, 'best_value', 48, 1, 'de', '2024-05-15'),
    ('2024/S 007-000004', 'contract_award', '2024-06-30', 'BUY-EU-001', 'European Commission - DG DIGIT', 'BE100', '72230000', NULL, 'Software Dev Framework EC', 'Development services framework', 'Restricted procedure', 5000000, 4700000, 'EUR', 'Accenture GmbH', 'BE', 4, 'best_value', 48, 1, 'en', '2024-06-20'),

    -- Contract notices (pending, no winner yet)
    ('2024/S 008-000001', 'contract_notice', '2024-08-01', 'BUY-DE-001', 'Bundesamt fuer Sicherheit in der Informationstechnik', 'DE300', '72200000', NULL, 'IT Security Services 2025', 'Next generation security services', 'Open procedure', 600000, NULL, 'EUR', NULL, NULL, NULL, 'best_value', 24, 0, 'de', '2024-09-15'),
    ('2024/S 008-000002', 'contract_notice', '2024-08-10', 'BUY-AT-001', 'Bundesrechenzentrum GmbH', 'AT130', '72230000', NULL, 'Digital Government 2025', 'Next digital government platform', 'Open procedure', 2000000, NULL, 'EUR', NULL, NULL, NULL, 'best_value', 36, 0, 'de', '2024-09-20'),

    -- More IT services in DE for benchmarking
    ('2024/S 009-000001', 'contract_award', '2024-01-10', 'BUY-DE-005', 'Landesamt fuer Digitalisierung Bayern', 'DE212', '72200000', NULL, 'Digital Services Bayern', 'State digital transformation', 'Open procedure', 900000, 850000, 'EUR', 'Accenture GmbH', 'DE', 5, 'best_value', 24, 0, 'de', '2023-12-30'),
    ('2024/S 009-000002', 'contract_award', '2024-02-05', 'BUY-DE-005', 'Landesamt fuer Digitalisierung Bayern', 'DE212', '72220000', NULL, 'Systems Consulting Bayern', 'Technical systems advisory', 'Open procedure', 400000, 370000, 'EUR', 'Capgemini Deutschland', 'DE', 4, 'best_value', 12, 0, 'de', '2024-01-25'),
    ('2024/S 009-000003', 'contract_award', '2024-03-12', 'BUY-DE-006', 'Polizei Berlin', 'DE300', '72200000', NULL, 'Police IT Modernization', 'Law enforcement IT systems', 'Restricted procedure', 3000000, 2850000, 'EUR', 'Atos SE', 'DE', 3, 'best_value', 36, 0, 'de', '2024-03-02'),
    ('2024/S 009-000004', 'contract_award', '2024-04-08', 'BUY-DE-006', 'Polizei Berlin', 'DE300', '72800000', NULL, 'Security Testing Services', 'Annual security assessment', 'Open procedure', 150000, 140000, 'EUR', 'SecurIT GmbH', 'DE', 6, 'best_value', 12, 0, 'de', '2024-03-28'),
    ('2024/S 009-000005', 'contract_award', '2024-05-03', 'BUY-DE-007', 'Charité Universitaetsmedizin', 'DE300', '72200000', NULL, 'Hospital IT Services', 'Healthcare IT management', 'Open procedure', 700000, 660000, 'EUR', 'Siemens AG', 'DE', 4, 'best_value', 24, 0, 'de', '2024-04-22'),
    ('2024/S 009-000006', 'contract_award', '2024-05-18', 'BUY-DE-007', 'Charité Universitaetsmedizin', 'DE300', '48800000', NULL, 'Information Systems', 'Healthcare information system', 'Restricted procedure', 2000000, 1900000, 'EUR', 'SAP SE', 'DE', 3, 'best_value', 36, 0, 'de', '2024-05-08'),
    ('2024/S 009-000007', 'contract_award', '2024-06-22', 'BUY-DE-008', 'Bundesanstalt fuer Landwirtschaft', 'DE300', '72200000', NULL, 'Agricultural Data Platform', 'Data analytics platform', 'Open procedure', 500000, 470000, 'EUR', 'Atos SE', 'DE', 5, 'best_value', 18, 0, 'de', '2024-06-12'),

    -- More AT awards for benchmarking
    ('2024/S 010-000001', 'contract_award', '2024-02-28', 'BUY-AT-004', 'Magistrat Graz', 'AT221', '72200000', NULL, 'City IT Services Graz', 'Municipal IT services', 'Open procedure', 300000, 280000, 'EUR', 'Kapsch BusinessCom', 'AT', 4, 'best_value', 12, 0, 'de', '2024-02-18'),
    ('2024/S 010-000002', 'contract_award', '2024-04-15', 'BUY-AT-004', 'Magistrat Graz', 'AT221', '72230000', NULL, 'E-Government Graz', 'Municipal e-government portal', 'Open procedure', 600000, 560000, 'EUR', 'A1 Telekom Austria', 'AT', 5, 'best_value', 24, 0, 'de', '2024-04-05'),
    ('2024/S 010-000003', 'contract_award', '2024-06-08', 'BUY-AT-005', 'Medizinische Universitaet Wien', 'AT130', '72200000', NULL, 'Research IT Infrastructure', 'University research computing', 'Open procedure', 450000, 420000, 'EUR', 'Atos SE', 'AT', 3, 'best_value', 24, 0, 'de', '2024-05-28'),
    ('2024/S 010-000004', 'contract_award', '2024-07-22', 'BUY-AT-005', 'Medizinische Universitaet Wien', 'AT130', '48600000', NULL, 'Medical Database System', 'Patient data management', 'Restricted procedure', 1200000, 1100000, 'EUR', 'Oracle Austria', 'AT', 2, 'best_value', 36, 0, 'de', '2024-07-12'),

    -- 2023 additional awards for year-range testing
    ('2023/S 002-000001', 'contract_award', '2023-01-20', 'BUY-DE-002', 'Stadt Muenchen', 'DE212', '72200000', NULL, 'IT Services Muenchen 2023', 'Annual IT services', 'Open procedure', 500000, 470000, 'EUR', 'Siemens AG', 'DE', 5, 'best_value', 12, 0, 'de', '2023-01-10'),
    ('2023/S 002-000002', 'contract_award', '2023-04-15', 'BUY-DE-003', 'Deutsche Bahn AG', 'DE300', '72230000', NULL, 'DB Platform Dev 2023', 'Platform development project', 'Restricted procedure', 3500000, 3300000, 'EUR', 'SAP SE', 'DE', 4, 'best_value', 24, 0, 'de', '2023-04-05'),
    ('2023/S 002-000003', 'contract_award', '2023-07-10', 'BUY-AT-002', 'Stadt Wien', 'AT130', '72200000', NULL, 'Wien Digital Services 2023', 'Digital services contract', 'Open procedure', 350000, 320000, 'EUR', 'A1 Telekom Austria', 'AT', 4, 'best_value', 12, 0, 'de', '2023-06-30'),
    ('2023/S 002-000004', 'contract_award', '2023-09-20', 'BUY-CH-002', 'ETH Zurich', 'CH040', '72200000', NULL, 'ETH IT Services 2023', 'University IT services', 'Open procedure', 800000, 750000, 'CHF', 'Swisscom IT Services', 'CH', 3, 'best_value', 12, 0, 'de', '2023-09-10'),

    -- Competitor diversity - more winners
    ('2024/S 011-000001', 'contract_award', '2024-03-18', 'BUY-DE-004', 'Universitaet Heidelberg', 'DE125', '72230000', NULL, 'University Portal Development', 'Student portal modernization', 'Open procedure', 400000, 370000, 'EUR', 'T-Systems International', 'DE', 5, 'best_value', 18, 0, 'de', '2024-03-08'),
    ('2024/S 011-000002', 'contract_award', '2024-04-22', 'BUY-DE-005', 'Landesamt fuer Digitalisierung Bayern', 'DE212', '72800000', NULL, 'Bavaria Security Assessment', 'State IT security assessment', 'Open procedure', 180000, 165000, 'EUR', 'SecurIT GmbH', 'DE', 7, 'best_value', 6, 0, 'de', '2024-04-12'),
    ('2024/S 011-000003', 'contract_award', '2024-05-30', 'BUY-DE-008', 'Bundesanstalt fuer Landwirtschaft', 'DE300', '48000000', NULL, 'AgriData Software', 'Agricultural data analysis software', 'Open procedure', 300000, 280000, 'EUR', 'SAP SE', 'DE', 3, 'lowest_price', 24, 0, 'de', '2024-05-20'),
    ('2024/S 011-000004', 'contract_award', '2024-06-18', 'BUY-CH-002', 'ETH Zurich', 'CH040', '72230000', NULL, 'Research Platform Dev', 'Scientific data platform', 'Selective procedure', 1500000, 1400000, 'CHF', 'Swisscom IT Services', 'CH', 4, 'best_value', 24, 0, 'de', '2024-06-08'),

    -- Older contracts (2022) for renewal forecast testing (shorter duration)
    ('2022/S 001-000001', 'contract_award', '2022-03-15', 'BUY-DE-001', 'Bundesamt fuer Sicherheit in der Informationstechnik', 'DE300', '72200000', NULL, 'BSI IT Services 2022', 'Annual IT consulting', 'Open procedure', 400000, 380000, 'EUR', 'SecurIT GmbH', 'DE', 5, 'best_value', 24, 0, 'de', '2022-03-05'),
    ('2022/S 001-000002', 'contract_award', '2022-06-20', 'BUY-DE-002', 'Stadt Muenchen', 'DE212', '72200000', NULL, 'Muenchen IT 2022', 'Municipal IT services', 'Open procedure', 500000, 470000, 'EUR', 'Accenture GmbH', 'DE', 4, 'best_value', 24, 0, 'de', '2022-06-10'),
    ('2022/S 001-000003', 'contract_award', '2022-09-10', 'BUY-AT-001', 'Bundesrechenzentrum GmbH', 'AT130', '72200000', NULL, 'BRZ Cloud 2022', 'Cloud services contract', 'Open procedure', 600000, 550000, 'EUR', 'A1 Telekom Austria', 'AT', 3, 'best_value', 24, 0, 'de', '2022-08-30'),
    ('2022/S 001-000004', 'contract_award', '2022-04-25', 'BUY-DE-003', 'Deutsche Bahn AG', 'DE300', '72200000', NULL, 'DB IT Services 2022', 'Railway IT management', 'Open procedure', 3500000, 3300000, 'EUR', 'Atos SE', 'DE', 4, 'best_value', 24, 0, 'de', '2022-04-15'),
    ('2022/S 001-000005', 'contract_award', '2022-07-15', 'BUY-AT-002', 'Stadt Wien', 'AT130', '72200000', NULL, 'Wien IT Services 2022', 'City IT services', 'Open procedure', 350000, 330000, 'EUR', 'Kapsch BusinessCom', 'AT', 5, 'best_value', 24, 0, 'de', '2022-07-05'),

    -- Short-duration contracts for renewal forecasting
    ('2024/S 012-000001', 'contract_award', '2024-01-05', 'BUY-DE-001', 'Bundesamt fuer Sicherheit in der Informationstechnik', 'DE300', '72800000', NULL, 'BSI Quarterly Pen Test Q1', 'Quarterly penetration testing', 'Open procedure', 50000, 45000, 'EUR', 'SecurIT GmbH', 'DE', 4, 'best_value', 3, 0, 'de', '2023-12-25'),
    ('2024/S 012-000002', 'contract_award', '2024-04-01', 'BUY-DE-001', 'Bundesamt fuer Sicherheit in der Informationstechnik', 'DE300', '72800000', NULL, 'BSI Quarterly Pen Test Q2', 'Quarterly penetration testing', 'Open procedure', 50000, 48000, 'EUR', 'SecurIT GmbH', 'DE', 3, 'best_value', 3, 0, 'de', '2024-03-22'),

    -- Additional diverse data
    ('2024/S 013-000001', 'contract_award', '2024-02-14', 'BUY-DE-009', 'Bundesministerium des Innern', 'DE300', '72200000', NULL, 'BMI IT Modernization', 'Federal IT modernization', 'Restricted procedure', 5000000, 4700000, 'EUR', 'T-Systems International', 'DE', 4, 'best_value', 48, 0, 'de', '2024-02-04'),
    ('2024/S 013-000002', 'contract_award', '2024-03-28', 'BUY-DE-009', 'Bundesministerium des Innern', 'DE300', '72800000', NULL, 'BMI Security Services', 'Federal cybersecurity services', 'Open procedure', 1000000, 950000, 'EUR', 'SecurIT GmbH', 'DE', 6, 'best_value', 24, 0, 'de', '2024-03-18'),
    ('2024/S 013-000003', 'contract_award', '2024-05-12', 'BUY-DE-009', 'Bundesministerium des Innern', 'DE300', '79100000', NULL, 'Legal IT Advisory', 'IT law and compliance advisory', 'Open procedure', 200000, 185000, 'EUR', 'CMS Hasche Sigle', 'DE', 3, 'best_value', 12, 0, 'de', '2024-05-02'),

    -- More EU institution contracts
    ('2024/S 014-000001', 'contract_award', '2024-04-18', 'BUY-EU-003', 'European Central Bank', 'DE600', '72200000', NULL, 'ECB IT Services', 'Central bank IT infrastructure', 'Restricted procedure', 3000000, 2850000, 'EUR', 'Accenture GmbH', 'DE', 5, 'best_value', 36, 0, 'en', '2024-04-08'),
    ('2024/S 014-000002', 'contract_award', '2024-06-28', 'BUY-EU-003', 'European Central Bank', 'DE600', '72800000', NULL, 'ECB Cybersecurity Framework', 'Banking cybersecurity services', 'Restricted procedure', 2000000, 1900000, 'EUR', 'SecurIT GmbH', 'DE', 4, 'best_value', 24, 0, 'en', '2024-06-18'),

    -- Construction in CH
    ('2024/S 015-000001', 'contract_award', '2024-05-08', 'BUY-CH-003', 'Stadt Zuerich', 'CH040', '45210000', NULL, 'Schulhaus Bau Zuerich', 'School building construction', 'Open procedure', 12000000, 11500000, 'CHF', 'Implenia AG', 'CH', 4, 'best_value', 30, 0, 'de', '2024-04-28'),
    ('2024/S 015-000002', 'contract_award', '2024-07-12', 'BUY-CH-003', 'Stadt Zuerich', 'CH040', '72200000', NULL, 'Smart City Zuerich', 'Smart city initiative', 'Open procedure', 800000, 750000, 'CHF', 'Swisscom IT Services', 'CH', 5, 'best_value', 24, 0, 'de', '2024-07-02');
  `);

  // ── Seed data: Buyer profiles (pre-computed) ────────────────────────────

  db.exec(`
    INSERT INTO buyer_profiles (buyer_id, buyer_name, buyer_nuts, total_awards, avg_value_eur, median_value_eur, preferred_procedure, preferred_criteria, avg_bidders, first_seen, last_seen, top_cpv_codes) VALUES
    ('BUY-DE-001', 'Bundesamt fuer Sicherheit in der Informationstechnik', 'DE300', 12, 650000, 480000, 'Open procedure', 'best_value', 5.5, '2022-03-15', '2024-07-10', '72200000,72230000,72800000,79100000'),
    ('BUY-DE-002', 'Stadt Muenchen', 'DE212', 9, 1200000, 720000, 'Open procedure', 'best_value', 5.2, '2022-06-20', '2024-05-20', '72200000,72250000,48000000,45210000,45300000'),
    ('BUY-DE-003', 'Deutsche Bahn AG', 'DE300', 7, 3800000, 3300000, 'Open procedure', 'best_value', 4.7, '2022-04-25', '2024-07-10', '72200000,72230000,72800000'),
    ('BUY-AT-001', 'Bundesrechenzentrum GmbH', 'AT130', 7, 700000, 650000, 'Open procedure', 'best_value', 3.5, '2022-09-10', '2024-04-10', '72200000,72230000,48600000,79400000'),
    ('BUY-AT-002', 'Stadt Wien', 'AT130', 10, 2100000, 850000, 'Open procedure', 'best_value', 5.0, '2022-07-15', '2024-07-22', '72200000,72250000,72800000,45210000,45200000'),
    ('BUY-CH-001', 'Bundesamt fuer Informatik und Telekommunikation', 'CH011', 5, 740000, 380000, 'Open procedure', 'best_value', 5.0, '2023-03-15', '2024-05-10', '72200000,72230000,72800000'),
    ('BUY-EU-001', 'European Commission - DG DIGIT', 'BE100', 6, 2700000, 1900000, 'Open procedure', 'best_value', 5.3, '2023-06-25', '2024-06-30', '72200000,72230000,72800000');
  `);

  // ── Seed data: CPV benchmarks (pre-computed) ────────────────────────────

  db.exec(`
    INSERT INTO cpv_benchmarks (cpv_main, nuts_country, year, award_count, p25_value, median_value, p75_value, avg_bidders, top_winners) VALUES
    ('72200000', 'DE', 2024, 15, 470000, 720000, 2850000, 5.1, 'SecurIT GmbH,Accenture GmbH,Atos SE,Capgemini Deutschland,T-Systems International'),
    ('72200000', 'DE', 2023, 5, 420000, 620000, 3800000, 5.0, 'SecurIT GmbH,Accenture GmbH,Atos SE,Siemens AG'),
    ('72200000', 'AT', 2024, 6, 320000, 585000, 750000, 4.3, 'Kapsch BusinessCom,A1 Telekom Austria,Atos SE'),
    ('72200000', 'AT', 2023, 3, 320000, 370000, 650000, 4.0, 'Kapsch BusinessCom,A1 Telekom Austria'),
    ('72200000', 'CH', 2024, 3, 380000, 750000, 950000, 4.0, 'Swisscom IT Services,Atos SE,Deloitte AG'),
    ('72200000', 'BE', 2024, 3, 1400000, 1900000, 2850000, 5.7, 'Capgemini Deutschland,Atos SE,Accenture GmbH'),
    ('72230000', 'DE', 2024, 5, 370000, 1850000, 2900000, 5.6, 'Capgemini Deutschland,SAP SE,Siemens AG'),
    ('72800000', 'DE', 2024, 5, 140000, 165000, 950000, 5.6, 'SecurIT GmbH'),
    ('45210000', 'DE', 2024, 1, 7500000, 7500000, 7500000, 5.0, 'HOCHTIEF AG'),
    ('45210000', 'AT', 2024, 1, 14200000, 14200000, 14200000, 4.0, 'STRABAG SE'),
    ('45210000', 'CH', 2024, 1, 11500000, 11500000, 11500000, 4.0, 'Implenia AG'),
    ('48000000', 'DE', 2024, 2, 280000, 690000, 1100000, 3.0, 'Microsoft Deutschland,SAP SE');
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
