# Public Procurement MCP Server

[![Build](https://github.com/ansvar-eu/public-procurement-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ansvar-eu/public-procurement-mcp/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-328%20passing-brightgreen)](https://github.com/ansvar-eu/public-procurement-mcp)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

**19 MCP tools for EU/CH/AT/DE public procurement law and TED award intelligence.**

An MCP server that gives AI agents structured access to EU public procurement directives, national transpositions (Germany, Austria, Switzerland), the CPV taxonomy, procurement thresholds, and competitive intelligence from TED (Tenders Electronic Daily) award notices.

---

## Why This Exists

Public procurement in Europe is governed by a complex web of EU directives and national laws. Procurement teams, legal advisors, and bid managers must cross-reference multiple legal sources, understand threshold values, know exclusion grounds, and research historical award data -- all before writing a single bid.

This MCP server packages that knowledge into 19 tools that AI agents can call directly:

- **Search and retrieve** procurement law articles across 4 jurisdictions
- **Look up** CPV codes, thresholds, procedure types, and exclusion grounds
- **Compare** requirements across EU, German, Austrian, and Swiss law
- **Analyze** TED award notices for buyer profiles, competitor intelligence, and price benchmarks
- **Forecast** upcoming contract renewals based on historical award patterns

No RAG. No embeddings. Direct database access with FTS5 full-text search and BM25 ranking.

---

## Quick Start

### Docker (recommended)

```bash
docker compose up -d
# MCP endpoint: http://localhost:3200/mcp
# Health check: http://localhost:3200/health
```

### Local Development

```bash
npm install
npm run build
npm start          # stdio transport
npm run start:http # HTTP transport on port 3000
```

### Run Tests

```bash
npm test
npm run test:coverage
```

---

## Stats

| Category | Count |
|----------|-------|
| EU Directives | 5 |
| National Laws | 9 |
| Total Provisions | ~2,200 |
| Jurisdictions | EU, DE, AT, CH |
| CPV Codes | 9,454 |
| NUTS Regions | ~1,500 |
| Thresholds | 21 |
| Procedure Types | 21 |
| Exclusion Grounds | 33 |
| TED Notices | Backfill target: ~4M |
| Tools | 19 |
| Tests | 328 |

---

## Tools

### Legal Knowledge (1-10)

| # | Tool | Description |
|---|------|-------------|
| 1 | `search_legislation` | FTS5 search across all procurement provisions with BM25 ranking |
| 2 | `get_provision` | Retrieve full text of a specific article from any directive or law |
| 3 | `get_directive_overview` | Summary of a directive: scope, articles, thresholds, procedures |
| 4 | `get_cpv_codes` | Look up CPV codes by keyword or prefix (EN/DE/FR) |
| 5 | `get_thresholds` | Current procurement thresholds by category and jurisdiction |
| 6 | `get_procedure_types` | Available procedures with conditions, candidates, and time limits |
| 7 | `get_exclusion_grounds` | Mandatory and discretionary exclusion grounds per jurisdiction |
| 8 | `get_time_limits` | Minimum time limits for each procedure type |
| 9 | `compare_requirements` | Cross-jurisdiction comparison on any procurement topic |
| 10 | `validate_citation` | Validate a procurement law citation against the database |

### Meta (11-13)

| # | Tool | Description |
|---|------|-------------|
| 11 | `list_sources` | Data sources, provenance metadata, and dataset statistics |
| 12 | `about` | Server metadata, coverage summary, and security posture |
| 13 | `check_data_freshness` | Staleness check for each data source |

### Competitive Intelligence (14-19)

| # | Tool | Description |
|---|------|-------------|
| 14 | `get_buyer_profile` | Contracting authority profile: awards, preferences, top CPV codes |
| 15 | `get_award_history` | Search TED award notices by CPV, region, and date range |
| 16 | `get_competitor_profile` | Supplier analysis: wins, sectors, geographies, average value |
| 17 | `get_price_benchmark` | Price percentiles (p25/median/p75) for a CPV code by country |
| 18 | `get_framework_agreements` | Find framework agreements by CPV code and NUTS region |
| 19 | `get_renewal_forecast` | Predict upcoming contract renewals from award + duration data |

See [TOOLS.md](TOOLS.md) for full parameter reference, return formats, and examples.

---

## Example Queries

### 1. Research exclusion grounds before bidding

```json
{
  "name": "get_exclusion_grounds",
  "arguments": { "jurisdiction": "DE", "type": "mandatory" }
}
```

Returns all mandatory exclusion grounds under German procurement law (GWB) with article references. Use `compare_requirements` to see how they differ from EU directive grounds.

### 2. Find the right CPV code for a cybersecurity tender

```json
{
  "name": "get_cpv_codes",
  "arguments": { "query": "information security", "limit": 10 }
}
```

Returns matching CPV codes with descriptions in English, German, and French. Use the code in `get_award_history` to research past awards.

### 3. Benchmark pricing for IT consulting in Austria

```json
{
  "name": "get_price_benchmark",
  "arguments": { "cpv_code": "72220000", "nuts_country": "AT" }
}
```

Returns price percentiles (p25, median, p75), average number of bidders, and top winners for IT consulting services in Austria.

### 4. Find expiring framework agreements

```json
{
  "name": "get_renewal_forecast",
  "arguments": { "cpv_code": "72", "nuts_region": "DE", "months_ahead": 6 }
}
```

Returns contracts in the IT sector across Germany that are estimated to come up for re-tendering in the next 6 months.

---

## Data Sources

Per-source licence codes match `infrastructure/attribution-licenses.json`
in the architecture-docs repo. The dominant corpus is the EU procurement
directives served from EUR-Lex under Commission Decision 2011/833/EU.

| Source | Authority | Coverage | Licence code |
|--------|-----------|----------|--------------|
| [EUR-Lex](https://eur-lex.europa.eu) | Publications Office of the EU | EU procurement directives | `EUR-Lex-Decision-2011-833` |
| [TED](https://ted.europa.eu) | Publications Office of the EU | Award notices (EU/EEA) | `EUR-Lex-Decision-2011-833` |
| [SIMAP/CPV](https://ted.europa.eu/simap/codes-and-nomenclatures/cpv) | Publications Office of the EU | CPV taxonomy | `EUR-Lex-Decision-2011-833` |
| [Eurostat NUTS](https://ec.europa.eu/eurostat/web/nuts) | Eurostat | NUTS regions | `EUR-Lex-Decision-2011-833` |
| [RIS](https://www.ris.bka.gv.at) | Austrian Federal Chancellery | BVergG, BVergGKonz | `Public-Domain` (statutory basis: Austrian UrhG §7) |
| [Gesetze im Internet](https://www.gesetze-im-internet.de) | German Federal Ministry of Justice | GWB Part 4, VgV, SektVO, KonzVgV, VSVgV | `German-UrhG-Section-5` |
| [Fedlex](https://www.fedlex.admin.ch) | Swiss Federal Chancellery | BöB, VöB | `Public-Domain` (statutory basis: Swiss URG Art. 5) |

See `sources.yml` for full provenance details including verbatim ToS
quotes, statutory basis citations, and ingestion-script references.

---

## Coverage

**Covered:**
- 5 EU procurement directives (2014/24/EU, 2014/25/EU, 2014/23/EU, 2009/81/EC, 2007/66/EC)
- 9 national laws across Germany (5), Austria (2), and Switzerland (2)
- Complete CPV taxonomy (9,454 codes)
- NUTS regions (~1,500)
- Procurement thresholds (2024-2025)
- TED award notice intelligence (daily ingestion pipeline)

**Not covered:**
- Sub-threshold national procurement
- Municipal/regional procurement portals
- Case law and tribunal decisions
- Soft law, guidelines, and best practice documents
- eCertis qualification evidence

See [COVERAGE.md](COVERAGE.md) and `data/coverage.json` for the machine-readable manifest.

---

## Architecture

```
Client (Claude/Agent)
  |
  v
HTTP Transport (port 3000)       Stdio Transport
  |                                |
  v                                v
MCP Server (19 tools registered)
  |
  v
SQLite Database (FTS5 + materialized views)
  |
  +-- directives         (14 laws)
  +-- provisions          (~2200 articles)
  +-- provisions_fts      (full-text index)
  +-- cpv_codes           (9454 codes)
  +-- nuts_regions        (~1500 regions)
  +-- thresholds          (21 entries)
  +-- procedure_types     (21 entries)
  +-- exclusion_grounds   (33 entries)
  +-- notices             (TED award data)
  +-- buyer_profiles      (materialized view)
  +-- cpv_benchmarks      (materialized view)
```

---

## Ingestion Pipeline

```bash
# Legal content (EUR-Lex, Fedlex, RIS, gesetze-im-internet)
npm run ingest:legal

# Reference data (CPV, NUTS, thresholds, procedures, exclusion grounds)
npm run ingest:reference

# TED award notices (daily via CI or manual)
npm run ingest:ted

# Rebuild materialized views (buyer profiles, CPV benchmarks)
npm run ingest:views
```

---

## Docker

### Build

```bash
docker build -t public-procurement-mcp .
```

### Run

```bash
docker run -p 3000:3000 public-procurement-mcp
```

### Docker Compose

```bash
docker compose up -d
# Exposes MCP endpoint at http://localhost:3200/mcp
# Health check at http://localhost:3200/health
```

### Health Check

The container includes a built-in health check:

```bash
curl http://localhost:3200/health
```

```json
{
  "status": "ok",
  "server": "public-procurement-mcp",
  "version": "0.1.0",
  "timestamp": "2026-02-25T10:00:00.000Z"
}
```

---

## Security

- **Read-only**: The MCP server only reads from a pre-built SQLite database. No writes.
- **No network access**: At runtime, the server makes no outbound network calls.
- **No code execution**: No eval, no dynamic code loading, no shell commands.
- **No secrets**: The server requires no API keys, tokens, or credentials.
- **Input validation**: All tool parameters are validated before database queries.
- **SQL injection prevention**: All queries use parameterized statements.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

## Disclaimer

This server provides legal and market data for informational purposes only. It does not constitute legal advice. All legal references should be verified against official sources (EUR-Lex, RIS, Gesetze im Internet, Fedlex) before reliance. Award data from TED is historical and indicative -- it should not be used as the sole basis for commercial decisions.

See [DISCLAIMER.md](DISCLAIMER.md) for the full disclaimer.

---

## Contributing

Contributions are welcome. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Key areas:
- Additional national transpositions (FR, IT, ES, NL)
- Improved citation parsing
- Additional TED data fields
- Performance optimization for large notice datasets

---

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features.

---

## License

Apache 2.0 -- see [LICENSE](LICENSE).

---

Built by [Ansvar Systems](https://ansvar.eu).
