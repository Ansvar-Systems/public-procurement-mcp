# CLAUDE.md — Public Procurement MCP Server

## Purpose

MCP server providing 19 tools for EU/CH/AT/DE public procurement law, CPV taxonomy, and TED award intelligence. Private repo, Docker-only distribution.

## Architecture

- **Runtime**: Node.js 22, TypeScript, ES modules
- **Database**: SQLite via node-sqlite3-wasm (`data/procurement.db`)
- **MCP SDK**: @modelcontextprotocol/sdk (stdio + Streamable HTTP)
- **Transports**: stdio (`src/worker.ts`), HTTP (`src/http-server.ts`), Vercel (`api/mcp.ts`)

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | MCP server factory, tool definitions (19 tools) |
| `src/worker.ts` | stdio transport entry point |
| `src/http-server.ts` | HTTP transport entry point (port 3000) |
| `src/database/adapter.ts` | SQLite database adapter |
| `src/database/schema.sql` | Full database schema |
| `api/mcp.ts` | Vercel serverless MCP handler |
| `api/health.ts` | Vercel health check handler |
| `server.json` | MCP server metadata |
| `sources.yml` | Data source provenance |

## Build and Test

```bash
npm install
npm run build        # TypeScript compilation
npm test             # Run tests
npm run test:coverage # Coverage report
```

## Run

```bash
npm start            # stdio transport
npm run start:http   # HTTP on port 3000
docker compose up -d # Docker on port 3200
```

## Database

The database has three domains:

1. **Legal content**: `directives` + `provisions` + FTS5 index
2. **Reference data**: `cpv_codes`, `nuts_regions`, `thresholds`, `procedure_types`, `exclusion_grounds`
3. **Award intelligence**: `notices` + materialized views (`buyer_profiles`, `cpv_benchmarks`)

Build the database:
```bash
npm run build-db
```

Ingestion scripts:
```bash
npm run ingest:legal      # EU directives + national laws
npm run ingest:reference  # CPV codes, NUTS, thresholds
npm run ingest:ted        # TED award notices
npm run ingest:views      # Rebuild materialized views
```

## Tools (19)

### Legal (3)
1. `search_legislation` — FTS5 search across procurement directives
2. `get_provision` — Get full article text
3. `get_directive_overview` — Directive summary

### Reference (5)
4. `get_cpv_codes` — CPV code lookup
5. `get_thresholds` — Procurement value thresholds
6. `get_procedure_types` — Procedure types + conditions
7. `get_exclusion_grounds` — Mandatory/discretionary grounds
8. `get_time_limits` — Minimum time limits by procedure

### Cross-reference (2)
9. `compare_requirements` — Cross-jurisdiction comparison
10. `validate_citation` — Citation validation

### Metadata (3)
11. `list_sources` — Data source provenance
12. `about` — Server metadata + statistics
13. `check_data_freshness` — Freshness status

### Award Intelligence (6)
14. `get_buyer_profile` — Contracting authority profile
15. `get_award_history` — TED award notice search
16. `get_competitor_profile` — Supplier/competitor analysis
17. `get_price_benchmark` — Price percentiles by CPV/region
18. `get_framework_agreements` — Framework agreement search
19. `get_renewal_forecast` — Contract renewal prediction

## Branching

```
feature-branch -> PR to dev -> verify on dev -> PR to main -> deploy
```

Never push directly to `main`. All changes go through `dev` first.

## Data Sources

- EUR-Lex: EU procurement directives (CC BY 4.0)
- TED: Award notices (Open Data)
- RIS: Austrian BVergG (public domain)
- Gesetze im Internet: German GWB/VgV (public domain)
- Fedlex: Swiss BoeB (public domain)
- SIMAP: CPV codes (public domain)
- Eurostat: NUTS regions

See `sources.yml` for full provenance.
