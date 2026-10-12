import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { calibrationProfileSchema, deviceFrameBatchSchema } from '../../src/contracts/device';
import {
  completeTrainingRequestSchema,
  startTrainingRequestSchema,
  trainingStageSchema,
} from '../../src/contracts/training';
import {
  PrescriptionChangedError,
  SessionNotFoundError,
  StageLockedError,
  type TrainingService,
} from '../application/TrainingService';
import type { DeviceService } from '../application/DeviceService';

type DeviceServerOptions = {
  service: DeviceService;
  token: string;
};

export const createServer = async (
  service: TrainingService,
  options: { serveFrontend?: boolean; device?: DeviceServerOptions } = {},
): Promise<FastifyInstance> => {
  const app = Fastify({ logger: true, bodyLimit: 64 * 1024 });

  app.get('/healthz', () => ({ status: 'ok', ...service.health() }));

  if (options.device) {
    const device = options.device;

    app.post('/api/v1/device/frames', async (request, reply) => {
      if (request.headers['x-device-token'] !== device.token) {
        return reply.code(401).send({ code: 'INVALID_DEVICE_TOKEN' });
      }
      const input = deviceFrameBatchSchema.safeParse(request.body);
      if (!input.success) {
        return reply.code(400).send({ code: 'INVALID_DEVICE_FRAMES', issues: input.error.issues });
      }
      const result = device.service.ingest(input.data);
      return reply.code(result.duplicate ? 200 : 202).send(result);
    });

    app.get('/api/v1/device/status', () => device.service.status());

    app.get('/api/v1/device/calibration', (request, reply) => {
      const query = z
        .object({ deviceId: z.string().optional(), layoutVersion: z.string().optional() })
        .safeParse(request.query);
      if (!query.success) return reply.code(400).send({ code: 'INVALID_QUERY' });
      const calibration = device.service.getCalibration(
        query.data.deviceId,
        query.data.layoutVersion,
      );
      return calibration ? calibration : reply.code(404).send({ code: 'CALIBRATION_NOT_FOUND' });
    });

    app.put('/api/v1/device/calibration', (request, reply) => {
      const input = calibrationProfileSchema.safeParse(request.body);
      if (!input.success) {
        return reply.code(400).send({ code: 'INVALID_CALIBRATION', issues: input.error.issues });
      }
      return device.service.saveCalibration(input.data);
    });

    app.get('/api/v1/device/stream', (request, reply) => {
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      reply.raw.write('retry: 1000\n\n');
      const send = (telemetry: unknown) => {
        if (!reply.raw.destroyed) {
          reply.raw.write(`event: telemetry\ndata: ${JSON.stringify(telemetry)}\n\n`);
        }
      };
      const unsubscribe = device.service.subscribe(send);
      const heartbeat = setInterval(() => {
        if (!reply.raw.destroyed) reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
      }, 10_000);
      request.raw.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    });
  }

  app.get('/api/v1/training/plan', async (request, reply) => {
    const query = z.object({ stage: trainingStageSchema.optional() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ code: 'INVALID_QUERY' });
    try {
      return service.getPlan(query.data.stage);
    } catch (error) {
      if (error instanceof StageLockedError) {
        return reply.code(409).send({ code: 'STAGE_LOCKED' });
      }
      throw error;
    }
  });

  app.post('/api/v1/training/demo-unlocks', async (request, reply) => {
    const input = z
      .object({ stage: z.enum(['intermediate', 'advanced']), enabled: z.boolean() })
      .safeParse(request.body);
    if (!input.success) return reply.code(400).send({ code: 'INVALID_DEMO_UNLOCK' });
    return service.setDemoUnlock(input.data.stage, input.data.enabled);
  });

  app.post('/api/v1/training/sessions', async (request, reply) => {
    const input = startTrainingRequestSchema.safeParse(request.body);
    if (!input.success)
      return reply.code(400).send({ code: 'INVALID_SESSION', issues: input.error.issues });
    try {
      return reply.code(201).send(service.startSession(input.data));
    } catch (error) {
      if (error instanceof StageLockedError) return reply.code(409).send({ code: 'STAGE_LOCKED' });
      if (error instanceof PrescriptionChangedError) {
        return reply.code(409).send({ code: 'PRESCRIPTION_CHANGED' });
      }
      throw error;
    }
  });

  app.put('/api/v1/training/sessions/:id/complete', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    const input = completeTrainingRequestSchema.safeParse(request.body);
    if (!params.success || !input.success)
      return reply.code(400).send({ code: 'INVALID_COMPLETION' });
    try {
      return service.completeSession(params.data.id, input.data);
    } catch (error) {
      if (error instanceof SessionNotFoundError) return reply.code(404).send({ code: 'NOT_FOUND' });
      throw error;
    }
  });

  app.post('/api/v1/training/sessions/:id/summary', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: 'INVALID_SESSION' });
    try {
      const query = z
        .object({ retry: z.enum(['true', 'false']).optional() })
        .safeParse(request.query);
      if (!query.success) return reply.code(400).send({ code: 'INVALID_QUERY' });
      return await service.summarize(params.data.id, query.data.retry === 'true');
    } catch (error) {
      if (error instanceof SessionNotFoundError) return reply.code(404).send({ code: 'NOT_FOUND' });
      throw error;
    }
  });

  app.get('/api/v1/training/records', async (request, reply) => {
    const query = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ code: 'INVALID_MONTH' });
    return service.getCalendar(query.data.month);
  });

  app.get('/api/v1/training/progress', () => service.getProgress());

  if (options.serveFrontend) {
    const root = resolve(process.cwd(), 'dist');
    if (existsSync(root)) {
      await app.register(fastifyStatic, { root, wildcard: false });
      app.setNotFoundHandler((request, reply) => {
        if (request.raw.url?.startsWith('/api/'))
          return reply.code(404).send({ code: 'NOT_FOUND' });
        return reply.sendFile('index.html');
      });
    }
  }

  return app;
};
