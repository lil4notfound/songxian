import type { SessionIdGenerator } from '../../application/ports';

type BrowserCrypto = {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint8Array) => Uint8Array;
};

const fallbackBytes = (): Uint8Array => {
  const values = new Uint8Array(16);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = Math.floor(Math.random() * 256);
  }
  return values;
};

const formatUuid = (values: Uint8Array): string => {
  values[6] = (values[6]! & 0x0f) | 0x40;
  values[8] = (values[8]! & 0x3f) | 0x80;
  const hex = Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export class BrowserSessionIdGenerator implements SessionIdGenerator {
  constructor(private readonly browserCrypto: BrowserCrypto | null = globalThis.crypto) {}

  create(): string {
    if (this.browserCrypto?.randomUUID) {
      try {
        return this.browserCrypto.randomUUID();
      } catch {
        // Some mobile browsers expose randomUUID but reject it on an HTTP LAN origin.
      }
    }

    const values = this.browserCrypto?.getRandomValues
      ? this.browserCrypto.getRandomValues(new Uint8Array(16))
      : fallbackBytes();
    return formatUuid(values);
  }
}
