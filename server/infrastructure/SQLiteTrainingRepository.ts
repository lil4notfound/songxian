import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  exceptionStatsSchema,
  emptyExceptionStats,
  selfAssessmentSchema,
  sensorMetricsSchema,
  trainingPrescriptionSchema,
  trainingSummarySchema,
  type CompleteTrainingRequest,
  type TrainingSummary,
  type TrainingStage,
} from '../../src/contracts/training';
import type { StoredTrainingSession, TrainingRepository } from '../application/ports';

type SessionRow = {
  id: string;
  request_id: string;
  module_id: 'pelvic_floor' | 'anal';
  evaluation_mode: 'sensor' | 'timer';
  exceptions_json: string | null;
  stage: 'beginner' | 'intermediate' | 'advanced' | null;
  prescription_version: string;
  prescription_json: string | null;
  started_at: string;
  ended_at: string | null;
  local_date: string;
  status: 'active' | 'complete' | 'stopped';
  target_groups: number;
  completed_groups: number;
  target_cycles: number;
  completed_cycles: number;
  elapsed_seconds: number;
  metrics_json: string | null;
  assessment_json: string | null;
  summary_json: string | null;
};

const parseJson = (value: string): unknown => JSON.parse(value) as unknown;

export class SQLiteTrainingRepository implements TrainingRepository {
  private readonly database: Database.Database;

  constructor(filename: string) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.database = new Database(filename);
    if (filename !== ':memory:') this.database.pragma('journal_mode = WAL');
    this.database.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate(): void {
    this.database.transaction(() => {
      this.database.exec(`
      CREATE TABLE IF NOT EXISTS training_sessions (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        stage TEXT NOT NULL CHECK(stage IN ('beginner','intermediate','advanced')),
        prescription_version TEXT NOT NULL,
        prescription_json TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        local_date TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active','complete','stopped')),
        target_groups INTEGER NOT NULL,
        completed_groups INTEGER NOT NULL DEFAULT 0,
        target_cycles INTEGER NOT NULL,
        completed_cycles INTEGER NOT NULL DEFAULT 0,
        elapsed_seconds INTEGER NOT NULL DEFAULT 0,
        metrics_json TEXT,
        assessment_json TEXT
      );
      CREATE TABLE IF NOT EXISTS training_summaries (
        session_id TEXT PRIMARY KEY REFERENCES training_sessions(id) ON DELETE CASCADE,
        summary_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_training_date ON training_sessions(local_date, status);
      CREATE INDEX IF NOT EXISTS idx_training_stage_ended ON training_sessions(stage, ended_at);

      CREATE TABLE IF NOT EXISTS training_sessions_v2 (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        stage TEXT CHECK(stage IN ('beginner','intermediate','advanced')),
        prescription_version TEXT NOT NULL,
        prescription_json TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        local_date TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active','complete','stopped')),
        target_groups INTEGER NOT NULL,
        completed_groups INTEGER NOT NULL DEFAULT 0,
        target_cycles INTEGER NOT NULL,
        completed_cycles INTEGER NOT NULL DEFAULT 0,
        elapsed_seconds INTEGER NOT NULL DEFAULT 0,
        metrics_json TEXT,
        assessment_json TEXT,
        module_id TEXT NOT NULL DEFAULT 'pelvic_floor' CHECK(module_id IN ('pelvic_floor','anal')),
        evaluation_mode TEXT NOT NULL DEFAULT 'sensor' CHECK(evaluation_mode IN ('sensor','timer')),
        exceptions_json TEXT
      );
      CREATE TABLE IF NOT EXISTS training_summaries_v2 (
        session_id TEXT PRIMARY KEY REFERENCES training_sessions_v2(id) ON DELETE CASCADE,
        summary_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS training_demo_unlocks (
        stage TEXT PRIMARY KEY CHECK(stage IN ('intermediate','advanced'))
      );
      CREATE INDEX IF NOT EXISTS idx_training_v2_date ON training_sessions_v2(local_date, status);
      CREATE INDEX IF NOT EXISTS idx_training_v2_stage_ended ON training_sessions_v2(stage, ended_at);
    `);
      this.database.exec(`INSERT OR IGNORE INTO training_sessions_v2
        (id,request_id,stage,prescription_version,prescription_json,started_at,ended_at,local_date,status,target_groups,completed_groups,target_cycles,completed_cycles,elapsed_seconds,metrics_json,assessment_json,module_id,evaluation_mode)
        SELECT id,request_id,stage,prescription_version,prescription_json,started_at,ended_at,local_date,status,target_groups,completed_groups,target_cycles,completed_cycles,elapsed_seconds,metrics_json,assessment_json,'pelvic_floor',CASE WHEN metrics_json IS NULL THEN 'timer' ELSE 'sensor' END FROM training_sessions;
        INSERT OR IGNORE INTO training_summaries_v2 SELECT * FROM training_summaries;`);
    })();
  }

  private rowToSession(row: SessionRow): StoredTrainingSession {
    return {
      id: row.id,
      requestId: row.request_id,
      moduleId: row.module_id,
      evaluationMode: row.evaluation_mode,
      exceptions: row.exceptions_json
        ? exceptionStatsSchema.parse(parseJson(row.exceptions_json))
        : emptyExceptionStats(),
      stage: row.stage,
      prescriptionVersion: row.prescription_version,
      prescription: row.prescription_json
        ? trainingPrescriptionSchema.parse(parseJson(row.prescription_json))
        : null,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      localDate: row.local_date,
      status: row.status,
      targetGroups: row.target_groups,
      completedGroups: row.completed_groups,
      targetCycles: row.target_cycles,
      completedCycles: row.completed_cycles,
      elapsedSeconds: row.elapsed_seconds,
      metrics: row.metrics_json ? sensorMetricsSchema.parse(parseJson(row.metrics_json)) : null,
      assessment: row.assessment_json
        ? selfAssessmentSchema.parse(parseJson(row.assessment_json))
        : null,
      summary: row.summary_json ? trainingSummarySchema.parse(parseJson(row.summary_json)) : null,
    };
  }

  getDemoUnlocks(): TrainingStage[] {
    return (
      this.database.prepare('SELECT stage FROM training_demo_unlocks').all() as {
        stage: TrainingStage;
      }[]
    ).map((r) => r.stage);
  }

  setDemoUnlock(stage: 'intermediate' | 'advanced', enabled: boolean): void {
    this.database
      .prepare(
        enabled
          ? 'INSERT OR IGNORE INTO training_demo_unlocks(stage) VALUES (?)'
          : 'DELETE FROM training_demo_unlocks WHERE stage = ?',
      )
      .run(stage);
  }

  private selectSql(where = ''): string {
    return `
      SELECT s.*, m.summary_json
      FROM training_sessions_v2 s
      LEFT JOIN training_summaries_v2 m ON m.session_id = s.id
      ${where}
    `;
  }

  listSessions(): StoredTrainingSession[] {
    const rows = this.database
      .prepare(this.selectSql('ORDER BY s.started_at ASC'))
      .all() as SessionRow[];
    return rows.map((row) => this.rowToSession(row));
  }

  findSession(id: string): StoredTrainingSession | null {
    const row = this.database.prepare(this.selectSql('WHERE s.id = ?')).get(id) as
      | SessionRow
      | undefined;
    return row ? this.rowToSession(row) : null;
  }

  findByRequestId(requestId: string): StoredTrainingSession | null {
    const row = this.database.prepare(this.selectSql('WHERE s.request_id = ?')).get(requestId) as
      | SessionRow
      | undefined;
    return row ? this.rowToSession(row) : null;
  }

  createSession(input: Parameters<TrainingRepository['createSession']>[0]): StoredTrainingSession {
    this.database
      .prepare(
        `
        INSERT INTO training_sessions_v2 (
          id, request_id, stage, prescription_version, prescription_json, started_at,
          local_date, status, target_groups, target_cycles, module_id, evaluation_mode
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
      `,
      )
      .run(
        input.id,
        input.requestId,
        input.stage,
        input.prescription?.version ?? input.prescriptionVersion ?? 'anal-basic-v1',
        input.prescription ? JSON.stringify(input.prescription) : null,
        input.startedAt,
        input.localDate,
        input.prescription?.targetGroups ?? 1,
        input.prescription
          ? input.prescription.cyclesPerGroup * input.prescription.targetGroups
          : 5,
        input.moduleId ?? 'pelvic_floor',
        input.evaluationMode ?? 'sensor',
      );
    return this.findSession(input.id)!;
  }

  completeSession(
    id: string,
    input: CompleteTrainingRequest,
    localDate: string,
  ): StoredTrainingSession {
    this.database
      .prepare(
        `
        UPDATE training_sessions_v2 SET
          ended_at = ?, local_date = ?, status = ?, target_groups = ?, completed_groups = ?,
          target_cycles = ?, completed_cycles = ?, elapsed_seconds = ?, metrics_json = ?,
          assessment_json = ?, evaluation_mode = ?, exceptions_json = ?
        WHERE id = ? AND status = 'active'
      `,
      )
      .run(
        input.endedAt,
        localDate,
        input.status,
        input.targetGroups,
        input.completedGroups,
        input.targetCycles,
        input.completedCycles,
        input.elapsedSeconds,
        input.metrics ? JSON.stringify(input.metrics) : null,
        JSON.stringify(input.assessment),
        input.evaluationMode ?? this.findSession(id)?.evaluationMode ?? 'sensor',
        JSON.stringify(input.exceptions ?? emptyExceptionStats()),
        id,
      );
    return this.findSession(id)!;
  }

  saveSummary(sessionId: string, summary: TrainingSummary): void {
    this.database
      .prepare(
        `
        INSERT INTO training_summaries_v2(session_id, summary_json, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET summary_json = excluded.summary_json
      `,
      )
      .run(sessionId, JSON.stringify(summary), new Date().toISOString());
  }
  close(): void {
    this.database.close();
  }
}
