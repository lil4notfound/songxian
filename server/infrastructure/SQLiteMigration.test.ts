/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQLiteTrainingRepository } from './SQLiteTrainingRepository';
import { SQLiteDeviceRepository } from './SQLiteDeviceRepository';
import { getDefaultPrescription } from '../../src/domain/trainingPlan';
import { makeProfile } from '../../src/test/deviceFixtures';
describe('legacy data migration', () => {
  it('preserves sessions, summaries and old calibration without activating the old placement', () => {
    const directory = mkdtempSync(join(tmpdir(), 'songxian-migration-'));
    const file = join(directory, 'test.db');
    try {
      // The old repository schema remains an archive while the v2 tables hold active data.
      new SQLiteTrainingRepository(file).close();
      const db = new Database(file);
      db.prepare(
        'INSERT INTO training_sessions (id,request_id,stage,prescription_version,prescription_json,started_at,local_date,status,target_groups,target_cycles) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(
        'old',
        'request',
        'beginner',
        'old-v1',
        JSON.stringify(getDefaultPrescription('beginner')),
        '2026-10-01T00:00:00.000Z',
        '2026-10-01',
        'complete',
        2,
        20,
      );
      const summary = {
        headline: '旧总结',
        body: '旧记录',
        nextAction: '放松',
        source: 'template',
      };
      db.prepare('INSERT INTO training_summaries VALUES (?,?,?)').run(
        'old',
        JSON.stringify(summary),
        '2026-10-01',
      );
      db.exec(
        'CREATE TABLE device_calibrations(device_id TEXT,layout_version TEXT,profile_json TEXT,updated_at TEXT,PRIMARY KEY(device_id,layout_version))',
      );
      db.prepare('INSERT INTO device_calibrations VALUES (?,?,?,?)').run(
        'device-1',
        'layout-1',
        JSON.stringify({ version: 1 }),
        '2026-10-01',
      );
      const migrated = new SQLiteTrainingRepository(file);
      const devices = new SQLiteDeviceRepository(file);
      expect(migrated.findSession('old')).toMatchObject({
        moduleId: 'pelvic_floor',
        stage: 'beginner',
        summary,
      });
      expect(devices.find('device-1', 'layout-1')).toBeNull();
      expect(devices.hasLegacy('device-1', 'layout-1')).toBe(true);
      devices.save(makeProfile());
      expect(devices.find('device-1', 'layout-1')?.version).toBe(2);
      expect(db.prepare('SELECT COUNT(*) AS n FROM device_calibrations').get()).toEqual({ n: 1 });
      new SQLiteTrainingRepository(file).close();
      expect(migrated.listSessions()).toHaveLength(1);
      db.close();
      migrated.close();
      devices.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
