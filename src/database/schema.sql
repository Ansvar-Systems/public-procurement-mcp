-- Public Procurement MCP — Database Schema
-- Covers: legal content, reference data, and award intelligence

-- Legal content
CREATE TABLE IF NOT EXISTS directives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    short_title TEXT,
    jurisdiction TEXT NOT NULL,
    type TEXT NOT NULL, -- 'eu_directive', 'eu_regulation', 'national_law'
    celex_number TEXT,
    effective_date TEXT,
    source_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS provisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    directive_id INTEGER NOT NULL REFERENCES directives(id),
    article_number TEXT NOT NULL,
    title TEXT,
    body TEXT NOT NULL,
    search_text TEXT,
    UNIQUE(directive_id, article_number)
);

CREATE VIRTUAL TABLE IF NOT EXISTS provisions_fts USING fts5(
    article_number, title, body, search_text,
    content='provisions', content_rowid='id'
);

-- Reference data
CREATE TABLE IF NOT EXISTS cpv_codes (
    code TEXT PRIMARY KEY,
    description_en TEXT NOT NULL,
    description_de TEXT,
    description_fr TEXT,
    parent_code TEXT,
    level INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nuts_regions (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    level INTEGER NOT NULL,
    country TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS thresholds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    directive_id INTEGER REFERENCES directives(id),
    category TEXT NOT NULL,
    value_eur REAL NOT NULL,
    effective_from TEXT NOT NULL,
    effective_to TEXT
);

CREATE TABLE IF NOT EXISTS procedure_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    directive_id INTEGER REFERENCES directives(id),
    conditions TEXT,
    min_candidates INTEGER,
    time_limits_json TEXT
);

CREATE TABLE IF NOT EXISTS exclusion_grounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    directive_id INTEGER REFERENCES directives(id),
    jurisdiction TEXT NOT NULL,
    type TEXT NOT NULL,
    ground TEXT NOT NULL,
    article_reference TEXT,
    description TEXT
);

-- Award intelligence
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
CREATE INDEX IF NOT EXISTS idx_notices_deadline ON notices(deadline);

-- Materialized views
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
