export type ModuleId = 'pelvic_floor' | 'posture' | 'anal';

export type ModuleDefinition = {
  id: ModuleId;
  ordinal: string;
  title: string;
  shortTitle: string;
  description: string;
  duration: string;
  tone: 'moss' | 'clay' | 'indigo';
};

export const MODULES: readonly ModuleDefinition[] = [
  {
    id: 'pelvic_floor',
    ordinal: '01',
    title: '盆底肌训练',
    shortTitle: '盆底肌',
    description: '跟随轻柔节奏，完成一次完整的收放练习。',
    duration: '分阶段完成',
    tone: 'moss',
  },
  {
    id: 'posture',
    ordinal: '02',
    title: '坐姿矫正',
    shortTitle: '坐姿',
    description: '看看此刻的臀下、腿侧与背部中央接触，获得一条调整建议。',
    duration: '即时建议',
    tone: 'clay',
  },
  {
    id: 'anal',
    ordinal: '03',
    title: '提肛',
    shortTitle: '提肛',
    description: '跟随独立口令，练习轻轻收住，再慢慢松开。',
    duration: '约 85 秒',
    tone: 'indigo',
  },
] as const;

export const getModule = (id: ModuleId): ModuleDefinition => {
  const module = MODULES.find((item) => item.id === id);
  if (!module) {
    throw new Error(`Unknown module: ${id}`);
  }
  return module;
};
