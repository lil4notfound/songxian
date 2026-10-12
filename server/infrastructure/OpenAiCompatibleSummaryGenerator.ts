import { z } from 'zod';
import type { TrainingSummary } from '../../src/contracts/training';
import { stageLabels } from '../../src/contracts/training';
import type { SummaryGenerator } from '../application/ports';
const modelOutputSchema = z.object({
  headline: z.string().min(1).max(48),
  body: z.string().min(1).max(360),
  nextAction: z.string().min(1).max(120),
});
type LlmConfig = { baseUrl?: string; apiKey?: string; model?: string; timeoutMs?: number };
export class OpenAiCompatibleSummaryGenerator implements SummaryGenerator {
  constructor(private readonly config: LlmConfig) {}
  configured(): boolean {
    return Boolean(this.config.baseUrl && this.config.apiKey && this.config.model);
  }
  async generate(input: Parameters<SummaryGenerator['generate']>[0]): Promise<TrainingSummary> {
    if (!this.configured()) return input.fallback;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 15000);
    try {
      const record = input.record;
      const response = await fetch(this.config.baseUrl!.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + this.config.apiKey!,
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0.2,
          max_completion_tokens: 800,
          stream: false,
          ...(this.config.model === 'MiniMax-M3'
            ? { thinking: { type: 'disabled' }, reasoning_split: true }
            : {}),
          messages: [
            {
              role: 'system',
              content:
                '你是训练记录助手。只能整理给定的单次训练事实，不诊断疾病，不声称症状疗效，不推测未测量的肌肉活动。不改变规则给出的下一步，不在正文中增加训练强度、轮数或其他训练建议。明确计时模式不能评价动作。只输出 JSON：headline、body、nextAction。正文包含完成量、可用的压力模式表现、异常与调整情况，语气简短平静。',
            },
            {
              role: 'user',
              content: JSON.stringify({
                module: record.moduleId === 'anal' ? '提肛' : '盆底肌',
                stage: record.stage ? stageLabels[record.stage] : null,
                status: record.status,
                evaluationMode: record.evaluationMode ?? 'sensor',
                completedGroups: record.completedGroups,
                completedCycles: record.completedCycles,
                targetGroups: record.targetGroups,
                targetCycles: record.targetCycles,
                elapsedSeconds: record.elapsedSeconds,
                metrics: record.metrics,
                selfAssessment: record.assessment,
                exceptions: record.exceptions ?? null,
                requiredNextAction: input.fallback.nextAction,
              }),
            },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) return input.fallback;
      const payload = (await response.json()) as {
        base_resp?: { status_code?: number };
        choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
      };
      if (payload.base_resp?.status_code && payload.base_resp.status_code !== 0)
        return input.fallback;
      const choice = payload.choices?.[0];
      if (!choice || choice.finish_reason !== 'stop') return input.fallback;
      const content = choice.message?.content
        ?.replace(/<think>[\s\S]*?<\/think>/g, '')
        .trim()
        .replace(/^\x60\x60\x60(?:json)?\s*/, '')
        .replace(/\s*\x60\x60\x60$/, '');
      if (!content) return input.fallback;
      const parsed = modelOutputSchema.safeParse(JSON.parse(content) as unknown);
      if (!parsed.success) return input.fallback;
      return { ...parsed.data, nextAction: input.fallback.nextAction, source: 'ai' };
    } catch {
      return input.fallback;
    } finally {
      clearTimeout(timeout);
    }
  }
}
