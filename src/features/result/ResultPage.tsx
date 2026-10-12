import { useState } from 'react';
import type { WellnessApplication } from '../../application/WellnessApplication';
import type { ProgressSnapshot, SelfAssessment, TrainingSummary } from '../../contracts/training';
import { getModule } from '../../domain/modules';
import { createSessionSummary } from '../../domain/sessionSummary';
import { CalendarIcon, CheckIcon, RefreshIcon } from '../../shared/ui/Icons';
import { StringVisual } from '../../shared/ui/StringVisual';
import type { TrainingFinishPayload } from '../training/TrainingPage';

type ResultPageProps = {
  payload: TrainingFinishPayload;
  application: WellnessApplication;
  onAgain: () => void;
  onDone: () => void;
  onOpenRecords: () => void;
};

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
};

const options = {
  effort: [
    ['easy', '轻松'],
    ['appropriate', '合适'],
    ['tired', '偏累'],
  ],
  relaxation: [
    ['easy', '容易'],
    ['neutral', '一般'],
    ['difficult', '困难'],
  ],
} as const;

export const ResultPage = ({
  payload,
  application,
  onAgain,
  onDone,
  onOpenRecords,
}: ResultPageProps) => {
  const { session, recordId, metrics, evaluationMode } = payload;
  const module = getModule(session.moduleId);
  const completed = session.endReason === 'complete';
  const [assessment, setAssessment] = useState<Partial<SelfAssessment>>({});
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const [summary, setSummary] = useState<TrainingSummary | null>(null);
  const [progress, setProgress] = useState<ProgressSnapshot | null>(null);
  const isPelvic = session.moduleId === 'pelvic_floor' && session.stage !== null;

  const save = async () => {
    if (!assessment.effort || !assessment.relaxation || assessment.discomfort === undefined) return;
    const completeAssessment: SelfAssessment = {
      effort: assessment.effort,
      relaxation: assessment.relaxation,
      discomfort: assessment.discomfort,
    };
    setSaving(true);
    const fallback = createSessionSummary({
      moduleId: session.moduleId,
      exceptions: session.exceptions,
      stage: session.stage,
      completedGroups: isPelvic ? session.completedGroups : completed ? 1 : 0,
      completedCycles: session.completedCycles,
      metrics,
      assessment: completeAssessment,
    });
    try {
      if (!recordId) throw new Error('Training record is unavailable');
      const record = await application.training.completeSession(recordId, {
        requestId: application.createRequestId(),
        endedAt: new Date().toISOString(),
        status: completed ? 'complete' : 'stopped',
        targetGroups: session.targetGroups,
        completedGroups: isPelvic ? session.completedGroups : completed ? 1 : 0,
        targetCycles: session.targetGroups * session.targetCycles,
        completedCycles: session.completedCycles,
        elapsedSeconds: session.elapsedSeconds,
        metrics,
        assessment: completeAssessment,
        evaluationMode,
        exceptions: session.exceptions,
      });
      setSavedId(record.id);
      setSaving(false);
      setGenerating(true);
      const generated = record.id.startsWith('offline-')
        ? fallback
        : await application.training.getSummary(record.id).catch(() => fallback);
      setSummary(generated);
      if (isPelvic) setProgress(await application.training.getProgress());
    } catch {
      setSaveError('记录暂未保存，请重试。');
    } finally {
      setSaving(false);
      setGenerating(false);
    }
  };

  if (!summary) {
    const ready = Boolean(
      assessment.effort && assessment.relaxation && assessment.discomfort !== undefined,
    );
    return (
      <main className={`result-page result-page--assessment page-tone--${module.tone}`}>
        <section className="assessment-sheet">
          <p className="eyebrow">练后记录</p>
          <h1>{completed ? '今天练起来怎么样？' : '停下来后，记录一下感受。'}</h1>
          <p className="assessment-intro">这些感受只用于调整下次节奏，不用于判断疾病或症状。</p>

          <fieldset className="assessment-field">
            <legend>整体感受</legend>
            <div className="choice-row">
              {options.effort.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={assessment.effort === value ? 'is-selected' : ''}
                  onClick={() => setAssessment((current) => ({ ...current, effort: value }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="assessment-field">
            <legend>完全放松的感觉</legend>
            <div className="choice-row">
              {options.relaxation.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={assessment.relaxation === value ? 'is-selected' : ''}
                  onClick={() => setAssessment((current) => ({ ...current, relaxation: value }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="assessment-field">
            <legend>练习后是否出现不适？</legend>
            <div className="choice-row choice-row--two">
              <button
                type="button"
                className={assessment.discomfort === false ? 'is-selected' : ''}
                onClick={() => setAssessment((current) => ({ ...current, discomfort: false }))}
              >
                没有
              </button>
              <button
                type="button"
                className={assessment.discomfort === true ? 'is-selected is-warning' : ''}
                onClick={() => setAssessment((current) => ({ ...current, discomfort: true }))}
              >
                有不适
              </button>
            </div>
          </fieldset>

          {saveError ? <p role="alert">{saveError}</p> : null}
          <button
            className="primary-button assessment-submit"
            type="button"
            disabled={!ready || saving || generating}
            onClick={() => void save()}
          >
            {generating ? '正在生成总结…' : saving ? '正在保存…' : '保存并查看总结'}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={`result-page page-tone--${module.tone}`}>
      <section className="result-card">
        <div className="result-mark" aria-hidden="true">
          <CheckIcon />
        </div>
        <p className="eyebrow">{completed ? '本次带练完成' : '本次带练已结束'}</p>
        <h1>
          {summary?.headline ??
            (completed ? '很好，给身体一点放松的时间。' : '停下来也是照顾自己。')}
        </h1>
        <StringVisual tone={module.tone} />

        <dl className="result-stats">
          <div>
            <dt>带练时长</dt>
            <dd>{formatDuration(session.elapsedSeconds)}</dd>
          </div>
          <div>
            <dt>{isPelvic ? '完成组数' : '完整轮数'}</dt>
            <dd>
              {isPelvic ? session.completedGroups : session.completedCycles}{' '}
              <small>/ {isPelvic ? session.targetGroups : 5}</small>
            </dd>
          </div>
          {progress ? (
            <div>
              <dt>连续打卡</dt>
              <dd>
                {progress.currentStreak} <small>天</small>
              </dd>
            </div>
          ) : null}
        </dl>

        {summary ? (
          <div className="training-summary">
            <p>{summary.body}</p>
            <strong>{summary.nextAction}</strong>
            <small>
              {summary.source === 'ai' ? 'AI 已按训练数据整理' : '基础总结：AI 暂未生成'}
            </small>
            {savedId?.startsWith('offline-') && summary.source === 'template' ? (
              <small>记录已保存在本机，恢复网络后可重试 AI 总结。</small>
            ) : null}
            {summary.source === 'template' && savedId ? (
              <button
                className="quiet-button"
                type="button"
                disabled={generating}
                onClick={() => {
                  setGenerating(true);
                  void application.training
                    .getSummary(savedId, true)
                    .then(setSummary)
                    .catch(() => undefined)
                    .finally(() => setGenerating(false));
                }}
              >
                {generating ? '正在生成总结…' : '重试 AI 总结'}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="result-note">
            继续自然呼吸。如果出现疼痛或明显不适，请停止练习并咨询专业人员。
          </p>
        )}

        <div className="result-actions">
          <button className="primary-button" type="button" onClick={onDone}>
            回到训练
          </button>
          {isPelvic ? (
            <button className="quiet-button" type="button" onClick={onOpenRecords}>
              <CalendarIcon />
              查看记录
            </button>
          ) : (
            <button className="quiet-button" type="button" onClick={onAgain}>
              <RefreshIcon />
              再练一次
            </button>
          )}
        </div>
      </section>
    </main>
  );
};
