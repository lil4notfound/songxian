export type EligibilityAnswer = 'yes' | 'no' | 'unsure';

export type EligibilityQuestion = {
  id: 'recovery' | 'discomfort_infection' | 'symptoms';
  title: string;
  question: string;
};

export type EligibilityAnswers = Partial<Record<EligibilityQuestion['id'], EligibilityAnswer>>;

export const ELIGIBILITY_QUESTIONS: readonly EligibilityQuestion[] = [
  {
    id: 'recovery',
    title: '怀孕与恢复情况',
    question: '你目前是否正在怀孕、处于产后恢复期，或妇科、会阴、盆腔手术后的恢复期？',
  },
  {
    id: 'discomfort_infection',
    title: '伤口、疼痛与感染',
    question:
      '你目前是否有尚未恢复的会阴伤口、明显盆腔疼痛或原因待明确的不适，或急性阴道炎、尿路感染？',
  },
  {
    id: 'symptoms',
    title: '当前相关症状',
    question: '你目前是否有漏尿（含压力性尿失禁）、阴道松弛、轻中度阴道脱垂，或功能性便秘？',
  },
] as const;

export const isEligible = (answers: EligibilityAnswers): boolean =>
  ELIGIBILITY_QUESTIONS.every((question) => answers[question.id] === 'no');

export const isEligibilityComplete = (answers: EligibilityAnswers): boolean =>
  ELIGIBILITY_QUESTIONS.every((question) => answers[question.id] !== undefined);
