import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import type { ComputerSpec, DnsRecord, GatewayRule, PacketTrace, Protocol, SocketRecord, VirtualHttpResponse } from '@seed/protocol';

function ipv4Number(value: string): number | undefined {
  const octets = value.split('.');
  if (octets.length !== 4) return undefined;
  const parsed = octets.map((octet) => Number(octet));
  if (parsed.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return undefined;
  return parsed.reduce((result, octet) => (result * 256 + octet) >>> 0, 0);
}

/** Pure helper used by the gateway policy and its acceptance tests. */
export function cidrContains(cidr: string, address: string): boolean {
  const [network, prefixText] = cidr.split('/');
  const prefix = prefixText === undefined ? 32 : Number(prefixText);
  const networkNumber = network ? ipv4Number(network) : undefined;
  const addressNumber = ipv4Number(address);
  if (networkNumber === undefined || addressNumber === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (networkNumber & mask) === (addressNumber & mask);
}

function hostnameMatches(pattern: string, hostname: string): boolean {
  const expected = pattern.toLowerCase();
  const actual = hostname.toLowerCase();
  if (expected === '*') return true;
  if (expected.startsWith('*.')) return actual.endsWith(expected.slice(1)) && actual !== expected.slice(2);
  return expected === actual;
}

const LOOPBACK_NAMES = new Set(['localhost', 'localhost.local', 'localhost.localdomain']);

function normalizeHost(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\.$/, '');
  return normalized.startsWith('[') && normalized.endsWith(']') ? normalized.slice(1, -1) : normalized;
}

function isLoopbackHost(value: string): boolean {
  const host = normalizeHost(value);
  return LOOPBACK_NAMES.has(host) || host === '::1' || host.startsWith('127.');
}

function isWildcardHost(value: string): boolean {
  const host = normalizeHost(value);
  return host === '*' || host === '0.0.0.0' || host === '::';
}

function loopbackAddress(value: string): string {
  const host = normalizeHost(value);
  if (host === '::1') return '::1';
  if (host.startsWith('127.')) return host;
  return '127.0.0.1';
}

type ServiceBinding = 'loopback' | 'wildcard' | 'network';

function serviceBinding(host: string): ServiceBinding {
  if (isLoopbackHost(host)) return 'loopback';
  if (isWildcardHost(host)) return 'wildcard';
  return 'network';
}

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

  attach(spec: ComputerSpec, domain = 'seed.local'): void {
    this.computers.set(spec.id, spec);
    this.addDns(spec.hostname, spec.ipv4);
    this.addDns(`${spec.hostname}.${domain}`, spec.ipv4);
  }

  addDns(name: string, value: string, ttl = 300): void {
    const normalized = normalizeHost(name);
    // Loopback names are resolved from each computer's hosts namespace. They
    // must never enter the shared DNS zone, where one computer could overwrite
    // another computer's localhost mapping.
    if (isLoopbackHost(normalized) || isWildcardHost(normalized)) return;
    this.records.set(normalized, { name: normalized, type: 'A', value, ttl });
  }

  resolve(name: string, computerId?: string): string | undefined {
    const normalized = normalizeHost(name);
    if (isLoopbackHost(normalized)) {
      if (computerId && !this.computers.has(computerId)) throw new Error(`unknown computer: ${computerId}`);
      return loopbackAddress(normalized);
    }
    if (ipv4Number(normalized) !== undefined) return normalized;
    return this.records.get(normalized)?.value;
  }

  registerService(service: VirtualService): void {
    const host = normalizeHost(service.host);
    const binding = serviceBinding(host);
    const ip = this.computers.get(service.computerId)?.ipv4;
    if (!ip) throw new Error(`cannot register service ${service.id} on unknown computer: ${service.computerId}`);
    const key = `${service.computerId}\u0000${host}\u0000${service.port}`;
    this.services.set(key, { ...service, host });
    if (binding === 'network') this.addDns(host, ip);
    const localAddress = binding === 'loopback' ? loopbackAddress(host) : binding === 'wildcard' ? '0.0.0.0' : ip;
    if (!this.socketRecords.some((socket) => socket.computerId === service.computerId && socket.localAddress === localAddress && socket.localPort === service.port && socket.state === 'LISTEN')) {
      this.socketRecords.push({
        id: randomUUID(), protocol: service.protocol, computerId: service.computerId,
        localAddress, localPort: service.port, state: 'LISTEN', rxBytes: 0, txBytes: 0,
      });
    }
  }

  unregisterService(host: string, port: number, computerId?: string): void {
    const normalized = normalizeHost(host);
    const affectedComputers = new Set<string>();
    for (const [key, service] of this.services) {
      if (normalizeHost(service.host) !== normalized || service.port !== port || (computerId && service.computerId !== computerId)) continue;
      this.services.delete(key);
      affectedComputers.add(service.computerId);
    }
    for (const affectedComputer of affectedComputers) this.closeUnusedListeners(affectedComputer, port);
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
    const destination = this.resolve(host, computerId);
    if (!destination) return `ping: cannot resolve ${host}: unknown host`;
    const sourceAddress = isLoopbackHost(host) ? destination : source.ipv4;
    this.trace('icmp', sourceAddress, destination, `echo request ${sourceAddress} → ${destination}`, 64);
    this.trace('icmp', destination, sourceAddress, `echo reply ${destination} → ${sourceAddress}`, 64);
    return `PING ${host} (${destination}): 56 data bytes\n64 bytes from ${destination}: icmp_seq=0 ttl=64 time=0.42 ms\n--- ${host} ping statistics ---\n1 packets transmitted, 1 received, 0.0% packet loss`;
  }

  async request(computerId: string, rawUrl: string, method = 'GET', body?: string): Promise<VirtualHttpResponse> {
    const source = this.computers.get(computerId);
    if (!source) throw new Error(`unknown computer: ${computerId}`);
    const url = new URL(rawUrl.includes('://') ? rawUrl : `http://${rawUrl}`);
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    const protocol = url.protocol === 'https:' ? 'https' : 'http';
    const requestedHost = normalizeHost(url.hostname);
    const loopbackDestination = isLoopbackHost(requestedHost);
    const wildcardDestination = isWildcardHost(requestedHost);
    const destination = this.resolve(requestedHost, computerId);
    const destinationComputer = loopbackDestination || wildcardDestination
      ? source
      : destination ? [...this.computers.values()].find((computer) => computer.ipv4 === destination) : undefined;
    const virtualDestination = Boolean(destinationComputer);
    if (!virtualDestination) {
      let resolvedAddresses = destination ? [destination] : [];
      let gateway = this.canEgress(protocol, url.hostname, port, resolvedAddresses);
      if (!gateway && !destination) {
        try { resolvedAddresses = (await lookup(url.hostname, { all: true, verbatim: true })).map((result) => result.address); }
        catch { resolvedAddresses = []; }
        gateway = this.canEgress(protocol, url.hostname, port, resolvedAddresses);
      }
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
    if (!destination || !destinationComputer) throw new Error(`virtual destination disappeared: ${url.hostname}`);
    const service = this.findVirtualService(computerId, destinationComputer.id, requestedHost, port);
    if (!service) throw new Error(`connection refused: ${url.hostname}:${port}`);
    const routedDestination = loopbackDestination ? loopbackAddress(requestedHost) : destination;
    const sourceAddress = loopbackDestination ? routedDestination : source.ipv4;
    const clientSocket: SocketRecord = { id: randomUUID(), protocol: 'tcp', computerId, localAddress: sourceAddress, localPort: 49152 + (this.socketRecords.length % 12000), remoteAddress: routedDestination, remotePort: port, state: 'SYN-SENT', rxBytes: 0, txBytes: 0 };
    this.socketRecords.push(clientSocket);
    this.trace('tcp', sourceAddress, routedDestination, 'SYN', 0, clientSocket.localPort, port, ['SYN']);
    this.trace('tcp', routedDestination, sourceAddress, 'SYN, ACK', 0, port, clientSocket.localPort, ['SYN', 'ACK']);
    this.trace('tcp', sourceAddress, routedDestination, 'ACK', 0, clientSocket.localPort, port, ['ACK']);
    clientSocket.state = 'ESTABLISHED';
    const trace = this.trace(protocol, sourceAddress, routedDestination, `${method} ${url.pathname}`, body?.length ?? 0, clientSocket.localPort, port, ['PSH', 'ACK']);
    const response = await service.handle(`${url.pathname}${url.search}`, method, body);
    const listenerAddress = this.listenerAddressForService(service);
    const listener = this.socketRecords.find((socket) => socket.computerId === service.computerId && socket.localAddress === listenerAddress && socket.localPort === port && socket.state === 'LISTEN');
    if (listener) { listener.rxBytes += body?.length ?? 0; listener.txBytes += response.body.length; }
    clientSocket.txBytes += body?.length ?? 0;
    clientSocket.rxBytes += response.body.length;
    this.trace(protocol, routedDestination, sourceAddress, `${response.status} response`, response.body.length, port, clientSocket.localPort, ['PSH', 'ACK']);
    this.trace('tcp', sourceAddress, routedDestination, 'FIN, ACK', 0, clientSocket.localPort, port, ['FIN', 'ACK']);
    clientSocket.state = 'CLOSED';
    return { ...response, traceId: trace.id };
  }

  addGateway(rule: GatewayRule): void { this.gateways.push(structuredClone(rule)); }
  setGatewayEnabled(id: string, enabled: boolean): GatewayRule {
    const rule = this.gateways.find((candidate) => candidate.id === id);
    if (!rule) throw new Error(`unknown gateway rule: ${id}`);
    rule.enabled = enabled;
    return structuredClone(rule);
  }

  unregisterServicesForProcess(computerId: string, pid: number): string[] {
    const removed: string[] = [];
    const affectedPorts = new Set<number>();
    for (const [key, service] of this.services.entries()) {
      if (service.computerId !== computerId || service.pid !== pid) continue;
      this.services.delete(key);
      removed.push(service.id);
      affectedPorts.add(service.port);
    }
    for (const port of affectedPorts) this.closeUnusedListeners(computerId, port);
    return removed;
  }

  private findVirtualService(sourceComputerId: string, destinationComputerId: string, requestedHost: string, port: number): VirtualService | undefined {
    const candidates = [...this.services.values()].filter((service) => service.computerId === destinationComputerId && service.port === port);
    if (isLoopbackHost(requestedHost)) {
      if (sourceComputerId !== destinationComputerId) return undefined;
      const requestedAddress = loopbackAddress(requestedHost);
      return candidates.find((candidate) => serviceBinding(candidate.host) === 'loopback' && loopbackAddress(candidate.host) === requestedAddress)
        ?? candidates.find((candidate) => serviceBinding(candidate.host) === 'wildcard');
    }
    if (isWildcardHost(requestedHost)) {
      if (sourceComputerId !== destinationComputerId) return undefined;
      return candidates.find((candidate) => serviceBinding(candidate.host) === 'wildcard');
    }
    // Exact virtual hosts take precedence. The interface fallback preserves
    // direct-IP/computer-hostname access, but loopback listeners are
    // deliberately excluded so a remote peer cannot reach them via the NIC.
    return candidates.find((candidate) => serviceBinding(candidate.host) !== 'loopback' && normalizeHost(candidate.host) === requestedHost)
      ?? candidates.find((candidate) => serviceBinding(candidate.host) === 'wildcard')
      ?? candidates.find((candidate) => serviceBinding(candidate.host) === 'network');
  }

  private closeUnusedListeners(computerId: string, port: number): void {
    const bindings = new Set([...this.services.values()]
      .filter((service) => service.computerId === computerId && service.port === port)
      .map((service) => this.listenerAddressForService(service)));
    for (const socket of this.socketRecords) {
      if (socket.computerId === computerId && socket.localPort === port && socket.state === 'LISTEN' && !bindings.has(socket.localAddress)) socket.state = 'CLOSED';
    }
  }

  private listenerAddressForService(service: VirtualService): string {
    const binding = serviceBinding(service.host);
    if (binding === 'loopback') return loopbackAddress(service.host);
    if (binding === 'wildcard') return '0.0.0.0';
    return this.computers.get(service.computerId)?.ipv4 ?? '0.0.0.0';
  }
  canEgress(protocol: Protocol, hostname: string, port: number, resolvedAddresses: string[] = []): GatewayRule | undefined {
    return this.gateways.find((rule) => {
      if (!rule.enabled || rule.direction !== 'egress' || !rule.protocols.includes(protocol)) return false;
      if (rule.ports !== '*' && !rule.ports.includes(port)) return false;
      const hostnameAllowed = rule.hostnames.length === 0 || rule.hostnames.some((pattern) => hostnameMatches(pattern, hostname));
      if (!hostnameAllowed) return false;
      if (rule.cidrs.length === 0) return rule.hostnames.length > 0;
      if (resolvedAddresses.length === 0) return false;
      // Every current DNS answer must remain inside the rule. This blocks a
      // mixed-answer hostname from bypassing a CIDR constraint.
      return resolvedAddresses.every((address) => rule.cidrs.some((cidr) => cidrContains(cidr, address)));
    });
  }

  listDns(): DnsRecord[] { return [...this.records.values()].map((record) => ({ ...record })); }
  listSockets(computerId?: string): SocketRecord[] { return this.socketRecords.filter((socket) => !computerId || socket.computerId === computerId).map((socket) => ({ ...socket })); }
  listPackets(): PacketTrace[] { return this.traces.map((trace) => ({ ...trace })); }
  listServices(): Array<Omit<VirtualService, 'handle'>> { return [...this.services.values()].map(({ handle: _, ...service }) => service); }
}
