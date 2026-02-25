# Public Procurement MCP — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Public Procurement MCP server with 19 tools — 13 for legal knowledge (EU procurement directives, CH/AT/DE national procurement law, CPV taxonomy) and 6 for competitive intelligence (TED award history, buyer profiles, price benchmarking, renewal forecasting).

**Architecture:** TypeScript MCP server with SQLite DB following the non-law golden standard. Ingests EU procurement directives from EUR-Lex, Swiss/Austrian/German procurement law from national portals, CPV/NUTS reference data from EU Open Data, and 5 years of TED award notices (~4M records). Docker-only distribution (private repo).

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `node-sqlite3-wasm`, Express, Zod, Vitest

**Design doc:** See `Ansvar-Architecture-Documentation/docs/plans/2026-02-25-public-procurement-mcp-and-tender-monitor-design.md`

**Related repos:**
- `ansvar-tender-monitor` — Tender monitoring web service (separate implementation plan)
- `ansvar_platform` — Agent registration (Task 7 below)

---

## Task 1: Scaffold repo

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.npmignore`, `.dockerignore`, `.gitleaks.toml`, `CODEOWNERS`, `LICENSE`, `SECURITY.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `README.md`, `DISCLAIMER.md`, `PRIVACY.md`, `server.json`, `sources.yml`, `CLAUDE.md`
- Create: `src/index.ts`, `src/worker.ts`, `src/http-server.ts`
- Create: `src/database/adapter.ts`, `src/database/schema.sql`
- Create: `api/mcp.ts`, `api/health.ts`
- Create: `Dockerfile`, `docker-compose.yml`, `vercel.json`
- Create: `.github/workflows/ci.yml`, `.github/workflows/security.yml`

**Steps:**

1. Create `dev` branch:
   ```bash
   git checkout -b dev
   ```

2. Initialize `package.json` with standard MCP dependencies:
   ```json
   {
     "name": "@ansvar/public-procurement-mcp",
     "version": "0.1.0",
     "description": "Public procurement law, CPV taxonomy, TED award intelligence — 19 MCP tools for EU/CH/AT/DE procurement",
     "private": true,
     "type": "module",
     "scripts": {
       "build": "tsc",
       "test": "vitest run",
       "test:watch": "vitest",
       "test:coverage": "vitest run --coverage",
       "start": "node dist/worker.js",
       "start:http": "node dist/http-server.js",
       "build-db": "tsx scripts/build-db.ts",
       "ingest:legal": "tsx scripts/ingest-legal.ts",
       "ingest:reference": "tsx scripts/ingest-reference.ts",
       "ingest:ted": "tsx scripts/ingest-ted-notices.ts",
       "ingest:views": "tsx scripts/rebuild-views.ts",
       "check-freshness": "tsx scripts/check-freshness.ts"
     },
     "dependencies": {
       "@modelcontextprotocol/sdk": "^1.12.1",
       "node-sqlite3-wasm": "^0.8.30",
       "express": "^4.21.2",
       "zod": "^3.24.2"
     },
     "devDependencies": {
       "typescript": "^5.7.3",
       "tsx": "^4.19.3",
       "vitest": "^3.0.6",
       "@vitest/coverage-v8": "^3.0.6",
       "@types/node": "^22.13.4",
       "@types/express": "^5.0.0"
     }
   }
   ```

3. Create `tsconfig.json`, `vitest.config.ts`, config files (copy patterns from Cryptography-mcp or EU_compliance_MCP).

4. Create `src/database/schema.sql` with the full schema:
   ```sql
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
       category TEXT NOT NULL, -- 'supplies', 'services', 'works', 'social_services'
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
       type TEXT NOT NULL, -- 'mandatory', 'discretionary'
       ground TEXT NOT NULL,
       article_reference TEXT,
       description TEXT
   );

   -- Award intelligence (bulk — ~4M rows)
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

   -- Materialized views for intelligence tools
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
   ```

5. Create stub `src/database/adapter.ts` with the standard `@ansvar/mcp-sqlite` pattern (open DB, parameterized queries).

6. Create `src/index.ts` (MCP server with all 19 tool registrations as stubs), `src/worker.ts` (stdio transport), `src/http-server.ts` (Express HTTP transport).

7. Create `api/mcp.ts` and `api/health.ts` (Vercel handlers — same pattern as other MCPs).

8. Create `Dockerfile`, `docker-compose.yml`, `vercel.json` with standard patterns.

9. Create open-source docs: `README.md` (basic, expand later), `SECURITY.md`, `DISCLAIMER.md`, `PRIVACY.md`, `CONTRIBUTING.md`, `LICENSE` (Apache 2.0), `CHANGELOG.md`.

10. Create `server.json` and `sources.yml` declaring all data sources.

11. Create `.github/workflows/ci.yml` (build + test on push) and `.github/workflows/security.yml` (CodeQL + Semgrep + Gitleaks + Trivy).

12. Commit and push:
    ```bash
    git add -A
    git commit -m "feat: scaffold MCP server with schema, stubs, CI, and docs"
    git push -u origin dev
    ```

**Verification:** `npm install && npm run build` compiles. `npm test` runs (0 tests yet). Docker builds.

---

## Task 2: Implement legal knowledge tools (tools 1-10)

**Files:**
- Create: `src/tools/search-legislation.ts`, `src/tools/get-provision.ts`, `src/tools/get-directive-overview.ts`, `src/tools/get-cpv-codes.ts`, `src/tools/get-thresholds.ts`, `src/tools/get-procedure-types.ts`, `src/tools/get-exclusion-grounds.ts`, `src/tools/get-time-limits.ts`, `src/tools/compare-requirements.ts`, `src/tools/validate-citation.ts`
- Create: `tests/tools/search-legislation.test.ts`, `tests/tools/get-provision.test.ts`, `tests/tools/get-cpv-codes.test.ts`, `tests/tools/get-thresholds.test.ts`, `tests/tools/get-procedure-types.test.ts`, `tests/tools/get-exclusion-grounds.test.ts`, `tests/tools/get-time-limits.test.ts`, `tests/tools/compare-requirements.test.ts`, `tests/tools/validate-citation.test.ts`, `tests/tools/get-directive-overview.test.ts`
- Modify: `src/index.ts` — wire tool registrations to implementations

**Steps:**

1. Create test fixtures: a small SQLite test DB (`tests/fixtures/test.db`) with ~5 directives, ~20 provisions, ~50 CPV codes, ~5 thresholds, ~5 procedure types, ~10 exclusion grounds.

2. For each tool (TDD cycle — write test, verify fail, implement, verify pass):

   **`search_legislation`**: FTS5 query across provisions. Input: `query` (string), `jurisdiction` (optional), `directive` (optional), `limit` (default 20). Returns: matching provisions with article number, directive title, jurisdiction, snippet.

   **`get_provision`**: Exact lookup. Input: `directive` (short title or CELEX), `article` (article number). Returns: full article text, directive context, effective date.

   **`get_directive_overview`**: Summary view. Input: `directive` (short title or CELEX). Returns: title, scope, applicable thresholds, available procedure types, key articles list.

   **`get_cpv_codes`**: Input: `query` (keyword) or `code` (prefix). Returns: matching CPV codes with description, parent hierarchy, level.

   **`get_thresholds`**: Input: `category` (supplies/services/works), `directive` (optional). Returns: current thresholds with effective dates, sorted by category.

   **`get_procedure_types`**: Input: `directive` (optional), `above_threshold` (bool), `value_eur` (optional). Returns: applicable procedures with conditions, time limits, min candidates.

   **`get_exclusion_grounds`**: Input: `jurisdiction`, `type` (mandatory/discretionary/both). Returns: grounds with article references, descriptions.

   **`get_time_limits`**: Input: `procedure_type`, `is_prior_information` (bool). Returns: minimum standstill periods, submission deadlines, notification periods.

   **`compare_requirements`**: Input: `topic` (e.g. "exclusion grounds"), `jurisdictions` (array). Returns: side-by-side comparison table.

   **`validate_citation`**: Input: `citation` (e.g. "Art. 57(1) Directive 2014/24/EU"). Returns: valid/invalid, correct form, provision text if found.

3. All tool responses include `_meta` with disclaimer, data_age, source_url.

4. Commit after every 2-3 tools:
   ```bash
   git commit -m "feat: implement search_legislation and get_provision tools with tests"
   ```

**Verification:** `npm test` — all tool tests pass. Each tool returns correct results from fixture DB.

---

## Task 3: Implement meta tools and intelligence tools (tools 11-19)

**Files:**
- Create: `src/tools/list-sources.ts`, `src/tools/about.ts`, `src/tools/check-data-freshness.ts`
- Create: `src/tools/get-buyer-profile.ts`, `src/tools/get-award-history.ts`, `src/tools/get-competitor-profile.ts`, `src/tools/get-price-benchmark.ts`, `src/tools/get-framework-agreements.ts`, `src/tools/get-renewal-forecast.ts`
- Create: `tests/tools/list-sources.test.ts`, `tests/tools/about.test.ts`, `tests/tools/check-data-freshness.test.ts`, `tests/tools/get-buyer-profile.test.ts`, `tests/tools/get-award-history.test.ts`, `tests/tools/get-competitor-profile.test.ts`, `tests/tools/get-price-benchmark.test.ts`, `tests/tools/get-framework-agreements.test.ts`, `tests/tools/get-renewal-forecast.test.ts`
- Modify: `src/index.ts` — wire remaining tools

**Steps:**

1. Expand test fixtures: add `notices` table data (~100 sample award notices) with realistic buyer IDs, CPV codes, values, winner names, dates. Pre-compute `buyer_profiles` and `cpv_benchmarks` rows.

2. Implement meta tools (standard pattern):

   **`list_sources`**: Returns all data sources with counts, last update, coverage notes.

   **`about`**: Returns server name, version, description, coverage summary, branding (Ansvar MCP Network).

   **`check_data_freshness`**: Per-source age in days, staleness threshold, `gh workflow run` command for forced update.

3. Implement intelligence tools (TDD):

   **`get_buyer_profile`**: Input: `buyer_name` or `buyer_id`. Query: look up `buyer_profiles` materialized view. Returns: total awards, avg value, preferred procedure, preferred criteria, avg bidders, top CPV codes, activity timeline.

   **`get_award_history`**: Input: `cpv_code`, `nuts_region` (optional), `year_from` (optional), `year_to` (optional), `limit` (default 20). Query: filter `notices` WHERE `notice_type = 'contract_award'`. Returns: list of awards with buyer, winner, value, date, num bidders.

   **`get_competitor_profile`**: Input: `company_name`. Query: aggregate `notices` WHERE `winner_name LIKE ?`. Returns: total wins, win sectors (CPV breakdown), geographies, avg contract value, recent wins.

   **`get_price_benchmark`**: Input: `cpv_code`, `nuts_country` (optional), `year_from`, `year_to`. Query: `cpv_benchmarks` view or live aggregate. Returns: p25, median, p75 values, sample size, trend direction.

   **`get_framework_agreements`**: Input: `cpv_code`, `nuts_region` (optional). Query: `notices` WHERE `framework_agreement = 1` AND active (estimated from duration). Returns: active frameworks with buyer, holder, estimated expiry.

   **`get_renewal_forecast`**: Input: `cpv_code` (optional), `nuts_region` (optional), `months_ahead` (default 12). Query: awards where `publication_date + contract_duration_months` falls within forecast window. Returns: contracts likely to re-tender, with buyer, current holder, estimated value, estimated re-tender date.

4. Commit after each group:
   ```bash
   git commit -m "feat: implement 3 meta tools (list_sources, about, check_data_freshness)"
   git commit -m "feat: implement 6 competitive intelligence tools with tests"
   ```

**Verification:** `npm test` — all 19 tools tested and passing. `npm run test:coverage` shows >80% coverage on `src/tools/`.

---

## Task 4: Build legal content ingestion pipeline

**Files:**
- Create: `scripts/ingest-legal.ts` — EUR-Lex fetcher for EU directives
- Create: `scripts/ingest-swiss.ts` — Fedlex fetcher for BöB/IVöB/VöB
- Create: `scripts/ingest-austrian.ts` — RIS fetcher for BVergG
- Create: `scripts/ingest-german.ts` — gesetze-im-internet.de fetcher for GWB/VgV
- Create: `scripts/ingest-reference.ts` — CPV + NUTS + thresholds from EU Open Data
- Create: `scripts/lib/eurlex-parser.ts`, `scripts/lib/html-parser.ts`
- Create: `data/census.json` — enumeration of all procurement laws to ingest
- Create: `tests/scripts/ingest-legal.test.ts`, `tests/scripts/ingest-reference.test.ts`

**Steps:**

1. Create `data/census.json` — enumerate every procurement law:
   ```json
   {
     "eu": [
       { "celex": "32014L0024", "title": "Directive 2014/24/EU — Public procurement", "status": "ingestable", "source": "eurlex" },
       { "celex": "32014L0025", "title": "Directive 2014/25/EU — Utilities procurement", "status": "ingestable", "source": "eurlex" }
     ],
     "ch": [
       { "id": "SR-172.056.1", "title": "BöB — Federal Act on Public Procurement", "status": "ingestable", "source": "fedlex" }
     ],
     "at": [
       { "id": "BVergG_2018", "title": "BVergG 2018 — Bundesvergabegesetz", "status": "ingestable", "source": "ris" }
     ],
     "de": [
       { "id": "GWB_4", "title": "GWB Part 4 — Competition Restrictions Act (Procurement)", "status": "ingestable", "source": "gesetze_im_internet" }
     ]
   }
   ```

2. Implement `scripts/ingest-legal.ts`:
   - Reads `census.json` for EU sources
   - Fetches each directive from EUR-Lex (HTML format, CELEX-based URL)
   - Parses article structure (title, number, body) using HTML parser
   - Inserts into `directives` + `provisions` tables
   - Updates FTS5 index
   - Reports: ingested X/Y provisions from Z directives

3. Implement national fetchers (`ingest-swiss.ts`, `ingest-austrian.ts`, `ingest-german.ts`):
   - Swiss: Fedlex API (JSON-LD) for BöB, IVöB, VöB
   - Austrian: RIS API for BVergG 2018, BVergGKonz 2018
   - German: gesetze-im-internet.de XML for GWB Part 4, VgV, SektVO, KonzVgV, VSVgV

4. Implement `scripts/ingest-reference.ts`:
   - CPV: Download from EU Publications Office (CSV), parse 9,454 codes with hierarchy
   - NUTS: Download from Eurostat (CSV), parse regions with country mapping
   - Thresholds: Hardcode current values (updated biennially, manual update is fine)
   - Procedure types: Hardcode from directive text (stable reference data)
   - Exclusion grounds: Hardcode from Art. 57 of 2014/24/EU + national transpositions

5. Run full ingestion and verify DB:
   ```bash
   npm run ingest:legal
   npm run ingest:reference
   sqlite3 data/public-procurement.db "SELECT COUNT(*) FROM directives; SELECT COUNT(*) FROM provisions; SELECT COUNT(*) FROM cpv_codes;"
   ```

6. Commit:
   ```bash
   git commit -m "feat: legal content ingestion pipeline (EUR-Lex, Fedlex, RIS, gesetze-im-internet)"
   git commit -m "feat: reference data ingestion (CPV, NUTS, thresholds, procedures, exclusion grounds)"
   ```

**Verification:** DB contains ~2,200 provisions from ~20 directives/laws, 9,454 CPV codes, ~1,500 NUTS regions, current thresholds. All legal tools return real data.

---

## Task 5: Build TED notice ingestion pipeline

**Files:**
- Create: `scripts/ingest-ted-notices.ts` — TED eSender API fetcher
- Create: `scripts/rebuild-views.ts` — Rebuild materialized views
- Create: `scripts/lib/ted-api.ts` — TED API client with pagination + rate limiting
- Create: `scripts/lib/ted-parser.ts` — Parse eForms XML/JSON to flat notice record
- Create: `scripts/check-freshness.ts` — Report data age per source
- Create: `.github/workflows/ingest.yml` — Daily TED ingestion cron
- Create: `.github/workflows/check-freshness.yml` — Daily staleness check
- Create: `tests/scripts/ingest-ted.test.ts`

**Steps:**

1. Implement `scripts/lib/ted-api.ts`:
   - TED eSender API client (REST, JSON)
   - Expert search queries (filter by notice type, publication date range)
   - Pagination handling (TED returns max 100 per page)
   - Rate limiting (max 10 req/s per TED ToS)
   - Returns raw notice JSON

2. Implement `scripts/lib/ted-parser.ts`:
   - Parse eForms JSON structure into flat `notices` table row
   - Extract: buyer info, CPV codes, values, winner, procedure type, dates
   - Handle multiple lots (one row per lot-award pair)
   - Normalize currency to EUR (using ECB daily rates for non-EUR)

3. Implement `scripts/ingest-ted-notices.ts`:
   - Accepts `--from` and `--to` date params (for backfill) or defaults to yesterday
   - Fetches all notice types: CN (contract notice), CAN (contract award notice), PIN (prior information), modification
   - Deduplicates by `ted_id` (upsert)
   - Progress reporting: "Ingested 4,532 notices for 2026-02-24"
   - For initial backfill: `--from 2021-01-01 --to 2026-02-25` (~4M notices, expect 6-12 hours)

4. Implement `scripts/rebuild-views.ts`:
   - Drops and recreates `buyer_profiles` and `cpv_benchmarks` tables
   - `buyer_profiles`: aggregate from `notices` WHERE `notice_type = 'contract_award'` GROUP BY `buyer_id`
   - `cpv_benchmarks`: percentile calculations GROUP BY `cpv_main, substr(buyer_nuts,1,2), strftime('%Y', publication_date)`
   - Reports: "Rebuilt 45,231 buyer profiles and 12,890 CPV benchmarks"

5. Implement `scripts/check-freshness.ts`:
   - Reports max `publication_date` per source, days since last update, staleness threshold (2 days for TED, 90 days for legal content)

6. Create CI workflows:
   - `.github/workflows/ingest.yml`: runs daily at 05:00 UTC, calls `npm run ingest:ted && npm run ingest:views`, commits updated DB
   - `.github/workflows/check-freshness.yml`: runs daily at 08:00 UTC, calls `npm run check-freshness`, opens GitHub issue if any source is stale

7. Commit:
   ```bash
   git commit -m "feat: TED eSender API client with pagination and rate limiting"
   git commit -m "feat: TED notice ingestion pipeline with backfill support"
   git commit -m "feat: materialized view rebuild for buyer profiles and CPV benchmarks"
   git commit -m "ci: daily TED ingestion and freshness check workflows"
   ```

**Verification:** Ingest 1 day of TED notices successfully. `get_buyer_profile` and `get_price_benchmark` return real results. Freshness check reports all sources within threshold.

---

## Task 6: Docker + golden standard docs

**Files:**
- Modify: `Dockerfile` — multi-stage build with DB baked in
- Modify: `docker-compose.yml` — service definition
- Create: `COVERAGE.md` — human-readable coverage manifest
- Create: `data/coverage.json` — machine-readable coverage manifest
- Create: `TOOLS.md` — all 19 tools documented with params, returns, examples
- Modify: `README.md` — expand to golden standard (~400 lines)
- Create: `ROADMAP.md`

**Steps:**

1. Finalize `Dockerfile` (multi-stage):
   ```dockerfile
   FROM node:22-alpine AS builder
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   RUN npm run build

   FROM node:22-alpine
   WORKDIR /app
   COPY --from=builder /app/dist ./dist
   COPY --from=builder /app/node_modules ./node_modules
   COPY --from=builder /app/package.json ./
   COPY --from=builder /app/data/public-procurement.db ./data/public-procurement.db
   EXPOSE 3000
   CMD ["node", "dist/http-server.js"]
   ```

2. Update `docker-compose.yml`:
   ```yaml
   services:
     public-procurement-mcp:
       build: .
       ports:
         - "3200:3000"
       environment:
         - DB_PATH=/app/data/public-procurement.db
   ```

3. Write `COVERAGE.md` documenting what's covered and what's NOT:
   - Legal: 6 EU directives + secondary, 3 CH laws, 2 AT laws, 5 DE laws
   - Reference: 9,454 CPV codes, ~1,500 NUTS regions, current thresholds
   - Intelligence: TED notices from 2021-present (~4M records)
   - NOT covered: national portals below EU threshold, case law, soft law/guidelines

4. Write `data/coverage.json` (machine-readable version).

5. Write `TOOLS.md` — all 19 tools with: description, parameters (name, type, required, description), return format, example call, example response, limitations.

6. Expand `README.md` to golden standard: badges, tagline, "Why This Exists", Quick Start, example queries, stats table, tools table, security scanning, disclaimers, contributing, roadmap.

7. Build and test Docker image:
   ```bash
   docker build -t public-procurement-mcp .
   docker run -p 3200:3000 public-procurement-mcp
   curl http://localhost:3200/api/health
   ```

8. Commit:
   ```bash
   git commit -m "feat: Docker image with baked-in DB"
   git commit -m "docs: golden standard docs (COVERAGE, TOOLS, README, ROADMAP)"
   ```

**Verification:** Docker image builds and responds to health check. All 19 tools accessible via HTTP transport. COVERAGE.md and TOOLS.md complete.

---

## Task 7: Register agent on Intelligence Portal (cross-repo)

**Repo:** `ansvar_platform`

See full details in `Ansvar-Architecture-Documentation/docs/plans/2026-02-25-public-procurement-mcp-and-tender-monitor.md`, Task 13.

Summary: Add `procurement-expert` agent definition + MCP registration to the platform. Wire Public Procurement MCP via stdio transport in docker-compose.

---

## Task 8: Update architecture documentation (cross-repo)

**Repo:** `Ansvar-Architecture-Documentation`

See full details in `Ansvar-Architecture-Documentation/docs/plans/2026-02-25-public-procurement-mcp-and-tender-monitor.md`, Task 14.

Summary: Add agent #34 to roster, MCP to overview/mapping/fleet-manifests/dashboard, repos to repos.json.
