# Public Procurement MCP Server

MCP server for EU/CH/AT/DE public procurement law, CPV taxonomy, and TED award intelligence.

## Features

- **Legal Content**: Search and retrieve provisions from EU procurement directives (2014/24/EU, 2014/25/EU, 2014/23/EU) and national transpositions (BVergG, GWB/VgV, BoeB)
- **Reference Data**: CPV codes, NUTS regions, procurement thresholds, procedure types, exclusion grounds, time limits
- **Award Intelligence**: TED notice search, buyer profiles, competitor analysis, price benchmarks, framework agreements, renewal forecasting
- **Cross-Reference**: Compare requirements across jurisdictions, validate citations

## Tools (19)

| # | Tool | Category |
|---|------|----------|
| 1 | `search_legislation` | Legal |
| 2 | `get_provision` | Legal |
| 3 | `get_directive_overview` | Legal |
| 4 | `get_cpv_codes` | Reference |
| 5 | `get_thresholds` | Reference |
| 6 | `get_procedure_types` | Reference |
| 7 | `get_exclusion_grounds` | Reference |
| 8 | `get_time_limits` | Reference |
| 9 | `compare_requirements` | Cross-reference |
| 10 | `validate_citation` | Cross-reference |
| 11 | `list_sources` | Metadata |
| 12 | `about` | Metadata |
| 13 | `check_data_freshness` | Metadata |
| 14 | `get_buyer_profile` | Award intelligence |
| 15 | `get_award_history` | Award intelligence |
| 16 | `get_competitor_profile` | Award intelligence |
| 17 | `get_price_benchmark` | Award intelligence |
| 18 | `get_framework_agreements` | Award intelligence |
| 19 | `get_renewal_forecast` | Award intelligence |

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
npm start        # stdio transport
npm run start:http  # HTTP transport on port 3000
```

### Run Tests

```bash
npm test
npm run test:coverage
```

## Data Sources

- **EUR-Lex**: EU procurement directives (CC BY 4.0)
- **TED**: Tenders Electronic Daily award notices (Open Data)
- **RIS**: Austrian federal law (BVergG)
- **Gesetze-im-Internet**: German procurement law (GWB/VgV)
- **Fedlex**: Swiss public procurement law (BoeB)

See `sources.yml` for full provenance details.

## License

Apache 2.0 -- see [LICENSE](LICENSE).

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

Built by [Ansvar Systems](https://ansvar.eu).
