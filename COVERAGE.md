# Coverage Manifest — Public Procurement MCP

## Legal Content

### EU Directives
| Directive | Short Title | Articles | Status |
|-----------|------------|----------|--------|
| 2014/24/EU | Public Procurement | ~100 | Ingested |
| 2014/25/EU | Utilities Procurement | ~100 | Ingested |
| 2014/23/EU | Concessions | ~55 | Ingested |
| 2009/81/EC | Defence Procurement | ~75 | Ingested |
| 2007/66/EC | Remedies | ~12 | Ingested |

### National Transpositions
| Country | Law | Short Title | Articles | Status |
|---------|-----|------------|----------|--------|
| Switzerland | SR-172.056.1 | BöB | ~70 | Ingested |
| Switzerland | SR-172.056.11 | VöB | ~50 | Ingested |
| Austria | BVergG 2018 | BVergG | ~350 | Ingested |
| Austria | BVergGKonz 2018 | BVergGKonz | ~150 | Ingested |
| Germany | GWB Part 4 | GWB | ~40 | Ingested |
| Germany | VgV | VgV | ~80 | Ingested |
| Germany | SektVO | SektVO | ~50 | Ingested |
| Germany | KonzVgV | KonzVgV | ~30 | Ingested |
| Germany | VSVgV | VSVgV | ~40 | Ingested |

### Reference Data
| Dataset | Records | Source |
|---------|---------|--------|
| CPV Codes | 9,454 | EU Publications Office |
| NUTS Regions | ~1,500 | Eurostat |
| Thresholds | 21 | Manual (2024-2025 values) |
| Procedure Types | 21 | Manual from directives |
| Exclusion Grounds | 33 | Art. 57 + national |

### Award Intelligence
| Dataset | Records | Source | Update Frequency |
|---------|---------|--------|-----------------|
| TED Notices | ~4M (backfill target) | TED eSender API | Daily (05:00 UTC) |
| Buyer Profiles | Derived | Materialized view | After each ingestion |
| CPV Benchmarks | Derived | Materialized view | After each ingestion |

## NOT Covered
- Sub-threshold national procurement (below EU thresholds)
- Municipal/regional procurement portals
- Case law and tribunal decisions
- Soft law, guidelines, and best practice documents
- Dynamic purchasing systems details
- eCertis qualification evidence
