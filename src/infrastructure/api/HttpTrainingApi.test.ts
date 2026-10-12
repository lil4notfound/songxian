import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompleteTrainingRequest, StartTrainingRequest } from '../../contracts/training';
import type { PendingTrainingRecord } from './IndexedDbTrainingQueue';
import { HttpTrainingApi } from './HttpTrainingApi';

const queued = vi.hoisted(() => new Map<string, PendingTrainingRecord>());
vi.mock('./IndexedDbTrainingQueue', () => ({
  IndexedDbTrainingQueue: class {
    put(item: PendingTrainingRecord) {
      queued.set(item.localId, structuredClone(item));
      return Promise.resolve();
    }
    list() {
      return Promise.resolve([...queued.values()]);
    }
    remove(id: string) {
      queued.delete(id);
      return Promise.resolve();
    }
  },
}));
const start: StartTrainingRequest = {
  requestId: 'anal-start',
  moduleId: 'anal',
  stage: null,
  evaluationMode: 'timer',
  prescriptionVersion: 'anal-basic-v1',
  startedAt: '2026-10-12T01:00:00.000Z',
};
const complete: CompleteTrainingRequest = {
  requestId: 'anal-complete',
  endedAt: '2026-10-12T01:01:00.000Z',
  status: 'complete',
  targetGroups: 1,
  completedGroups: 1,
  targetCycles: 5,
  completedCycles: 5,
  elapsedSeconds: 60,
  metrics: null,
  evaluationMode: 'timer',
  assessment: { effort: 'easy', relaxation: 'easy', discomfort: false },
  exceptions: { events: [{ reason: 'offline', count: 1, seconds: 8 }], redoCount: 1 },
};
afterEach(() => {
  queued.clear();
  vi.unstubAllGlobals();
});
describe('offline training synchronization', () => {
  it('preserves anal mode, null stage and exceptions through offline saving and serialized retry', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const api = new HttpTrainingApi();
    const active = await api.startSession(start);
    expect(active).toMatchObject({
      moduleId: 'anal',
      stage: null,
      targetCycles: 5,
      targetGroups: 1,
    });
    const saved = await api.completeSession(active.id, complete);
    expect(saved).toMatchObject({
      moduleId: 'anal',
      stage: null,
      evaluationMode: 'timer',
      exceptions: complete.exceptions,
    });
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...active, id: 'server-anal' }), { status: 201 }),
    );
    fetchMock.mockResolvedValueOnce(new Response('{}'));
    await Promise.all([api.flushPending(), api.flushPending()]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual(start);
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/v1/training/sessions/server-anal/complete');
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)).toEqual(complete);
    expect(queued.size).toBe(0);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          headline: '提肛已记录',
          body: '已同步五轮记录。',
          nextAction: '保持轻柔。',
          source: 'ai',
        }),
      ),
    );
    expect((await api.getSummary(active.id, true)).source).toBe('ai');
    expect(fetchMock.mock.calls[2]![0]).toBe(
      '/api/v1/training/sessions/server-anal/summary?retry=true',
    );
    // Fastify rejects a bodyless POST carrying application/json before it reaches the summary route.
    expect(new Headers(fetchMock.mock.calls[2]![1]?.headers).has('content-type')).toBe(false);
  });
  it('keeps legacy pelvic queue entries until a failed upload succeeds', async () => {
    const legacy: StartTrainingRequest = {
      requestId: 'legacy-start',
      startedAt: start.startedAt,
      stage: 'beginner',
      prescriptionVersion: 'pelvic-three-stage-v1-beginner-3-6',
    };
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const api = new HttpTrainingApi();
    const active = await api.startSession(legacy);
    expect(active.moduleId).toBe('pelvic_floor');
    await api.completeSession(active.id, complete);
    await api.flushPending();
    expect(queued.size).toBe(1);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...active, id: 'legacy-server' })),
    );
    fetchMock.mockResolvedValueOnce(new Response('{}'));
    await api.flushPending();
    expect(queued.size).toBe(0);
  });
});
