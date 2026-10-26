import {Pool} from "pg";

export type Query = <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{rows: T[]}>;
export interface Database { query: Query; transaction<T>(operation: (query: Query) => Promise<T>): Promise<T> }

const globalDb = globalThis as typeof globalThis & {marvinAuthPool?: Pool};
export function postgres(databaseUrl: string): Database {
  if (!globalDb.marvinAuthPool) {
    globalDb.marvinAuthPool = new Pool({connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 45000});
    globalDb.marvinAuthPool.on("error", () => {});
  }
  const pool = globalDb.marvinAuthPool;
  return {
    query: (sql, values) => pool.query(sql, values),
    async transaction(operation) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await operation((sql, values) => client.query(sql, values));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    },
  };
}
