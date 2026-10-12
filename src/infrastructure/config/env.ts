import { z } from 'zod';

const envSchema = z.object({
  VITE_DEVICE_MODE: z.enum(['mock', 'live']).default('live'),
  VITE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export const env = envSchema.parse(import.meta.env);
