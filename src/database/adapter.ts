/**
 * SQLite Database Adapter for Public Procurement MCP
 *
 * Provides a thin wrapper around node-sqlite3-wasm with:
 * - Lazy initialization
 * - Schema bootstrapping from schema.sql
 * - Parameterized query helpers
 * - Read-only mode for production safety
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { BindValues } from 'node-sqlite3-wasm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Row {
  [key: string]: unknown;
}

export interface DatabaseAdapter {
  /** Run a parameterized query returning all rows */
  query<T extends Row = Row>(sql: string, params?: BindValues): T[];
  /** Run a parameterized query returning the first row or undefined */
  queryOne<T extends Row = Row>(sql: string, params?: BindValues): T | undefined;
  /** Execute a write statement (INSERT/UPDATE/DELETE) — only available in write mode */
  execute(sql: string, params?: BindValues): { changes: number };
  /** Execute raw SQL (e.g., schema DDL) */
  exec(sql: string): void;
  /** Close the database connection */
  close(): void;
}

/**
 * Create a SQLite database adapter.
 *
 * @param dbPath - Path to the SQLite database file
 * @param options - Configuration options
 * @returns DatabaseAdapter instance
 */
export async function createAdapter(
  dbPath: string,
  options: { readonly?: boolean; runSchema?: boolean } = {}
): Promise<DatabaseAdapter> {
  // node-sqlite3-wasm exports { Database } on the default export object
  const sqliteModule = await import('node-sqlite3-wasm');
  const Database = sqliteModule.Database;
  const db = new Database(dbPath, { readOnly: options.readonly });

  // Run schema if requested
  if (options.runSchema) {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
  }

  const adapter: DatabaseAdapter = {
    query<T extends Row = Row>(sql: string, params?: BindValues): T[] {
      try {
        return db.all(sql, params) as T[];
      } catch (error) {
        throw new Error(`Query failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    queryOne<T extends Row = Row>(sql: string, params?: BindValues): T | undefined {
      try {
        const result = db.get(sql, params);
        return (result ?? undefined) as T | undefined;
      } catch (error) {
        throw new Error(`Query failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    execute(sql: string, params?: BindValues): { changes: number } {
      if (options.readonly) {
        throw new Error('Database is in read-only mode');
      }
      try {
        const result = db.run(sql, params);
        return { changes: result.changes };
      } catch (error) {
        throw new Error(`Execute failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    exec(sql: string): void {
      db.exec(sql);
    },

    close(): void {
      db.close();
    },
  };

  return adapter;
}

/**
 * Default database path — looks for procurement.db in the data folder.
 */
export function getDefaultDbPath(): string {
  const projectRoot = join(__dirname, '..', '..');
  return process.env.PROCUREMENT_DB_PATH || join(projectRoot, 'data', 'procurement.db');
}
