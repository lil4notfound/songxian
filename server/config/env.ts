import { z } from 'zod';

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
);

const serverEnvSchema = z.object({
  SERVER_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_PATH: z.string().default('data/songxian.db'),
  PROFILE_TIME_ZONE: z.string().default('Asia/Shanghai'),
  DEVICE_TOKEN: z.string().min(12),
  DEVICE_BEACON_PORT: z.coerce.number().int().positive().default(4210),
  LLM_BASE_URL: optionalText.default('https://api.minimax.cn/v1'),
  LLM_API_KEY: optionalText,
  LLM_MODEL: optionalText.default('MiniMax-M3'),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
});

export const serverEnv = serverEnvSchema.parse(process.env);
