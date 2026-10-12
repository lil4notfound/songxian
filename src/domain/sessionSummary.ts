import type {
  ExceptionStats,
  SelfAssessment,
  SensorMetrics,
  TrainingStage,
  TrainingSummary,
} from '../contracts/training';
import { createTemplateSummary } from './trainingPlan';
export const createSessionSummary = (input: {
  moduleId?: 'pelvic_floor' | 'anal';
  stage: TrainingStage | null;
  completedGroups: number;
  completedCycles: number;
  metrics: SensorMetrics | null;
  assessment: SelfAssessment;
  exceptions?: ExceptionStats;
}): TrainingSummary => {
  let result: TrainingSummary;
  if (input.moduleId === 'anal') {
    const nextAction = input.assessment.discomfort
      ? '先停止加量并休息；如不适持续，请咨询专业人员。'
      : input.assessment.relaxation === 'difficult'
        ? '下次先留意充分松开，保持自然呼吸，不增加轮数。'
        : '继续当前轻柔节奏，给放松阶段留足时间。';
    result = {
      headline: '本次提肛训练已记录',
      body:
        '完成了 ' +
        input.completedCycles +
        ' 轮提肛。' +
        (input.metrics
          ? '收缩匹配 ' +
            input.metrics.patternMatchRate +
            '%，放松回落 ' +
            input.metrics.releaseRecovery +
            '%。'
          : '本次为计时带练，没有足够数据评价动作表现。'),
      nextAction,
      source: 'template',
    };
  } else result = createTemplateSummary({ ...input, stage: input.stage ?? 'beginner' });
  if (input.exceptions) {
    const count = input.exceptions.events.reduce((sum, e) => sum + e.count, 0);
    const seconds = Math.round(input.exceptions.events.reduce((sum, e) => sum + e.seconds, 0));
    result = {
      ...result,
      body:
        result.body +
        (count
          ? ' 期间因异常暂停 ' +
            count +
            ' 次，调整用时 ' +
            seconds +
            ' 秒，重做 ' +
            input.exceptions.redoCount +
            ' 次。'
          : ' 本次没有记录到需要暂停的异常。'),
    };
    if (
      !input.assessment.discomfort &&
      input.exceptions.events.some((e) =>
        ['poor_contact', 'saturated', 'posture'].includes(e.reason),
      )
    )
      result.nextAction = '下次先检查贴片接触，回到个人参考坐姿，再轻柔练习。';
  }
  return result;
};
