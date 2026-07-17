export type OSKind = 'macos' | 'windows' | 'ubuntu';
export type ShellKind = 'zsh' | 'powershell' | 'bash';
export type ProcessState = 'running' | 'sleeping' | 'stopped' | 'zombie';
export type Protocol = 'tcp' | 'udp' | 'icmp' | 'http' | 'https';
export type PackageManagerKind = 'brew' | 'mas' | 'apt' | 'dpkg' | 'snap' | 'flatpak' | 'winget' | 'choco' | 'scoop' | 'npm' | 'pnpm' | 'yarn' | 'bun' | 'pip' | 'pipx' | 'poetry' | 'uv' | 'cargo' | 'go' | 'gem' | 'composer' | 'dotnet' | 'nuget' | 'vcpkg' | 'conda';
export type CollaborationServiceId = 'slack' | 'teams';
export type AppServiceKind = 'app-registry' | 'collaboration' | 'git' | 'mail' | 'calendar' | 'identity' | 'cloud-data' | 'media-catalog' | 'model-api' | 'virtual-network-client';

export interface DiskSpec {
  id: string;
  label: string;
  mount: string;
  capacityBytes: number;
}

export interface DisplaySpec {
  id: string;
  name: string;
  width: number;
  height: number;
  scale: number;
}

export interface ComputerSpec {
  id: string;
  hostname: string;
  os: OSKind;
  shell: ShellKind;
  ipv4: string;
  memoryBytes: number;
  cpuCores: number;
  disks: DiskSpec[];
  displays: DisplaySpec[];
}

export interface ProcessRecord {
  pid: number;
  ppid: number;
  computerId: string;
  executable: string;
  argv: string[];
  cwd: string;
  env: Record<string, string>;
  state: ProcessState;
  startedAt: string;
  cpuTimeMs: number;
  memoryBytes: number;
  listeningPorts: number[];
}

export interface InodeRecord {
  id: string;
  diskId: string;
  kind: 'file' | 'directory' | 'symlink';
  mode: number;
  size: number;
  createdAt: string;
  modifiedAt: string;
  target?: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  inode: InodeRecord;
}

export interface DnsRecord {
  name: string;
  type: 'A' | 'CNAME';
  value: string;
  ttl: number;
}

export interface SocketRecord {
  id: string;
  protocol: Protocol;
  computerId: string;
  localAddress: string;
  localPort: number;
  remoteAddress?: string;
  remotePort?: number;
  state: 'LISTEN' | 'SYN-SENT' | 'ESTABLISHED' | 'CLOSED';
  rxBytes: number;
  txBytes: number;
}

export interface PacketTrace {
  id: string;
  at: string;
  protocol: Protocol;
  source: string;
  destination: string;
  sourcePort?: number;
  destinationPort?: number;
  flags?: string[];
  bytes: number;
  summary: string;
}

export interface GatewayRule {
  id: string;
  name: string;
  enabled: boolean;
  direction: 'egress' | 'ingress';
  protocols: Protocol[];
  cidrs: string[];
  hostnames: string[];
  ports: number[] | '*';
  audit: boolean;
}

/**
 * Fully serializable input consumed by the simulation kernel. Ecosystem
 * packages own policy and composition; the kernel only owns execution.
 */
export interface SimulationComputerTemplate {
  spec: ComputerSpec;
  systemAppIds: readonly string[];
  thirdPartyAppIds: readonly string[];
  roles: readonly string[];
}

export type SimulationServiceKind = AppServiceKind | 'dns' | 'intranet';

export interface SimulationServiceSpec {
  id: string;
  host: string;
  ipv4: string;
  computerId: string;
  port: number;
  protocol: Protocol;
  kind: SimulationServiceKind;
  /** Required for app-registry services so installation resolves by OS. */
  targetOS?: OSKind;
  /** State with different isolation domains must never share a backing store. */
  isolationDomain: string;
}

export interface SimulationTopology {
  id: string;
  version: string;
  network: {
    cidr: string;
    dns: string;
    domain: string;
  };
  computers: readonly SimulationComputerTemplate[];
  services: readonly SimulationServiceSpec[];
  gateways: readonly GatewayRule[];
}

export interface AppManifest {
  id: string;
  name: string;
  version: string;
  publisher: string;
  description: string;
  icon: string;
  supportedOS: OSKind[];
  entrypoint: string;
  packagePath: string;
  system?: boolean;
  defaultSize?: { width: number; height: number };
  fileAssociations?: string[];
  capabilities: Array<'filesystem' | 'network' | 'notifications' | 'microphone' | 'camera'>;
  /** User-observable operations exposed by this particular application surface. */
  operations: string[];
  /** Explicit backend dependencies. An empty array means the app is local-only. */
  serviceContracts: AppServiceContract[];
  runtime: AppRuntimeDescriptor;
}

export interface AppRuntimeDescriptor {
  kind: 'seed-js' | 'seed-wasm' | 'system-component';
  apiVersion: 1;
  entryFile: string;
  stateSchema: string;
}

export interface InstalledApp extends AppManifest {
  installedAt: string;
  installPath: string;
  dataPath: string;
  receiptPath: string;
  registryHost: string;
  installState: 'installed' | 'updating';
}

export interface AppServiceContract {
  id: string;
  kind: AppServiceKind;
  host: string;
  protocol: 'http' | 'https' | 'virtual';
  port: number;
  auth: 'none' | 'session' | 'oauth' | 'device';
  required: boolean;
  operations: string[];
}

export interface AppLaunchRequest {
  operation: string;
  payload?: Record<string, unknown>;
}

export interface AppExecutionRecord {
  id: string;
  computerId: string;
  appId: string;
  runtime: AppRuntimeDescriptor['kind'];
  operation: string;
  startedAt: string;
  completedAt: string;
  status: 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

export interface HostExecutionRule {
  id: string;
  enabled: boolean;
  computerIds: string[] | '*';
  appIds: string[];
  executables: string[];
  cwdRoots: string[];
  timeoutMs: number;
  maxOutputBytes: number;
  audit: boolean;
}

export interface HostExecutionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface PackageRecord {
  id: string;
  name: string;
  version: string;
  manager: PackageManagerKind;
  scope: 'system' | 'user' | 'project';
  installPath: string;
  installedAt: string;
  files: string[];
  source: string;
  integrity: string;
  dependencies: string[];
  dependencyType: 'direct' | 'transitive';
}

export interface PackageTransactionRecord {
  id: string;
  manager: PackageManagerKind;
  operation: 'index-refresh' | 'install' | 'remove' | 'upgrade';
  packages: string[];
  startedAt: string;
  completedAt: string;
  status: 'committed' | 'rolled-back';
  receiptPaths: string[];
}

export interface GitCommitRecord {
  hash: string;
  message: string;
  author: string;
  at: string;
  treeDigest: string;
}

export interface GitRepositoryRecord {
  root: string;
  branch: string;
  head?: string;
  branches: Record<string, string | undefined>;
  remotes: Record<string, string>;
  remoteRefs: Record<string, string>;
  staged: string[];
  commits: GitCommitRecord[];
}

export interface CollaborationMessage {
  id: string;
  serviceId: CollaborationServiceId;
  workspaceId: string;
  channelId: string;
  sequence: number;
  author: string;
  computerId: string;
  text: string;
  at: string;
  editedAt?: string;
  threadId?: string;
}

export interface CollaborationChannel {
  id: string;
  name: string;
  displayName: string;
  memberCount: number;
}

export interface CollaborationServiceSnapshot {
  id: CollaborationServiceId;
  productName: 'Slack' | 'Microsoft Teams';
  host: string;
  workspaceId: string;
  workspaceName: string;
  revision: number;
  channels: CollaborationChannel[];
  messages: CollaborationMessage[];
}

export interface CollaborationPollResult {
  serviceId: CollaborationServiceId;
  workspaceId: string;
  channelId: string;
  revision: number;
  messages: CollaborationMessage[];
}

export interface VirtualHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  traceId: string;
}

/**
 * Metadata returned when a virtual HTTP response is promoted to a real browser
 * document. The body is intentionally delivered by `documentUrl`, so Chromium
 * parses the response with its native HTML/JavaScript engine instead of the UI
 * pretending to interpret it.
 */
export interface BrowserNavigationResponse {
  url: string;
  documentUrl: string;
  status: number;
  headers: Record<string, string>;
  traceId: string;
}

export interface TrajectoryEvent {
  sequence: number;
  at: string;
  runId: string;
  computerId?: string;
  displayId?: string;
  actor: 'human' | 'agent' | 'system';
  kind: 'pointer' | 'keyboard' | 'window' | 'process' | 'filesystem' | 'network' | 'app' | 'snapshot';
  action: string;
  target?: string;
  data?: Record<string, unknown>;
  stateHash?: string;
}

export interface ComputerSnapshot {
  spec: ComputerSpec;
  bootedAt: string;
  uptimeMs: number;
  processes: ProcessRecord[];
  sockets: SocketRecord[];
  installedApps: InstalledApp[];
  packages: PackageRecord[];
  packageTransactions: PackageTransactionRecord[];
  repositories: GitRepositoryRecord[];
}

export interface SimulationSnapshot {
  runId: string;
  topology: { id: string; version: string };
  now: string;
  computers: ComputerSnapshot[];
  dns: DnsRecord[];
  packets: PacketTrace[];
  gateways: GatewayRule[];
  appCatalog: AppManifest[];
  collaborationServices: CollaborationServiceSnapshot[];
  appExecutions: AppExecutionRecord[];
  hostExecutionRules: HostExecutionRule[];
  trajectoryLength: number;
}
