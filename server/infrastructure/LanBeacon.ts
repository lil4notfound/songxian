import { createSocket, type Socket } from 'node:dgram';
import { networkInterfaces } from 'node:os';

const directedBroadcastAddresses = (): string[] => {
  const addresses = new Set<string>(['255.255.255.255']);

  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;

      const address = entry.address.split('.').map(Number);
      const netmask = entry.netmask.split('.').map(Number);
      if (address.length !== 4 || netmask.length !== 4) continue;

      const broadcast = address
        .map((octet, index) => (octet | (~netmask[index]! & 0xff)) & 0xff)
        .join('.');

      // A /32 adapter has no usable broadcast address.
      if (broadcast !== entry.address) addresses.add(broadcast);
    }
  }

  return [...addresses];
};

export class LanBeacon {
  private socket: Socket | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly servicePort: number,
    private readonly beaconPort = 4210,
  ) {}

  start(): void {
    if (this.socket) return;
    this.socket = createSocket('udp4');
    this.socket.bind(() => {
      this.socket?.setBroadcast(true);
      const announce = () => {
        const message = Buffer.from(`SONGXIAN_SERVER_V1|${this.servicePort}`);
        for (const address of directedBroadcastAddresses()) {
          this.socket?.send(message, this.beaconPort, address);
        }
      };
      announce();
      this.timer = setInterval(announce, 1000);
    });
    this.socket.on('error', () => {
      // Manual server-address configuration remains available when UDP is blocked.
    });
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.socket?.close();
    this.socket = null;
  }
}
