#!/usr/bin/env node

/**
 * Public Procurement MCP — HTTP transport entry point
 *
 * Provides Streamable HTTP transport for remote MCP clients.
 * Use src/worker.ts for local stdio-based usage.
 *
 * Usage: node dist/http-server.js
 * Port:  PORT env var (default: 3000)
 */

import { createServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import { createMcpServer } from './index.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function main() {
  const mcpServer = createMcpServer();

  // Map to store transports by session ID
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);

    // Health check endpoint
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          server: 'public-procurement-mcp',
          version: '0.1.0',
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // MCP endpoint
    if (url.pathname === '/mcp') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!;
      } else {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });

        await mcpServer.connect(transport);

        transport.onclose = () => {
          if (transport.sessionId) {
            transports.delete(transport.sessionId);
          }
        };
      }

      await transport.handleRequest(req, res);

      if (transport.sessionId && !transports.has(transport.sessionId)) {
        transports.set(transport.sessionId, transport);
      }

      return;
    }

    // 404 for other paths
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  httpServer.listen(PORT, () => {
    console.error(`Public Procurement MCP server (HTTP) listening on port ${PORT}`);
    console.error(`MCP endpoint: http://localhost:${PORT}/mcp`);
    console.error(`Health check: http://localhost:${PORT}/health`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.error('Received SIGTERM, shutting down...');
    httpServer.close(() => {
      process.exit(0);
    });
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
