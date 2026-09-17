import { describe, it, expect } from 'vitest';
import { createNodeExecutor } from '../src/executors/node.js';
import { createMemoryExecutor } from '../src/executors/memory.js';
import { MIGRATIONS } from '../src/migrations.js';
import { splitStatements } from '../src/executors/migrate.js';

describe('node executor + migrations', () => {
  it('applies embedded migrations idempotently', async () => {
    const exec = createNodeExecutor(':memory:');
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    const first = await exec.migrate();
    expect(first).toBe(MIGRATIONS.length);
    const second = await exec.migrate();
    expect(second).toBe(0);
    const { rows } = await exec.run("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", [], 'all');
    const tables = rows.map((r) => r[0]);
    for (const t of ['_migrations', 'cards', 'curricula', 'concepts', 'items', 'sessions', 'turns', 'llm_calls', 'gen_cache']) {
      expect(tables).toContain(t);
    }
    const applied = await exec.run('SELECT name, applied_at FROM _migrations ORDER BY name', [], 'all');
    expect(applied.rows.map((r) => r[0])).toEqual(MIGRATIONS.map((m) => m.name));
    await exec.close();
  });

  it('splits on the drizzle statement breakpoint', () => {
    const parts = splitStatements(MIGRATIONS[0]!.sql);
    expect(parts.length).toBeGreaterThan(5);
    expect(parts.every((p) => !p.includes('statement-breakpoint'))).toBe(true);
  });

  it('returns rows as arrays in column order, with blobs as Uint8Array', async () => {
    const exec = createMemoryExecutor();
    expect(exec.platform).toBe('memory');
    await exec.run('CREATE TABLE t (a INTEGER, b TEXT, c BLOB, d REAL)', [], 'run');
    await exec.run('INSERT INTO t VALUES (?, ?, ?, ?)', [1, 'x', new Uint8Array([1, 2, 3]), 2.5], 'run');
    const { rows } = await exec.run('SELECT a, b, c, d FROM t', [], 'all');
    expect(rows).toHaveLength(1);
    expect(rows[0]![0]).toBe(1);
    expect(rows[0]![1]).toBe('x');
    expect(rows[0]![2]).toBeInstanceOf(Uint8Array);
    expect(Array.from(rows[0]![2] as Uint8Array)).toEqual([1, 2, 3]);
    expect(rows[0]![3]).toBe(2.5);
    const one = await exec.run('SELECT b FROM t WHERE a = ?', [1], 'get');
    expect(one.rows).toEqual([['x']]);
    const none = await exec.run('SELECT b FROM t WHERE a = ?', [99], 'get');
    expect(none.rows).toEqual([]);
    await exec.close();
  });

  it('batch is atomic: rolls back on error', async () => {
    const exec = createMemoryExecutor();
    await exec.run('CREATE TABLE t (id INTEGER PRIMARY KEY)', [], 'run');
    await expect(
      exec.batch([
        { sql: 'INSERT INTO t VALUES (?)', params: [1] },
        { sql: 'INSERT INTO t VALUES (?)', params: [1] }, // PK violation
      ]),
    ).rejects.toThrow();
    const { rows } = await exec.run('SELECT COUNT(*) FROM t', [], 'get');
    expect(rows[0]![0]).toBe(0);
    await exec.batch([
      { sql: 'INSERT INTO t VALUES (?)', params: [1] },
      { sql: 'INSERT INTO t VALUES (?)', params: [2] },
    ]);
    const after = await exec.run('SELECT COUNT(*) FROM t', [], 'get');
    expect(after.rows[0]![0]).toBe(2);
    await exec.close();
  });
});
