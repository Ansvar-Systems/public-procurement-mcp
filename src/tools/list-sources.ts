/**
 * Tool 11: list_sources
 * Lists all data sources with provenance metadata, coverage scope, and dataset statistics.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta } from './_meta.js';

interface TableCounts {
  directives: number;
  provisions: number;
  cpv_codes: number;
  nuts_regions: number;
  notices: number;
  buyer_profiles: number;
  cpv_benchmarks: number;
}

interface DataSource {
  name: string;
  authority: string;
  url: string;
  coverage: string;
}

const DATA_SOURCES: DataSource[] = [
  {
    name: 'EUR-Lex',
    authority: 'Official Journal of the European Union',
    url: 'https://eur-lex.europa.eu/',
    coverage: 'EU procurement directives (2014/24/EU, 2014/25/EU)',
  },
  {
    name: 'Fedlex',
    authority: 'Swiss Federal Chancellery',
    url: 'https://www.fedlex.admin.ch/',
    coverage: 'Swiss public procurement law (BoeB)',
  },
  {
    name: 'gesetze-im-internet',
    authority: 'German Federal Ministry of Justice',
    url: 'https://www.gesetze-im-internet.de/',
    coverage: 'German procurement law (GWB Part 4)',
  },
  {
    name: 'RIS',
    authority: 'Austrian Federal Chancellery',
    url: 'https://www.ris.bka.gv.at/',
    coverage: 'Austrian procurement law (BVergG 2018)',
  },
  {
    name: 'TED',
    authority: 'Tenders Electronic Daily (EU Publications Office)',
    url: 'https://ted.europa.eu/',
    coverage: 'Contract notices and award notices across EU/EEA',
  },
];

function getTableCount(db: DatabaseAdapter, table: string): number {
  try {
    const row = db.queryOne<Record<string, unknown>>(
      `SELECT COUNT(*) as cnt FROM ${table}`
    );
    return (row?.cnt as number) ?? 0;
  } catch {
    return 0;
  }
}

export function listSources(db: DatabaseAdapter) {
  const tables: TableCounts = {
    directives: getTableCount(db, 'directives'),
    provisions: getTableCount(db, 'provisions'),
    cpv_codes: getTableCount(db, 'cpv_codes'),
    nuts_regions: getTableCount(db, 'nuts_regions'),
    notices: getTableCount(db, 'notices'),
    buyer_profiles: getTableCount(db, 'buyer_profiles'),
    cpv_benchmarks: getTableCount(db, 'cpv_benchmarks'),
  };

  // Get distinct jurisdictions
  const jurisdictionRows = db.query<Record<string, unknown>>(
    `SELECT DISTINCT jurisdiction FROM directives ORDER BY jurisdiction`
  );
  const jurisdictions = jurisdictionRows.map((r) => r.jurisdiction as string);

  const coverage = [
    `${tables.directives} directives/national laws`,
    `${tables.provisions} provisions/articles`,
    `${tables.cpv_codes} CPV codes`,
    `${tables.notices} award notices`,
    `${tables.buyer_profiles} buyer profiles`,
    `${tables.cpv_benchmarks} CPV benchmarks`,
    `Jurisdictions: ${jurisdictions.join(', ')}`,
  ].join('. ');

  return {
    tables,
    sources: DATA_SOURCES,
    jurisdictions,
    coverage,
    _meta: createMeta(),
  };
}
