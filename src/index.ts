#!/usr/bin/env node

/**
 * Public Procurement MCP Server
 *
 * Provides 19 tools for EU/CH/AT/DE public procurement:
 * - Legal content: search_legislation, get_provision, get_directive_overview
 * - Reference data: get_cpv_codes, get_thresholds, get_procedure_types,
 *   get_exclusion_grounds, get_time_limits
 * - Cross-reference: compare_requirements, validate_citation
 * - Metadata: list_sources, about, check_data_freshness
 * - Award intelligence: get_buyer_profile, get_award_history,
 *   get_competitor_profile, get_price_benchmark, get_framework_agreements,
 *   get_renewal_forecast
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { DatabaseAdapter } from './database/adapter.js';
import { buildCitation } from './citation.js';
import { searchLegislation } from './tools/search-legislation.js';
import { getProvision } from './tools/get-provision.js';
import { getDirectiveOverview } from './tools/get-directive-overview.js';
import { getCpvCodes } from './tools/get-cpv-codes.js';
import { getThresholds } from './tools/get-thresholds.js';
import { getProcedureTypes } from './tools/get-procedure-types.js';
import { getExclusionGrounds } from './tools/get-exclusion-grounds.js';
import { getTimeLimits } from './tools/get-time-limits.js';
import { compareRequirements } from './tools/compare-requirements.js';
import { validateCitation } from './tools/validate-citation.js';
import { listSources } from './tools/list-sources.js';
import { about } from './tools/about.js';
import { checkDataFreshness } from './tools/check-data-freshness.js';
import { getBuyerProfile } from './tools/get-buyer-profile.js';
import { getAwardHistory } from './tools/get-award-history.js';
import { getCompetitorProfile } from './tools/get-competitor-profile.js';
import { getPriceBenchmark } from './tools/get-price-benchmark.js';
import { getFrameworkAgreements } from './tools/get-framework-agreements.js';
import { getRenewalForecast } from './tools/get-renewal-forecast.js';

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'search_legislation',
    description:
      'Full-text search across procurement directives and national transpositions. Returns matching provisions with BM25 relevance ranking and snippet highlighting.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query. Supports FTS5 syntax: quoted phrases, AND/OR/NOT.' },
        jurisdiction: { type: 'string', description: 'Filter by jurisdiction (e.g., "EU", "DE", "AT", "CH").' },
        limit: { type: 'number', description: 'Maximum results (default: 10, max: 50).', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_provision',
    description:
      'Retrieve the full text of a specific article from a procurement directive or national law.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directive_id: { type: 'string', description: 'Directive identifier or title.' },
        article: { type: 'string', description: 'Article number (e.g., "18", "46").' },
      },
      required: ['directive_id'],
    },
  },
  {
    name: 'get_directive_overview',
    description:
      'Get a summary overview of a procurement directive including scope, key articles, and transposition status.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directive_id: { type: 'string', description: 'Directive identifier or title.' },
      },
      required: ['directive_id'],
    },
  },
  {
    name: 'get_cpv_codes',
    description:
      'Look up Common Procurement Vocabulary (CPV) codes by keyword or code prefix. Returns code, description in EN/DE/FR, and hierarchy.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Keyword or CPV code prefix to search.' },
        level: { type: 'number', description: 'Filter by hierarchy level (1-5).' },
        limit: { type: 'number', description: 'Maximum results (default: 20).', default: 20 },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_thresholds',
    description:
      'Get current procurement value thresholds by category and jurisdiction. Shows when thresholds apply and their EUR values.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', description: 'Threshold category (e.g., "works", "supplies", "services").' },
        jurisdiction: { type: 'string', description: 'Filter by jurisdiction.' },
        as_of_date: { type: 'string', description: 'Date to check thresholds for (ISO 8601). Defaults to today.' },
      },
    },
  },
  {
    name: 'get_procedure_types',
    description:
      'List available procurement procedure types with their conditions, minimum candidates, and time limits.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directive_id: { type: 'string', description: 'Filter by directive.' },
        jurisdiction: { type: 'string', description: 'Filter by jurisdiction.' },
      },
    },
  },
  {
    name: 'get_exclusion_grounds',
    description:
      'Get mandatory and discretionary exclusion grounds for a jurisdiction, with article references.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        jurisdiction: { type: 'string', description: 'Jurisdiction (e.g., "EU", "DE", "AT").' },
        type: { type: 'string', description: 'Filter by type: "mandatory" or "discretionary".' },
      },
      required: ['jurisdiction'],
    },
  },
  {
    name: 'get_time_limits',
    description:
      'Get minimum time limits for each procedure type (standstill periods, submission deadlines, etc.).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        procedure_type: { type: 'string', description: 'Procedure type name.' },
        directive_id: { type: 'string', description: 'Filter by directive.' },
      },
    },
  },
  {
    name: 'compare_requirements',
    description:
      'Compare procurement requirements across jurisdictions or directives on a specific topic.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        topic: { type: 'string', description: 'Topic to compare (e.g., "electronic submission", "subcontracting").' },
        jurisdictions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Jurisdictions to compare (e.g., ["EU", "DE", "AT"]).',
        },
      },
      required: ['topic', 'jurisdictions'],
    },
  },
  {
    name: 'validate_citation',
    description:
      'Validate a procurement law citation against the database. Checks document and provision existence.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        citation: { type: 'string', description: 'Citation to validate (e.g., "Article 18, Directive 2014/24/EU").' },
      },
      required: ['citation'],
    },
  },
  {
    name: 'list_sources',
    description:
      'List all data sources with provenance metadata, coverage scope, and dataset statistics.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'about',
    description:
      'Server metadata, dataset statistics, data freshness, and security posture.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'check_data_freshness',
    description:
      'Check how current each data source is and whether any sources need refreshing.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_buyer_profile',
    description:
      'Get a contracting authority profile: award history, preferred procedures, average contract values, top CPV codes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        buyer_id: { type: 'string', description: 'Buyer identifier from TED.' },
        buyer_name: { type: 'string', description: 'Buyer name (fuzzy search if buyer_id not known).' },
      },
    },
  },
  {
    name: 'get_award_history',
    description:
      'Search TED award notices with filters for CPV, buyer, date range, value range, and procedure type.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cpv_code: { type: 'string', description: 'CPV code or prefix.' },
        buyer_id: { type: 'string', description: 'Buyer identifier.' },
        buyer_nuts: { type: 'string', description: 'NUTS region code.' },
        date_from: { type: 'string', description: 'Start date (ISO 8601).' },
        date_to: { type: 'string', description: 'End date (ISO 8601).' },
        min_value: { type: 'number', description: 'Minimum contract value in EUR.' },
        max_value: { type: 'number', description: 'Maximum contract value in EUR.' },
        procedure_type: { type: 'string', description: 'Filter by procedure type.' },
        limit: { type: 'number', description: 'Maximum results (default: 20).', default: 20 },
      },
    },
  },
  {
    name: 'get_competitor_profile',
    description:
      'Analyze a supplier/competitor: win rate, preferred CPV codes, geographic spread, average contract size.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        winner_name: { type: 'string', description: 'Company name to profile.' },
        winner_country: { type: 'string', description: 'Country code to narrow search.' },
      },
      required: ['winner_name'],
    },
  },
  {
    name: 'get_price_benchmark',
    description:
      'Get price benchmarks for a CPV code in a region: percentiles (p25, median, p75), average bidders, and top winners.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cpv_code: { type: 'string', description: 'CPV code.' },
        nuts_country: { type: 'string', description: 'Country code (e.g., "DE", "AT").' },
        year: { type: 'number', description: 'Year for benchmarks (default: current year).' },
      },
      required: ['cpv_code'],
    },
  },
  {
    name: 'get_framework_agreements',
    description:
      'Find active and recent framework agreements by CPV code, buyer, or region.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cpv_code: { type: 'string', description: 'CPV code or prefix.' },
        buyer_id: { type: 'string', description: 'Buyer identifier.' },
        buyer_nuts: { type: 'string', description: 'NUTS region.' },
        active_only: { type: 'boolean', description: 'Only return currently active agreements.', default: true },
        limit: { type: 'number', description: 'Maximum results (default: 20).', default: 20 },
      },
    },
  },
  {
    name: 'get_renewal_forecast',
    description:
      'Predict upcoming contract renewals based on historical award patterns and contract durations.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cpv_code: { type: 'string', description: 'CPV code or prefix.' },
        buyer_id: { type: 'string', description: 'Buyer identifier.' },
        buyer_nuts: { type: 'string', description: 'NUTS region.' },
        months_ahead: { type: 'number', description: 'Forecast horizon in months (default: 12).', default: 12 },
        limit: { type: 'number', description: 'Maximum results (default: 20).', default: 20 },
      },
    },
  },
] as const;

// ── Implemented tools (all 19) ──────────────────────────────────────────────

const IMPLEMENTED_TOOLS = new Set([
  'search_legislation',
  'get_provision',
  'get_directive_overview',
  'get_cpv_codes',
  'get_thresholds',
  'get_procedure_types',
  'get_exclusion_grounds',
  'get_time_limits',
  'compare_requirements',
  'validate_citation',
  'list_sources',
  'about',
  'check_data_freshness',
  'get_buyer_profile',
  'get_award_history',
  'get_competitor_profile',
  'get_price_benchmark',
  'get_framework_agreements',
  'get_renewal_forecast',
]);

/**
 * Dispatch a tool call to the correct implementation.
 * Returns the tool response object, or null if the tool is not yet implemented.
 */
function dispatchTool(
  db: DatabaseAdapter,
  name: string,
  args: Record<string, unknown> | undefined
): unknown | null {
  const a = args ?? {};

  switch (name) {
    case 'search_legislation':
      return searchLegislation(db, {
        query: a.query as string,
        jurisdiction: a.jurisdiction as string | undefined,
        directive: a.directive as string | undefined,
        limit: a.limit as number | undefined,
      });

    case 'get_provision': {
      const provResult = getProvision(db, {
        directive_id: a.directive_id as string,
        article: a.article as string | undefined,
      });
      if (!provResult.error && provResult.directive) {
        const directiveRef = provResult.directive.short_title ?? provResult.directive.title ?? a.directive_id;
        const articleNum = provResult.article_number ?? a.article;
        return {
          ...provResult,
          _citation: buildCitation(
            String(directiveRef),
            articleNum ? `Article ${articleNum} ${directiveRef}` : String(directiveRef),
            'get_provision',
            { directive_id: a.directive_id as string, ...(a.article ? { article: a.article as string } : {}) },
          ),
        };
      }
      return provResult;
    }

    case 'get_directive_overview':
      return getDirectiveOverview(db, {
        directive_id: a.directive_id as string,
      });

    case 'get_cpv_codes':
      return getCpvCodes(db, {
        query: a.query as string,
        level: a.level as number | undefined,
        limit: a.limit as number | undefined,
      });

    case 'get_thresholds':
      return getThresholds(db, {
        category: a.category as string | undefined,
        jurisdiction: a.jurisdiction as string | undefined,
        as_of_date: a.as_of_date as string | undefined,
      });

    case 'get_procedure_types':
      return getProcedureTypes(db, {
        directive_id: a.directive_id as string | undefined,
        jurisdiction: a.jurisdiction as string | undefined,
        above_threshold: a.above_threshold as boolean | undefined,
        value_eur: a.value_eur as number | undefined,
      });

    case 'get_exclusion_grounds':
      return getExclusionGrounds(db, {
        jurisdiction: a.jurisdiction as string,
        type: a.type as 'mandatory' | 'discretionary' | 'both' | undefined,
      });

    case 'get_time_limits':
      return getTimeLimits(db, {
        procedure_type: a.procedure_type as string | undefined,
        directive_id: a.directive_id as string | undefined,
        is_prior_information: a.is_prior_information as boolean | undefined,
      });

    case 'compare_requirements':
      return compareRequirements(db, {
        topic: a.topic as string,
        jurisdictions: a.jurisdictions as string[],
      });

    case 'validate_citation':
      return validateCitation(db, {
        citation: a.citation as string,
      });

    case 'list_sources':
      return listSources(db);

    case 'about':
      return about(db);

    case 'check_data_freshness':
      return checkDataFreshness(db);

    case 'get_buyer_profile':
      return getBuyerProfile(db, {
        buyer_id: a.buyer_id as string | undefined,
        buyer_name: a.buyer_name as string | undefined,
      });

    case 'get_award_history':
      return getAwardHistory(db, {
        cpv_code: a.cpv_code as string,
        nuts_region: (a.buyer_nuts ?? a.nuts_region) as string | undefined,
        year_from: a.date_from ? new Date(a.date_from as string).getFullYear() : a.year_from as number | undefined,
        year_to: a.date_to ? new Date(a.date_to as string).getFullYear() : a.year_to as number | undefined,
        limit: a.limit as number | undefined,
      });

    case 'get_competitor_profile':
      return getCompetitorProfile(db, {
        company_name: a.winner_name as string,
      });

    case 'get_price_benchmark':
      return getPriceBenchmark(db, {
        cpv_code: a.cpv_code as string,
        nuts_country: a.nuts_country as string | undefined,
        year_from: a.year as number | undefined,
        year_to: a.year as number | undefined,
      });

    case 'get_framework_agreements':
      return getFrameworkAgreements(db, {
        cpv_code: a.cpv_code as string,
        nuts_region: (a.buyer_nuts ?? a.nuts_region) as string | undefined,
        limit: a.limit as number | undefined,
      });

    case 'get_renewal_forecast':
      return getRenewalForecast(db, {
        cpv_code: a.cpv_code as string | undefined,
        nuts_region: (a.buyer_nuts ?? a.nuts_region) as string | undefined,
        months_ahead: a.months_ahead as number | undefined,
        limit: a.limit as number | undefined,
      });

    default:
      return null;
  }
}

// ── Server factory ──────────────────────────────────────────────────────────

export function createMcpServer(db?: DatabaseAdapter): Server {
  const server = new Server(
    {
      name: 'public-procurement-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Verify tool exists
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: `Unknown tool: ${name}` }),
          },
        ],
        isError: true,
      };
    }

    // Dispatch to implementation if available
    if (IMPLEMENTED_TOOLS.has(name) && db) {
      const result = dispatchTool(db, name, args as Record<string, unknown> | undefined);
      if (result !== null) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result),
            },
          ],
        };
      }
    }

    // Stub response for unimplemented tools
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            status: 'not_implemented',
            tool: name,
            message: `Tool '${name}' is not implemented yet. This is a scaffold stub.`,
            args,
          }),
        },
      ],
    };
  });

  return server;
}

export { TOOLS, IMPLEMENTED_TOOLS, dispatchTool };
