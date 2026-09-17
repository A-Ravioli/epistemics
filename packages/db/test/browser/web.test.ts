import { describe, it, expect } from 'vitest';
import { createWebExecutor, DbLockedError } from '../../src/executors/web.js';
import { createDb } from '../../src/client.js';
import { MIGRATIONS } from '../../src/migrations.js';
import { setSetting, getSetting, saveCurriculum, getCurriculum, enrol, getCards } from '../../src/repositories/index.js';
import { makeCurriculum, goals, settings } from '../fixture.js';

describe('web executor (sqlite-wasm in a Worker)', () => {
  it('opens, migrates idempotently, and round-trips through repositories', async () => {
    const exec = await createWebExecutor();
    try {
      expect(exec.platform).toBe('web');
      expect(['opfs', 'memory']).toContain(exec.storage);
      // A previous run may have left the OPFS database migrated; tolerate both.
      const first = await exec.migrate();
      expect([0, MIGRATIONS.length]).toContain(first);
      expect(await exec.migrate()).toBe(0);

      const { rows } = await exec.run('SELECT ?, ?, ?', [1, 'x', null], 'get');
      expect(rows).toEqual([[1, 'x', null]]);

      const db = createDb(exec);
      await setSetting(db, 'browser-test', { ok: true, at: Date.now() });
      expect((await getSetting<{ ok: boolean }>(db, 'browser-test'))?.ok).toBe(true);

      const c = makeCurriculum();
      await saveCurriculum(db, c);
      expect(await getCurriculum(db, 'curr-1', 1)).toEqual(c);
      const course = await enrol(db, c, goals, settings);
      expect(await getCards(db, course.id)).toHaveLength(6);

      const bytes = await exec.exportDatabase();
      expect(bytes.byteLength).toBeGreaterThan(4096);
      expect(new TextDecoder().decode(bytes.slice(0, 15))).toBe('SQLite format 3');
    } finally {
      await exec.close();
    }
  });

  it('holds the single-owner Web Lock', async () => {
    const exec = await createWebExecutor();
    try {
      await expect(createWebExecutor()).rejects.toBeInstanceOf(DbLockedError);
    } finally {
      await exec.close();
    }
    // After close the lock is released and a new owner can open.
    const again = await createWebExecutor();
    await again.close();
  });

  it('import restores an exported snapshot', async () => {
    const exec = await createWebExecutor();
    try {
      await exec.migrate();
      const db = createDb(exec);
      await setSetting(db, 'snapshot-marker', 'before');
      const snapshot = await exec.exportDatabase();
      await setSetting(db, 'snapshot-marker', 'after');
      await exec.importDatabase(snapshot);
      expect(await getSetting<string>(db, 'snapshot-marker')).toBe('before');
    } finally {
      await exec.close();
    }
  });
});
