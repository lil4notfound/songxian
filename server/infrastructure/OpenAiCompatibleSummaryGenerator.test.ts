/** @vitest-environment node */
// 本文件中的 API 配置、训练记录与总结为脱敏样例，仅用于测试。
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainingSummary } from '../../src/contracts/training';
import { getDefaultPrescription } from '../../src/domain/trainingPlan';
import type { StoredTrainingSession } from '../application/ports';
import { OpenAiCompatibleSummaryGenerator } from './OpenAiCompatibleSummaryGenerator';

const fallback: TrainingSummary = {
  headline: '本次训练已记录',
  body: '今天完成了初级训练。',
  nextAction: '下一次保持当前节奏。',
  source: 'template',
};

const record: StoredTrainingSession = {
  id: 'session-1',
  requestId: 'request-1',
  stage: 'beginner',
  prescriptionVersion: 'pelvic-beginner-v1',
  startedAt: '2026-10-01T08:00:00.000Z',
  endedAt: '2026-10-01T08:10:00.000Z',
  localDate: '2026-10-01',
  status: 'complete',
  targetGroups: 2,
  completedGroups: 2,
  targetCycles: 20,
  completedCycles: 20,
  elapsedSeconds: 600,
  metrics: {
    patternMatchRate: 70,
    timingAdherence: 70,
    releaseRecovery: 70,
    qualityScore: 70,
    quality: 'medium',
  },
  assessment: { effort: 'easy', relaxation: 'easy', discomfort: false },
  summary: null,
  prescription: getDefaultPrescription('beginner'),
};

const generator = () =>
  new OpenAiCompatibleSummaryGenerator({
    baseUrl: 'https://llm.example/v1',
    apiKey: 'test-key',
    model: 'test-model',
  });

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('OpenAiCompatibleSummaryGenerator', () => {
  it('uses the template without contacting the model when the API key is absent', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const unconfigured = new OpenAiCompatibleSummaryGenerator({
      baseUrl: 'https://api.minimax.cn/v1',
      model: 'MiniMax-M3',
    });
    expect(unconfigured.configured()).toBe(false);
    await expect(unconfigured.generate({ record, fallback })).resolves.toEqual(fallback);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends a bounded MiniMax request with no pressure stream and thinking disabled', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          base_resp: { status_code: 0 },
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  headline: '已记录',
                  body: '完成五轮提肛。',
                  nextAction: '不应覆盖',
                }),
              },
            },
          ],
        }),
      ),
    );
    const mini = new OpenAiCompatibleSummaryGenerator({
      baseUrl: 'https://api.minimax.cn/v1',
      apiKey: 'test',
      model: 'MiniMax-M3',
    });
    const anal = { ...record, moduleId: 'anal' as const, stage: null, prescription: null };
    const result = await mini.generate({ record: anal, fallback });
    expect(result).toMatchObject({ source: 'ai', nextAction: fallback.nextAction });
    const args = fetch.mock.calls[0]!;
    expect(args[0]).toBe('https://api.minimax.cn/v1/chat/completions');
    const body = JSON.parse(args[1]!.body as string) as {
      thinking: { type: string };
      max_completion_tokens: number;
      messages: Array<{ content: string }>;
    };
    expect(body).toMatchObject({ thinking: { type: 'disabled' }, max_completion_tokens: 800 });
    expect(body.messages[1]!.content).toContain('提肛');
    expect(body.messages[1]!.content).not.toContain('filteredRaw');
  });
  it.each([401, 429, 500])('falls back on HTTP %i', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status }));
    await expect(generator().generate({ record, fallback })).resolves.toEqual(fallback);
  });
  it.each([
    { base_resp: { status_code: 1004 }, choices: [] },
    { choices: [{ finish_reason: 'length', message: { content: '{}' } }] },
    { choices: [{ message: { content: '{}' } }] },
    { choices: [{ finish_reason: 'stop', message: { content: '{"headline":"缺字段"}' } }] },
  ])('rejects business errors and truncated responses', async (payload) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload)));
    await expect(generator().generate({ record, fallback })).resolves.toEqual(fallback);
  });
  it('uses valid model wording but preserves the deterministic next action', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  headline: '节奏更清楚了',
                  body: '你完成了今天的训练目标。',
                  nextAction: '模型不得决定这里',
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await generator().generate({ record, fallback });
    expect(result).toMatchObject({ headline: '节奏更清楚了', source: 'ai' });
    expect(result.nextAction).not.toBe('模型不得决定这里');
  });

  it('falls back when the model returns invalid JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'not-json' } }] }),
        {
          status: 200,
        },
      ),
    );
    await expect(generator().generate({ record, fallback })).resolves.toEqual(fallback);
  });

  it('aborts after the timeout and returns the template', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const result = generator().generate({ record, fallback });
    await vi.advanceTimersByTimeAsync(15000);
    await expect(result).resolves.toEqual(fallback);
  });
});
