/**
 * Shared response metadata for all tool responses.
 * Every tool must include _meta in its response.
 */

/** SQL parameter value compatible with node-sqlite3-wasm BindValues */
export type SqlParam = string | number | bigint | boolean | Uint8Array | null;

export interface ToolMeta {
  disclaimer: string;
  data_age: string;
  source_url: string;
}

export function createMeta(sourceUrl?: string): ToolMeta {
  return {
    disclaimer:
      'This information is provided for informational purposes only and does not constitute legal advice. Verify all references against official sources before relying on them.',
    data_age: new Date().toISOString().split('T')[0],
    source_url: sourceUrl ?? 'https://eur-lex.europa.eu/',
  };
}
