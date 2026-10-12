import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  calibrationProfileSchema,
  PLACEMENT_VERSION,
  type CalibrationProfile,
} from '../../src/contracts/device';
import type { DeviceCalibrationRepository } from '../application/DeviceService';

type CalibrationRow = { profile_json: string };

export class SQLiteDeviceRepository implements DeviceCalibrationRepository {
  private readonly database: Database.Database;

  constructor(filename: string) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.database = new Database(filename);
    if (filename !== ':memory:') this.database.pragma('journal_mode = WAL');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS device_calibrations (
        device_id TEXT NOT NULL,
        layout_version TEXT NOT NULL,
        profile_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(device_id, layout_version)
      )
    `);
    this.database.exec(`CREATE TABLE IF NOT EXISTS device_calibrations_v2 (
      device_id TEXT NOT NULL, layout_version TEXT NOT NULL, placement_version TEXT NOT NULL,
      profile_json TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(device_id, layout_version, placement_version)
    )`);
  }

  find(deviceId: string, layoutVersion: string): CalibrationProfile | null {
    const row = this.database
      .prepare(
        'SELECT profile_json FROM device_calibrations_v2 WHERE device_id = ? AND layout_version = ? AND placement_version = ?',
      )
      .get(deviceId, layoutVersion, PLACEMENT_VERSION) as CalibrationRow | undefined;
    if (!row) return null;
    const parsed = calibrationProfileSchema.safeParse(JSON.parse(row.profile_json) as unknown);
    return parsed.success ? parsed.data : null;
  }

  save(profile: CalibrationProfile): CalibrationProfile {
    const validated = calibrationProfileSchema.parse(profile);
    this.database
      .prepare(
        `INSERT INTO device_calibrations_v2(device_id, layout_version, placement_version, profile_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(device_id, layout_version, placement_version) DO UPDATE SET
           profile_json = excluded.profile_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        validated.deviceId,
        validated.layoutVersion,
        validated.placementVersion,
        JSON.stringify(validated),
        new Date().toISOString(),
      );
    return validated;
  }

  hasLegacy(deviceId: string, layoutVersion: string): boolean {
    return Boolean(
      this.database
        .prepare('SELECT 1 FROM device_calibrations WHERE device_id = ? AND layout_version = ?')
        .get(deviceId, layoutVersion),
    );
  }
  close(): void {
    this.database.close();
  }
}
