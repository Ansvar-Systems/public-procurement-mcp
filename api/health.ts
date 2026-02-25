import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    // TODO: Add database connectivity check once DB is wired up
    res.status(200).json({
      status: 'ok',
      server: 'public-procurement-mcp',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(503).json({
      status: 'error',
      server: 'public-procurement-mcp',
      error: message,
    });
  }
}
