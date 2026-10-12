import type { Logger } from '../../application/ports';

export class ConsoleLogger implements Logger {
  info(event: string, fields: Record<string, unknown> = {}): void {
    console.info(`[songxian] ${event}`, fields);
  }

  error(event: string, fields: Record<string, unknown> = {}): void {
    console.error(`[songxian] ${event}`, fields);
  }
}
