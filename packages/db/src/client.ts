import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema.js';
import type { DbExecutor } from './executor.js';

export function createDb(executor: DbExecutor) {
  const db = drizzle(
    async (sql, params, method) => {
      const r = await executor.run(sql, params as never, method);
      // sqlite-proxy expects `{ rows: any[] }` for all/values/run, and `{ rows: any[] }` (single row array) for get
      if (method === 'get') return { rows: r.rows[0] ?? [] } as { rows: never };
      return { rows: r.rows } as { rows: never };
    },
    async (queries) => {
      await executor.batch(queries.map((q) => ({ sql: q.sql, params: q.params as never })));
      return queries.map(() => ({ rows: [] })) as never;
    },
    { schema },
  );
  return db;
}
export type Db = ReturnType<typeof createDb>;
