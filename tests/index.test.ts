import { describe, it, expect } from 'vitest';
import { createMcpServer, TOOLS } from '../src/index.js';

describe('Public Procurement MCP Server', () => {
  it('should create a server instance', () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
  });

  it('should register all 19 tools', () => {
    expect(TOOLS).toHaveLength(19);
  });

  it('should have unique tool names', () => {
    const names = TOOLS.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('should include all expected tool names', () => {
    const names = TOOLS.map((t) => t.name);
    const expected = [
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
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });
});
