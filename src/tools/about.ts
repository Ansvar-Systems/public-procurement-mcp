/**
 * Tool 12: about
 * Server metadata, dataset statistics, data freshness, and security posture.
 */

import type { DatabaseAdapter } from '../database/adapter.js';
import { createMeta } from './_meta.js';

export function about(db: DatabaseAdapter) {
  // Get counts for coverage summary
  const directiveCount = db.queryOne<Record<string, unknown>>(
    `SELECT COUNT(*) as cnt FROM directives`
  );
  const provisionCount = db.queryOne<Record<string, unknown>>(
    `SELECT COUNT(*) as cnt FROM provisions`
  );
  const cpvCount = db.queryOne<Record<string, unknown>>(
    `SELECT COUNT(*) as cnt FROM cpv_codes`
  );

  let noticeCount: Record<string, unknown> | undefined;
  try {
    noticeCount = db.queryOne<Record<string, unknown>>(
      `SELECT COUNT(*) as cnt FROM notices WHERE notice_type = 'contract_award'`
    );
  } catch {
    noticeCount = { cnt: 0 };
  }

  // Get distinct jurisdictions
  const jurisdictionRows = db.query<Record<string, unknown>>(
    `SELECT DISTINCT jurisdiction FROM directives ORDER BY jurisdiction`
  );
  const jurisdictions = jurisdictionRows.map((r) => r.jurisdiction as string);

  return {
    name: '@ansvar/public-procurement-mcp',
    version: '0.1.0',
    description:
      'Public procurement law, CPV taxonomy, and TED award intelligence. Provides 19 MCP tools covering EU directives (2014/24/EU, 2014/25/EU), national transpositions (DE, AT, CH), CPV code lookup, threshold data, procedure types, exclusion grounds, and competitive intelligence from TED award notices.',
    tool_count: 19,
    coverage: {
      directives: (directiveCount?.cnt as number) ?? 0,
      provisions: (provisionCount?.cnt as number) ?? 0,
      cpv_codes: (cpvCount?.cnt as number) ?? 0,
      award_notices: (noticeCount?.cnt as number) ?? 0,
    },
    jurisdictions,
    security: {
      read_only: true,
      no_network: true,
      no_filesystem_write: true,
      no_code_execution: true,
    },
    _meta: createMeta(),
  };
}
