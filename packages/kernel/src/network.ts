import { randomUUID } from 'node:crypto';
import type { ComputerSpec, DnsRecord, GatewayRule, PacketTrace, Protocol, SocketRecord, VirtualHttpResponse } from '@seed/protocol';

export interface VirtualService {
  id: string;
  computerId: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  pid: number;
  handle(path: string, method: string, body?: string): Promise<Omit<VirtualHttpResponse, 'traceId'>>;
}

export class InternetFabric {
  private readonly computers = new Map<string, ComputerSpec>();
  private readonly records = new Map<string, DnsRecord>();
  private readonly services = new Map<string, VirtualService>();
  private readonly socketRecords: SocketRecord[] = [];
  private readonly traces: PacketTrace[] = [];
  readonly gateways: GatewayRule[] = [];

  attach(spec: ComputerSpec): void {
    this.computers.set(spec.id, spec);
    this.addDns(spec.hostname, spec.ipv4);
    this.addDns(`${spec.hostname}.seed.local`, spec.ipv4);
  }

  addDns(name: string, value: string, ttl = 300): void {
    this.records.set(name.toLowerCase(), { name: name.toLowerCase(), type: 'A', value, ttl });
  }

  resolve(name: string): string | undefined {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return name;
    return this.records.get(name.toLowerCase())?.value;
  }

  registerService(service: VirtualService): void {
    this.services.set(`${service.host.toLowerCase()}:${service.port}`, service);
    const ip = this.computers.get(service.computerId)?.ipv4;
    if (ip) this.addDns(service.host, ip);
    this.socketRecords.push({
      id: randomUUID(), protocol: service.protocol, computerId: service.computerId,
      localAddress: ip ?? '0.0.0.0', localPort: service.port, state: 'LISTEN', rxBytes: 0, txBytes: 0,
    });
  }

  unregisterService(host: string, port: number): void {
    this.services.delete(`${host.toLowerCase()}:${port}`);
    for (const socket of this.socketRecords) if (socket.localPort === port) socket.state = 'CLOSED';
  }

  private trace(protocol: Protocol, source: string, destination: string, summary: string, bytes = 0, sourcePort?: number, destinationPort?: number, flags?: string[]): PacketTrace {
    const packet: PacketTrace = { id: randomUUID(), at: new Date().toISOString(), protocol, source, destination, summary, bytes, sourcePort, destinationPort, flags };
    this.traces.push(packet);
    if (this.traces.length > 300) this.traces.shift();
    return packet;
  }

  ping(computerId: string, host: string): string {
    const source = this.computers.get(computerId);
    if (!source) throw new Error(`unknown computer: ${computerId}`);
    const destination = this.resolve(host);
    if (!destination) return `ping: cannot resolve ${host}: unknown host`;
    this.trace('icmp', source.ipv4, destination, `echo request ${source.ipv4} → ${destination}`, 64);
    this.trace('icmp', destination, source.ipv4, `echo reply ${destination} → ${source.ipv4}`, 64);
    return `PING ${host} (${destination}): 56 data bytes\n64 bytes from ${destination}: icmp_seq=0 ttl=64 time=0.42 ms\n--- ${host} ping statistics ---\n1 packets transmitted, 1 received, 0.0% packet loss`;
  }

  async request(computerId: string, rawUrl: string, method = 'GET', body?: string): Promise<VirtualHttpResponse> {
    const source = this.computers.get(computerId);
    if (!source) throw new Error(`unknown computer: ${computerId}`);
    const url = new URL(rawUrl.includes('://') ? rawUrl : `http://${rawUrl}`);
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    const protocol = url.protocol === 'https:' ? 'https' : 'http';
    const destination = this.resolve(url.hostname);
    if (!destination) {
      const gateway = this.canEgress(protocol, url.hostname, port);
      if (!gateway) throw new Error(`gateway denied: ${url.hostname}:${port}`);
      this.trace('tcp', source.ipv4, `gateway:${url.hostname}`, 'SYN', 0, 49152, port, ['SYN']);
      this.trace('tcp', `gateway:${url.hostname}`, source.ipv4, 'SYN, ACK', 0, port, 49152, ['SYN', 'ACK']);
      this.trace('tcp', source.ipv4, `gateway:${url.hostname}`, 'ACK', 0, 49152, port, ['ACK']);
      const requestTrace = this.trace(protocol, source.ipv4, `gateway:${url.hostname}`, `${method} ${url.pathname}`, body?.length ?? 0, 49152, port, ['PSH', 'ACK']);
      const response = await fetch(url, { method, body, redirect: 'manual', headers: { 'user-agent': 'seed-gateway/1.0' } });
      const responseBody = await response.text();
      this.trace(protocol, `gateway:${url.hostname}`, source.ipv4, `${response.status} ${response.statusText}`, responseBody.length, port, 49152, ['PSH', 'ACK']);
      this.trace('tcp', source.ipv4, `gateway:${url.hostname}`, 'FIN, ACK', 0, 49152, port, ['FIN', 'ACK']);
      return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: responseBody, traceId: requestTrace.id };
    }
    const service = this.services.get(`${url.hostname.toLowerCase()}:${port}`) ??
      [...this.services.values()].find((candidate) => this.computers.get(candidate.computerId)?.ipv4 === destination && candidate.port === port);
    if (!service) throw new Error(`connection refused: ${url.hostname}:${port}`);
    const clientSocket: SocketRecord = { id: randomUUID(), protocol: 'tcp', computerId, localAddress: source.ipv4, localPort: 49152 + (this.socketRecords.length % 12000), remoteAddress: destination, remotePort: port, state: 'SYN-SENT', rxBytes: 0, txBytes: 0 };
    this.socketRecords.push(clientSocket);
    this.trace('tcp', source.ipv4, destination, 'SYN', 0, clientSocket.localPort, port, ['SYN']);
    this.trace('tcp', destination, source.ipv4, 'SYN, ACK', 0, port, clientSocket.localPort, ['SYN', 'ACK']);
    this.trace('tcp', source.ipv4, destination, 'ACK', 0, clientSocket.localPort, port, ['ACK']);
    clientSocket.state = 'ESTABLISHED';
    const trace = this.trace(protocol, source.ipv4, destination, `${method} ${url.pathname}`, body?.length ?? 0, clientSocket.localPort, port, ['PSH', 'ACK']);
    const response = await service.handle(`${url.pathname}${url.search}`, method, body);
    const listener = this.socketRecords.find((socket) => socket.computerId === service.computerId && socket.localPort === port && socket.state === 'LISTEN');
    if (listener) { listener.rxBytes += body?.length ?? 0; listener.txBytes += response.body.length; }
    clientSocket.txBytes += body?.length ?? 0;
    clientSocket.rxBytes += response.body.length;
    this.trace(protocol, destination, source.ipv4, `${response.status} response`, response.body.length, port, clientSocket.localPort, ['PSH', 'ACK']);
    this.trace('tcp', source.ipv4, destination, 'FIN, ACK', 0, clientSocket.localPort, port, ['FIN', 'ACK']);
    clientSocket.state = 'CLOSED';
    return { ...response, traceId: trace.id };
  }

  addGateway(rule: GatewayRule): void { this.gateways.push(structuredClone(rule)); }
  canEgress(protocol: Protocol, hostname: string, port: number): GatewayRule | undefined {
    return this.gateways.find((rule) => rule.enabled && rule.direction === 'egress' && rule.protocols.includes(protocol) &&
      (rule.hostnames.includes(hostname) || rule.hostnames.includes('*')) && (rule.ports === '*' || rule.ports.includes(port)));
  }

  listDns(): DnsRecord[] { return [...this.records.values()].map((record) => ({ ...record })); }
  listSockets(computerId?: string): SocketRecord[] { return this.socketRecords.filter((socket) => !computerId || socket.computerId === computerId).map((socket) => ({ ...socket })); }
  listPackets(): PacketTrace[] { return this.traces.map((trace) => ({ ...trace })); }
  listServices(): Array<Omit<VirtualService, 'handle'>> { return [...this.services.values()].map(({ handle: _, ...service }) => service); }
}
