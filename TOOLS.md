# Tools Reference — Public Procurement MCP

19 tools organized in three categories: Legal Knowledge (1-10), Meta (11-13), and Competitive Intelligence (14-19).

Every response includes a `_meta` object with `disclaimer`, `data_age`, and `source_url`.

---

## Legal Knowledge Tools (1-10)

### 1. search_legislation

Full-text search across all procurement law provisions using FTS5 with BM25 relevance ranking.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| query | string | yes | -- | Search query. Supports FTS5 syntax: quoted phrases, AND/OR/NOT operators. |
| jurisdiction | string | no | -- | Filter by jurisdiction: `EU`, `CH`, `AT`, `DE`. |
| directive | string | no | -- | Filter by directive short title, CELEX number, or title substring. |
| limit | number | no | 20 | Maximum results (1-50). |

**Returns:** `{ results: [{ article_number, title, directive_title, directive_short_title, jurisdiction, snippet }], total, query, _meta }`

**Example:**
```json
{
  "name": "search_legislation",
  "arguments": { "query": "exclusion grounds corruption", "jurisdiction": "EU" }
}
```

**Response snippet:**
```json
{
  "results": [
    {
      "article_number": "57",
      "title": "Exclusion grounds",
      "directive_title": "Directive 2014/24/EU — Public procurement",
      "directive_short_title": "2014/24/EU",
      "jurisdiction": "EU",
      "snippet": "...shall exclude an economic operator from participation where it has established, by >>>corruption<<< ..."
    }
  ],
  "total": 1
}
```

**Limitations:** FTS5 prefix expansion is automatic. Complex boolean queries may fail on malformed syntax. Maximum 50 results per call.

---

### 2. get_provision

Retrieve the full text of a specific article from a procurement directive or national law. If no article is specified, returns all provisions for the directive.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| directive_id | string | yes | -- | Directive identifier: short title (e.g., `2014/24/EU`), CELEX number, or title substring (e.g., `BVergG`). |
| article | string | no | -- | Article number (e.g., `18`, `57`). Omit to return all articles. |

**Returns (single article):** `{ article_number, title, body, directive: { title, short_title, jurisdiction, celex_number, effective_date }, _meta }`

**Returns (all articles):** `{ directive: { ... }, provisions: [{ article_number, title, body }], total, _meta }`

**Example:**
```json
{
  "name": "get_provision",
  "arguments": { "directive_id": "2014/24/EU", "article": "18" }
}
```

**Response snippet:**
```json
{
  "article_number": "18",
  "title": "Principles of procurement",
  "body": "1. Contracting authorities shall treat economic operators equally and without discrimination ...",
  "directive": {
    "title": "Directive 2014/24/EU — Public procurement",
    "short_title": "2014/24/EU",
    "jurisdiction": "EU"
  }
}
```

**Limitations:** Retrieving all provisions for a large directive (e.g., BVergG with ~350 articles) may produce a large response. Use `search_legislation` for discovery first.

---

### 3. get_directive_overview

Summary overview of a procurement directive including scope, key articles, threshold data, and procedure types.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| directive_id | string | yes | -- | Directive identifier: short title, CELEX number, or title substring. |

**Returns:** `{ title, short_title, jurisdiction, type, celex_number, effective_date, scope, article_count, key_articles: [{ article_number, title }], thresholds: [{ category, value_eur, effective_from, effective_to }], procedure_types: [{ name, conditions, min_candidates }], _meta }`

**Example:**
```json
{
  "name": "get_directive_overview",
  "arguments": { "directive_id": "2014/24/EU" }
}
```

**Response snippet:**
```json
{
  "title": "Directive 2014/24/EU — Public procurement",
  "short_title": "2014/24/EU",
  "article_count": 94,
  "thresholds": [
    { "category": "works", "value_eur": 5382000, "effective_from": "2024-01-01" }
  ],
  "procedure_types": [
    { "name": "Open procedure", "conditions": "No restrictions", "min_candidates": null }
  ]
}
```

**Limitations:** Scope text is extracted from Article 1 if present. Some directives may not have threshold or procedure type data.

---

### 4. get_cpv_codes

Look up Common Procurement Vocabulary (CPV) codes by keyword or code prefix. Supports English, German, and French descriptions.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| query | string | yes | -- | Keyword (e.g., `software`) or CPV code prefix (e.g., `72`). |
| level | number | no | -- | Filter by hierarchy level (1-5). |
| limit | number | no | 20 | Maximum results (1-50). |

**Returns:** `{ results: [{ code, description_en, description_de, description_fr, parent_code, level }], total, query, _meta }`

**Example:**
```json
{
  "name": "get_cpv_codes",
  "arguments": { "query": "cybersecurity", "limit": 5 }
}
```

**Response snippet:**
```json
{
  "results": [
    {
      "code": "72212730-5",
      "description_en": "Security software development services",
      "description_de": "Entwicklung von Sicherheitssoftware",
      "description_fr": "Services de developpement de logiciels de securite",
      "parent_code": "72212700-0",
      "level": 4
    }
  ],
  "total": 1
}
```

**Limitations:** Keyword search uses LIKE matching, not FTS. Code prefix search matches from the start of the code string.

---

### 5. get_thresholds

Current procurement value thresholds by category and jurisdiction. Shows which directives they derive from and their validity periods.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| category | string | no | -- | Threshold category (e.g., `works`, `supplies`, `services`). |
| jurisdiction | string | no | -- | Filter by jurisdiction (`EU`, `DE`, `AT`, `CH`). |
| as_of_date | string | no | -- | Date to check thresholds for (ISO 8601, e.g., `2024-06-15`). |

**Returns:** `{ results: [{ category, value_eur, effective_from, effective_to, directive_title, directive_short_title, jurisdiction }], total, _meta }`

**Example:**
```json
{
  "name": "get_thresholds",
  "arguments": { "jurisdiction": "EU", "category": "works" }
}
```

**Response snippet:**
```json
{
  "results": [
    {
      "category": "works",
      "value_eur": 5382000,
      "effective_from": "2024-01-01",
      "effective_to": "2025-12-31",
      "directive_short_title": "2014/24/EU",
      "jurisdiction": "EU"
    }
  ],
  "total": 1
}
```

**Limitations:** Thresholds are manually maintained and cover the 2024-2025 period. Historical threshold data may not be complete.

---

### 6. get_procedure_types

List procurement procedure types with their conditions, minimum candidate requirements, and time limits.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| directive_id | string | no | -- | Filter by directive short title, CELEX number, or title. |
| jurisdiction | string | no | -- | Filter by jurisdiction. |

**Returns:** `{ results: [{ name, conditions, min_candidates, time_limits, directive_title, directive_short_title, jurisdiction }], total, _meta }`

**Example:**
```json
{
  "name": "get_procedure_types",
  "arguments": { "jurisdiction": "EU" }
}
```

**Response snippet:**
```json
{
  "results": [
    {
      "name": "Open procedure",
      "conditions": "No restrictions",
      "min_candidates": null,
      "time_limits": { "min_tender_receipt_days": 35 },
      "directive_short_title": "2014/24/EU",
      "jurisdiction": "EU"
    }
  ],
  "total": 5
}
```

**Limitations:** Time limits JSON may be null for some procedure types if data is not available.

---

### 7. get_exclusion_grounds

Mandatory and discretionary exclusion grounds for a jurisdiction, with article references and descriptions.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| jurisdiction | string | yes | -- | Jurisdiction code (e.g., `EU`, `DE`, `AT`). |
| type | string | no | `both` | Filter: `mandatory`, `discretionary`, or `both`. |

**Returns:** `{ jurisdiction, mandatory: [{ ground, article_reference, description, directive_short_title }], discretionary: [...], total, _meta }`

**Example:**
```json
{
  "name": "get_exclusion_grounds",
  "arguments": { "jurisdiction": "EU", "type": "mandatory" }
}
```

**Response snippet:**
```json
{
  "jurisdiction": "EU",
  "mandatory": [
    {
      "ground": "Corruption",
      "article_reference": "Art. 57(1)(b)",
      "description": "Participation in a criminal organisation as defined in Article 2 of Council Framework Decision ...",
      "directive_short_title": "2014/24/EU"
    }
  ],
  "total": 6
}
```

**Limitations:** National transposition grounds (DE, AT, CH) may differ from EU directive grounds. Cross-reference with national law for complete picture.

---

### 8. get_time_limits

Minimum time limits for each procedure type, including standstill periods and submission deadlines.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| procedure_type | string | no | -- | Filter by procedure type name (partial match). |
| directive_id | string | no | -- | Filter by directive short title, CELEX number, or title. |

**Returns:** `{ results: [{ procedure, time_limits: { min_tender_receipt_days, ... }, min_candidates, directive_short_title, jurisdiction }], total, _meta }`

**Example:**
```json
{
  "name": "get_time_limits",
  "arguments": { "procedure_type": "restricted" }
}
```

**Response snippet:**
```json
{
  "results": [
    {
      "procedure": "Restricted procedure",
      "time_limits": {
        "min_request_participation_days": 30,
        "min_tender_receipt_days": 30
      },
      "min_candidates": 5,
      "directive_short_title": "2014/24/EU",
      "jurisdiction": "EU"
    }
  ],
  "total": 1
}
```

**Limitations:** Only procedures with `time_limits_json` data are returned. Some national procedures may not have complete time limit data.

---

### 9. compare_requirements

Cross-jurisdiction comparison of procurement requirements on a specific topic. Automatically detects topic type (thresholds, exclusion grounds, procedures) for structured comparison, or falls back to FTS search for other topics.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| topic | string | yes | -- | Topic to compare (e.g., `thresholds`, `exclusion grounds`, `electronic submission`). |
| jurisdictions | string[] | yes | -- | Jurisdictions to compare (e.g., `["EU", "DE", "AT"]`). |

**Returns:** `{ topic, jurisdictions, comparison: { [key]: [...] }, _meta }`

The comparison object is grouped by category (for thresholds), by jurisdiction (for exclusion grounds and procedures), or by jurisdiction (for generic FTS results).

**Example:**
```json
{
  "name": "compare_requirements",
  "arguments": {
    "topic": "exclusion grounds",
    "jurisdictions": ["EU", "DE", "AT"]
  }
}
```

**Response snippet:**
```json
{
  "topic": "exclusion_grounds",
  "jurisdictions": ["EU", "DE", "AT"],
  "comparison": {
    "EU": [{ "type": "mandatory", "ground": "Corruption", "article_reference": "Art. 57(1)(b)" }],
    "DE": [{ "type": "mandatory", "ground": "Bestechung", "article_reference": "§ 123(1)" }]
  }
}
```

**Limitations:** Generic topic comparison uses FTS search, limited to 30 results across all jurisdictions. Structured comparison is only available for `thresholds`, `exclusion grounds`, and `procedures`.

---

### 10. validate_citation

Validate a procurement law citation against the database. Checks that both the directive/law and the specific article exist.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| citation | string | yes | -- | Citation string to validate. |

**Supported formats:**
- `Article 18, Directive 2014/24/EU`
- `Art. 57(1) Directive 2014/24/EU`
- `Section 97 GWB`
- `Art. 26(1)(a) BoeB`

**Returns:** `{ valid, parsed: { article, directive, raw }, document_exists, provision_exists, correct_form, directive: { title, short_title, jurisdiction }, provision: { article_number, title, body }, _meta }`

**Example:**
```json
{
  "name": "validate_citation",
  "arguments": { "citation": "Article 57, Directive 2014/24/EU" }
}
```

**Response snippet:**
```json
{
  "valid": true,
  "parsed": { "article": "57", "directive": "2014/24/EU" },
  "document_exists": true,
  "provision_exists": true,
  "correct_form": "Article 57, 2014/24/EU",
  "directive": {
    "title": "Directive 2014/24/EU — Public procurement",
    "short_title": "2014/24/EU",
    "jurisdiction": "EU"
  }
}
```

**Limitations:** Subsection references (e.g., `(1)(a)`) are parsed but only the base article number is validated against the database. The tool does not verify subsection existence.

---

## Meta Tools (11-13)

### 11. list_sources

List all data sources with provenance metadata, coverage scope, and dataset statistics.

**Parameters:** None.

**Returns:** `{ tables: { directives, provisions, cpv_codes, nuts_regions, notices, buyer_profiles, cpv_benchmarks }, sources: [{ name, authority, url, coverage }], jurisdictions, coverage, _meta }`

**Example:**
```json
{
  "name": "list_sources",
  "arguments": {}
}
```

**Response snippet:**
```json
{
  "tables": {
    "directives": 14,
    "provisions": 2200,
    "cpv_codes": 9454,
    "nuts_regions": 1500,
    "notices": 0,
    "buyer_profiles": 0,
    "cpv_benchmarks": 0
  },
  "sources": [
    { "name": "EUR-Lex", "authority": "Official Journal of the European Union", "url": "https://eur-lex.europa.eu/" }
  ],
  "jurisdictions": ["AT", "CH", "DE", "EU"]
}
```

**Limitations:** Notice and derived data counts depend on TED ingestion status.

---

### 12. about

Server metadata, dataset statistics, data freshness, and security posture.

**Parameters:** None.

**Returns:** `{ name, version, description, tool_count, coverage: { directives, provisions, cpv_codes, award_notices }, jurisdictions, security: { read_only, no_network, no_filesystem_write, no_code_execution }, _meta }`

**Example:**
```json
{
  "name": "about",
  "arguments": {}
}
```

**Response snippet:**
```json
{
  "name": "@ansvar/public-procurement-mcp",
  "version": "0.1.0",
  "tool_count": 19,
  "coverage": {
    "directives": 14,
    "provisions": 2200,
    "cpv_codes": 9454,
    "award_notices": 0
  },
  "security": {
    "read_only": true,
    "no_network": true,
    "no_filesystem_write": true,
    "no_code_execution": true
  }
}
```

**Limitations:** None.

---

### 13. check_data_freshness

Check how current each data source is and whether any need refreshing. Uses per-table staleness thresholds (7 days for award data, 30 days for legal, 90 days for reference).

**Parameters:** None.

**Returns:** `{ sources: [{ table, last_updated, age_days, threshold_days, is_stale }], overall_status, checked_at, _meta }`

`overall_status` is one of: `fresh`, `stale`, `mixed`.

**Example:**
```json
{
  "name": "check_data_freshness",
  "arguments": {}
}
```

**Response snippet:**
```json
{
  "sources": [
    { "table": "directives", "last_updated": "2026-02-25", "age_days": 0, "threshold_days": 30, "is_stale": false },
    { "table": "notices", "last_updated": "2026-02-20", "age_days": 5, "threshold_days": 7, "is_stale": false }
  ],
  "overall_status": "fresh",
  "checked_at": "2026-02-25T10:00:00.000Z"
}
```

**Limitations:** Tables without timestamp columns (cpv_codes, nuts_regions) report today's date as last_updated. An `age_days` of -1 indicates the timestamp could not be determined.

---

## Competitive Intelligence Tools (14-19)

### 14. get_buyer_profile

Get a contracting authority profile from the materialized `buyer_profiles` view. Shows award history, preferred procedures, average contract values, and top CPV codes.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| buyer_id | string | no | -- | Buyer identifier from TED. |
| buyer_name | string | no | -- | Buyer name (fuzzy search via LIKE). |

At least one of `buyer_id` or `buyer_name` is required.

**Returns:** `{ profile: { buyer_id, buyer_name, buyer_nuts, total_awards, avg_value_eur, median_value_eur, preferred_procedure, preferred_criteria, avg_bidders, top_cpv_codes, first_seen, last_seen }, _meta }`

**Example:**
```json
{
  "name": "get_buyer_profile",
  "arguments": { "buyer_name": "Bundesamt" }
}
```

**Response snippet:**
```json
{
  "profile": {
    "buyer_name": "Bundesamt fuer Informatik und Telekommunikation",
    "buyer_nuts": "CH0",
    "total_awards": 42,
    "avg_value_eur": 850000,
    "preferred_procedure": "Open procedure",
    "top_cpv_codes": "72000000,48000000"
  }
}
```

**Limitations:** Requires TED notices to be ingested and buyer_profiles materialized view to be rebuilt. Fuzzy name search uses LIKE matching and may return the first match only.

---

### 15. get_award_history

Search TED award notices with filters for CPV code, NUTS region, and date range.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| cpv_code | string | yes | -- | CPV code or prefix (e.g., `72` for all IT services). |
| nuts_region | string | no | -- | NUTS region code prefix (e.g., `DE` for Germany, `AT1` for Eastern Austria). |
| year_from | number | no | -- | Start year filter. |
| year_to | number | no | -- | End year filter. |
| limit | number | no | 20 | Maximum results (1-50). |

**Returns:** `{ awards: [{ buyer_name, buyer_nuts, cpv_main, winner_name, winner_country, value_awarded, publication_date, num_tenders_received, procedure_type, title, contract_duration_months }], total, _meta }`

**Example:**
```json
{
  "name": "get_award_history",
  "arguments": { "cpv_code": "72000000", "nuts_region": "DE", "year_from": 2024 }
}
```

**Response snippet:**
```json
{
  "awards": [
    {
      "buyer_name": "Stadt Munchen",
      "cpv_main": "72212000",
      "winner_name": "IT Solutions GmbH",
      "value_awarded": 450000,
      "publication_date": "2024-06-15",
      "num_tenders_received": 4
    }
  ],
  "total": 1
}
```

**Limitations:** Only `contract_award` notice types are searched. CPV code matching uses prefix (LIKE `code%`). Requires TED notice ingestion.

---

### 16. get_competitor_profile

Analyze a supplier/competitor: total wins, sector breakdown (CPV codes), geographic spread, average contract value, and recent wins.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| company_name | string | yes | -- | Company name to search (fuzzy LIKE match). |

**Returns:** `{ profile: { company_name, total_wins, sectors: [{ cpv_code, count }], geographies: [{ country, count }], avg_contract_value, recent_wins: [{ buyer_name, value_awarded, publication_date, cpv_main, title }] }, _meta }`

**Example:**
```json
{
  "name": "get_competitor_profile",
  "arguments": { "company_name": "Siemens" }
}
```

**Response snippet:**
```json
{
  "profile": {
    "company_name": "Siemens",
    "total_wins": 156,
    "sectors": [
      { "cpv_code": "72000000", "count": 45 },
      { "cpv_code": "48000000", "count": 32 }
    ],
    "geographies": [
      { "country": "DE", "count": 89 },
      { "country": "AT", "count": 34 }
    ],
    "avg_contract_value": 1250000.50,
    "recent_wins": [
      { "buyer_name": "Bundesagentur", "value_awarded": 3200000, "publication_date": "2025-01-10" }
    ]
  }
}
```

**Limitations:** Company name matching is fuzzy (LIKE `%name%`) and may match unrelated companies with similar names. Recent wins limited to last 5.

---

### 17. get_price_benchmark

Price benchmarks for a CPV code: percentile values (p25, median, p75), average bidder count, and top winners, broken down by country and year.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| cpv_code | string | yes | -- | CPV code (exact match against materialized view). |
| nuts_country | string | no | -- | Country code (e.g., `DE`, `AT`). |
| year_from | number | no | -- | Start year. |
| year_to | number | no | -- | End year. |

**Returns:** `{ benchmarks: [{ cpv_main, nuts_country, year, award_count, p25_value, median_value, p75_value, avg_bidders, top_winners }], total, _meta }`

**Example:**
```json
{
  "name": "get_price_benchmark",
  "arguments": { "cpv_code": "72212000", "nuts_country": "DE" }
}
```

**Response snippet:**
```json
{
  "benchmarks": [
    {
      "cpv_main": "72212000",
      "nuts_country": "DE",
      "year": 2024,
      "award_count": 87,
      "p25_value": 120000,
      "median_value": 350000,
      "p75_value": 850000,
      "avg_bidders": 3.4,
      "top_winners": "SAP,T-Systems,Capgemini"
    }
  ],
  "total": 1
}
```

**Limitations:** Requires `cpv_benchmarks` materialized view to be populated. Exact CPV code match only (no prefix search). Benchmarks are indicative based on TED data and may not reflect actual market prices.

---

### 18. get_framework_agreements

Find active and recent framework agreements by CPV code and NUTS region.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| cpv_code | string | yes | -- | CPV code or prefix. |
| nuts_region | string | no | -- | NUTS region code prefix. |
| limit | number | no | 20 | Maximum results (1-50). |

**Returns:** `{ agreements: [{ buyer_name, buyer_nuts, cpv_main, winner_name, winner_country, value_estimated, value_awarded, publication_date, contract_duration_months, title, procedure_type }], total, _meta }`

**Example:**
```json
{
  "name": "get_framework_agreements",
  "arguments": { "cpv_code": "72000000", "nuts_region": "AT" }
}
```

**Response snippet:**
```json
{
  "agreements": [
    {
      "buyer_name": "Bundesbeschaffung GmbH",
      "cpv_main": "72000000",
      "winner_name": "Atos IT Solutions",
      "value_estimated": 5000000,
      "publication_date": "2024-03-01",
      "contract_duration_months": 48,
      "procedure_type": "Open procedure"
    }
  ],
  "total": 1
}
```

**Limitations:** Only notices flagged as `framework_agreement = 1` are returned. Active status is inferred from publication date + duration, not from a live status field.

---

### 19. get_renewal_forecast

Predict upcoming contract renewals based on award date plus contract duration. Returns contracts whose estimated retender date falls within the forecast window.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| cpv_code | string | no | -- | CPV code or prefix to filter. |
| nuts_region | string | no | -- | NUTS region code prefix. |
| months_ahead | number | no | 12 | Forecast horizon in months from today. |
| limit | number | no | 20 | Maximum results (1-50). |

**Returns:** `{ forecasts: [{ buyer_name, buyer_nuts, cpv_main, winner_name, value_awarded, publication_date, contract_duration_months, estimated_retender_date, title }], total, months_ahead, forecast_window: { from, to }, _meta }`

**Example:**
```json
{
  "name": "get_renewal_forecast",
  "arguments": { "cpv_code": "72", "months_ahead": 6 }
}
```

**Response snippet:**
```json
{
  "forecasts": [
    {
      "buyer_name": "Stadt Wien",
      "cpv_main": "72212000",
      "winner_name": "Consulting AG",
      "value_awarded": 280000,
      "publication_date": "2022-08-15",
      "contract_duration_months": 48,
      "estimated_retender_date": "2026-08-15"
    }
  ],
  "total": 1,
  "months_ahead": 6,
  "forecast_window": { "from": "2026-02-25", "to": "2026-08-25" }
}
```

**Limitations:** Forecast is a simple calculation (award date + duration). Actual retender dates may differ due to extensions, options, or early termination. Only contracts with `contract_duration_months` are included.
