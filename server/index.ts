import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.server.local') });
config({ path: resolve(process.cwd(), '.env.server') });

const { TrainingService } = await import('./application/TrainingService');
const { DeviceService } = await import('./application/DeviceService');
const { serverEnv } = await import('./config/env');
const { createServer } = await import('./http/createServer');
const { OpenAiCompatibleSummaryGenerator } = await import(
  './infrastructure/OpenAiCompatibleSummaryGenerator'
);
const { SQLiteTrainingRepository } = await import('./infrastructure/SQLiteTrainingRepository');
const { SQLiteDeviceRepository } = await import('./infrastructure/SQLiteDeviceRepository');
const { LanBeacon } = await import('./infrastructure/LanBeacon');

const databasePath = resolve(process.cwd(), serverEnv.DATABASE_PATH);
const repository = new SQLiteTrainingRepository(databasePath);
const deviceRepository = new SQLiteDeviceRepository(databasePath);
const summaryGenerator = new OpenAiCompatibleSummaryGenerator({
  baseUrl: serverEnv.LLM_BASE_URL,
  apiKey: serverEnv.LLM_API_KEY,
  model: serverEnv.LLM_MODEL,
  timeoutMs: serverEnv.LLM_TIMEOUT_MS,
});
const service = new TrainingService(repository, summaryGenerator, serverEnv.PROFILE_TIME_ZONE);
const deviceService = new DeviceService(deviceRepository);
const app = await createServer(service, {
  serveFrontend: process.env.NODE_ENV === 'production',
  device: {
    service: deviceService,
    token: serverEnv.DEVICE_TOKEN,
  },
});

await app.listen({ port: serverEnv.SERVER_PORT, host: '0.0.0.0' });
const beacon = new LanBeacon(serverEnv.SERVER_PORT, serverEnv.DEVICE_BEACON_PORT);
beacon.start();

const close = async () => {
  beacon.close();
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());
