#!/usr/bin/env node

/**
 * Public Procurement MCP — stdio transport entry point
 *
 * Usage: node dist/worker.js
 * Or:    npx @ansvar/public-procurement-mcp
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './index.js';
import { createAdapter, getDefaultDbPath } from './database/adapter.js';

async function main() {
  const dbPath = getDefaultDbPath();
  const db = await createAdapter(dbPath, { readonly: true });
  console.error(`Database loaded: ${dbPath}`);
  const server = createMcpServer(db);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Public Procurement MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
