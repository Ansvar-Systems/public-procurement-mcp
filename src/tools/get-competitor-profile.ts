/**
 * Tool 16: get_competitor_profile
 * Analyze a supplier/competitor: win count, sectors, geographies, average value, recent wins.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta, type SqlParam } from './_meta.js';

export interface GetCompetitorProfileParams {
  company_name: string;
}

interface SectorEntry {
  cpv_code: string;
  count: number;
}

interface GeographyEntry {
  country: string;
  count: number;
}

interface RecentWin {
  buyer_name: string;
  value_awarded: number | null;
  publication_date: string;
  cpv_main: string;
  title: string | null;
}

export function getCompetitorProfile(
  db: DatabaseAdapter,
  params: GetCompetitorProfileParams
) {
  const { company_name } = params;

  if (!company_name || company_name.trim().length === 0) {
    return {
      error: 'company_name parameter is required and must not be empty.',
      _meta: createMeta('https://ted.europa.eu/'),
    };
  }

  const namePattern = `%${company_name}%`;

  // Total wins
  const totalRow = db.queryOne<Record<string, unknown>>(
    `SELECT COUNT(*) as cnt FROM notices
     WHERE notice_type = 'contract_award' AND winner_name LIKE ?`,
    [namePattern]
  );
  const totalWins = (totalRow?.cnt as number) ?? 0;

  if (totalWins === 0) {
    return {
      error: `No award records found for company: "${company_name}"`,
      _meta: createMeta('https://ted.europa.eu/'),
    };
  }

  // Sector breakdown (CPV codes)
  const sectorRows = db.query<Record<string, unknown>>(
    `SELECT cpv_main as cpv_code, COUNT(*) as cnt
     FROM notices
     WHERE notice_type = 'contract_award' AND winner_name LIKE ?
     GROUP BY cpv_main
     ORDER BY cnt DESC`,
    [namePattern]
  );
  const sectors: SectorEntry[] = sectorRows.map((r) => ({
    cpv_code: r.cpv_code as string,
    count: r.cnt as number,
  }));

  // Geography breakdown
  const geoRows = db.query<Record<string, unknown>>(
    `SELECT winner_country as country, COUNT(*) as cnt
     FROM notices
     WHERE notice_type = 'contract_award' AND winner_name LIKE ? AND winner_country IS NOT NULL
     GROUP BY winner_country
     ORDER BY cnt DESC`,
    [namePattern]
  );
  const geographies: GeographyEntry[] = geoRows.map((r) => ({
    country: r.country as string,
    count: r.cnt as number,
  }));

  // Average contract value
  const avgRow = db.queryOne<Record<string, unknown>>(
    `SELECT AVG(value_awarded) as avg_val
     FROM notices
     WHERE notice_type = 'contract_award' AND winner_name LIKE ? AND value_awarded IS NOT NULL`,
    [namePattern]
  );
  const avgContractValue = (avgRow?.avg_val as number) ?? 0;

  // Recent wins (last 5)
  const recentRows = db.query<Record<string, unknown>>(
    `SELECT buyer_name, value_awarded, publication_date, cpv_main, title
     FROM notices
     WHERE notice_type = 'contract_award' AND winner_name LIKE ?
     ORDER BY publication_date DESC
     LIMIT 5`,
    [namePattern]
  );
  const recentWins: RecentWin[] = recentRows.map((r) => ({
    buyer_name: r.buyer_name as string,
    value_awarded: r.value_awarded as number | null,
    publication_date: r.publication_date as string,
    cpv_main: r.cpv_main as string,
    title: r.title as string | null,
  }));

  return {
    profile: {
      company_name,
      total_wins: totalWins,
      sectors,
      geographies,
      avg_contract_value: Math.round(avgContractValue * 100) / 100,
      recent_wins: recentWins,
    },
    _meta: createMeta('https://ted.europa.eu/'),
  };
}
