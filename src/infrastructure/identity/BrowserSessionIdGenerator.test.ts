import { describe, expect, it } from 'vitest';
import { BrowserSessionIdGenerator } from './BrowserSessionIdGenerator';

describe('BrowserSessionIdGenerator', () => {
  it('uses randomUUID when the browser permits it', () => {
    const generator = new BrowserSessionIdGenerator({
      randomUUID: () => 'native-session-id',
    });

    expect(generator.create()).toBe('native-session-id');
  });

  it('falls back to a UUID when randomUUID is unavailable on an HTTP origin', () => {
    const generator = new BrowserSessionIdGenerator({
      getRandomValues: (values) => {
        values.fill(1);
        return values;
      },
    });

    expect(generator.create()).toBe('01010101-0101-4101-8101-010101010101');
  });
});
