'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Archive, ArrowLeft, ArrowUp, Bell, Bot, Boxes, BriefcaseBusiness, CalendarDays,
  Check, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Code2,
  Command, Database, File, FileImage, FileText, Shapes, Folder, GitBranch, Globe2,
  HardDrive, Headphones, HelpCircle, Image as ImageIcon, Info, Library, Link2,
  LockKeyhole, LogOut, Mail, Menu, MessageCircle, Mic, MoreHorizontal, Palette,
  Paperclip, PanelLeftClose, PanelRightClose, PanelRightOpen, Plus, Puzzle,
  RefreshCcw, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Square,
  TerminalSquare, User, UserCog, Users, WandSparkles, X, Zap
} from 'lucide-react';
import { MODEL_CATALOG, PROVIDERS, type ModelSpec, type ProviderId } from '@/lib/catalog';

type Attachment = { id: string; name: string; mime: string; size: number; dataUrl?: string; text?: string };
type Citation = { id: string; label: string; url?: string; source?: string };
type Message = { id: string; role: 'user' | 'assistant'; content: string; createdAt: number; attachments?: Attachment[]; citations?: Citation[]; generatedImage?: string };
type ActivityStatus = 'queued' | 'running' | 'done' | 'error';
type ActivityKind = 'system' | 'model' | 'file' | 'web' | 'skill' | 'connector' | 'agent' | 'artifact';
type Activity = { id: string; messageId: string; kind: ActivityKind; label: string; detail?: string; status: ActivityStatus; createdAt: number; finishedAt?: number; agentId?: string; metadata?: Record<string, unknown> };
type AgentRun = { id: string; name: string; task: string; status: 'queued' | 'running' | 'done'; summary: string; report: string; parentMessageId: string; duration?: string; outputs?: string[] };
type Artifact = { id: string; title: string; kind: 'code' | 'document' | 'image'; content: string; language?: string };
type Thread = { id: string; title: string; projectId?: string; messages: Message[]; activities: Activity[]; agents: AgentRun[]; artifacts: Artifact[]; updatedAt: number; temporary?: boolean; mode?: WorkspaceMode };
type Project = { id: string; name: string; icon: 'code' | 'folder' | 'bot' | 'heart'; threads: string[] };
type SettingsSection = 'general' | 'models' | 'integrations' | 'personalization' | 'voice' | 'usage' | 'data' | 'security' | 'account';
type ToolMode = 'none' | 'image' | 'web';
type Effort = 'light' | 'medium' | 'high' | 'extra-high' | 'max' | 'ultra';
type Speed = 'standard' | 'fast';
type WorkspaceMode = 'chat' | 'work';
type ProviderStatus = { connected: boolean; baseURL?: string; updatedAt: number };
type UsageSummary = {
  plan: { tier: string; eightHourIncludedTokens: number; weeklyIncludedTokens: number; paygEnabled: boolean; paygMicrosPerMillionTokens: number };
  eightHour: { inputTokens: number; outputTokens: number; totalTokens: number; includedTokens: number; remainingTokens: number; percentRemaining: number; resetsAt: number };
  weekly: { inputTokens: number; outputTokens: number; totalTokens: number; includedTokens: number; remainingTokens: number; percentRemaining: number; resetsAt: number };
  payg: { enabled: boolean; billableTokens: number; estimatedMicros: number };
};
type AppSettings = {
  name: string;
  appearance: 'system' | 'light' | 'dark';
  accent: string;
  higherIntelligence: boolean;
  dictation: boolean;
  pinnedModelKeys: string[];
  customModels: ModelSpec[];
  enabledIntegrations: string[];
  providerBaseURLs: Partial<Record<ProviderId, string>>;
  connectorBaseURLs: Partial<Record<string, string>>;
};

const uid = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2);
const modelKey = (m: ModelSpec) => `${m.provider}:${m.id}`;
const now = Date.now();

const integrations = [
  { id: 'figma', name: 'Figma', description: 'Design-to-code workflows', icon: Shapes },
  { id: 'github', name: 'GitHub', description: 'Repositories, issues, pull requests, and actions', icon: GitBranch },
  { id: 'gmail', name: 'Gmail', description: 'Read and manage mail', icon: Mail },
  { id: 'calendar', name: 'Google Calendar', description: 'Events, schedules, and availability', icon: CalendarDays },
  { id: 'drive', name: 'Google Drive', description: 'Search and work with files', icon: HardDrive },
  { id: 'finances', name: 'Finances', description: 'Connected accounts and financial analysis', icon: CircleDollarSign }
];

const skills = [
  { id: 'review', name: 'Review follow-up', integration: 'github', description: 'Inspect review comments and propose focused changes.' },
  { id: 'ci', name: 'CI debug', integration: 'github', description: 'Analyze failed checks, logs, and candidate fixes.' },
  { id: 'publish', name: 'Publish changes', integration: 'github', description: 'Prepare and publish an approved change set.' },
  { id: 'design', name: 'Design implementation', integration: 'figma', description: 'Translate selected frames into production components.' },
  { id: 'mail-triage', name: 'Inbox triage', integration: 'gmail', description: 'Surface high-priority messages and draft actions.' },
  { id: 'meeting', name: 'Meeting preparation', integration: 'calendar', description: 'Assemble context for an upcoming meeting.' }
];

const connectorActions: Record<string, Array<{ name: string; description: string; risk: 'read' | 'write' }>> = {
  github: [
    { name: 'Check repository initialized', description: 'Inspect repository setup and default-branch state.', risk: 'read' },
    { name: 'Compare commits', description: 'Return per-file changes and compare metadata.', risk: 'read' },
    { name: 'Read workflow logs', description: 'Inspect jobs, steps, failures, and artifacts.', risk: 'read' },
    { name: 'Publish changes', description: 'Create commits or pull requests after approval.', risk: 'write' }
  ],
  gmail: [
    { name: 'Search mail', description: 'Search messages with Gmail query operators.', risk: 'read' },
    { name: 'Read thread', description: 'Load a complete conversation and attachments.', risk: 'read' },
    { name: 'Create draft', description: 'Prepare a reviewable draft without sending.', risk: 'write' },
    { name: 'Send mail', description: 'Send an approved message or saved draft.', risk: 'write' }
  ],
  calendar: [
    { name: 'Search events', description: 'Read events and determine availability.', risk: 'read' },
    { name: 'Create event', description: 'Create an event with attendees and reminders.', risk: 'write' },
    { name: 'Update event', description: 'Change time, location, attendees, or recurrence.', risk: 'write' }
  ],
  figma: [
    { name: 'Read selected frames', description: 'Inspect design hierarchy, properties, and assets.', risk: 'read' },
    { name: 'Generate implementation', description: 'Translate selected design layers into components.', risk: 'write' },
    { name: 'Publish canvas update', description: 'Send editable output back to the Figma canvas.', risk: 'write' }
  ],
  drive: [
    { name: 'Search files', description: 'Search connected documents and folders.', risk: 'read' },
    { name: 'Read document', description: 'Load structured document contents and metadata.', risk: 'read' }
  ],
  finances: [
    { name: 'Read account data', description: 'Query linked balances, transactions, and holdings.', risk: 'read' },
    { name: 'Analyze cash flow', description: 'Compute grounded summaries over synchronized data.', risk: 'read' }
  ]
};

const initialSettings: AppSettings = {
  name: 'Jacob',
  appearance: 'system',
  accent: '#7c3aed',
  higherIntelligence: true,
  dictation: true,
  pinnedModelKeys: ['openai:gpt-5.6', 'openai:gpt-5.6-thinking', 'openai:gpt-5.6-pro', 'anthropic:claude-opus-4-8', 'alibaba:qwen3-max'],
  customModels: [],
  enabledIntegrations: ['github', 'figma', 'gmail', 'calendar'],
  providerBaseURLs: { openrouter: 'https://openrouter.ai/api/v1', alibaba: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1' },
  connectorBaseURLs: {}
};

const projectsSeed: Project[] = [
  { id: 'p1', name: 'Transcendence', icon: 'code', threads: [] },
  { id: 'p2', name: 'maria-biz', icon: 'folder', threads: [] },
  { id: 'p3', name: 'Sakura (kawai hardware)', icon: 'bot', threads: [] },
  { id: 'p4', name: 'xboid', icon: 'folder', threads: [] }
];

const seedThread: Thread = {
  id: 'seed',
  mode: 'work',
  title: 'Structural Metalanguage and Algebra',
  projectId: 'p1',
  updatedAt: now - 40000,
  messages: [
    { id: 'u1', role: 'user', content: 'can one program handle conversation, coding, circuit design, and philosophical introspection while keeping its internal work inspectable?', createdAt: now - 60000 },
    { id: 'a1', role: 'assistant', content: 'yes, but only if the runtime separates the **user-visible transcript** from the broader execution graph. messages are one projection; subagent runs, private reports, artifacts, citations, connector calls, approvals, and memory are distinct first-class objects.\n\nthat lets one lead agent synthesize results while completed specialists remain inspectable without dumping their traces into the conversation.', createdAt: now - 50000, citations: [{ id: 'c1', label: 'workspace object model', source: 'internal architecture memo' }] }
  ],
  activities: [
    { id: 'act-seed-1', messageId: 'a1', kind: 'agent', label: 'Ran three specialist subagents', detail: 'Conversation, software-design, and circuit-QC reports were returned to the lead agent.', status: 'done', createdAt: now - 56000, finishedAt: now - 51000 },
    { id: 'act-seed-2', messageId: 'a1', kind: 'artifact', label: 'Compiled implementation artifacts', detail: 'Created a typed workspace object model and architecture memo.', status: 'done', createdAt: now - 53000, finishedAt: now - 50500 },
    { id: 'act-seed-3', messageId: 'a1', kind: 'system', label: 'Synthesized final response', status: 'done', createdAt: now - 51000, finishedAt: now - 50000 }
  ],
  agents: [
    { id: 'ag1', name: 'Conversation solvers', task: 'Test conversational trajectories', status: 'done', summary: 'Validated conversational state handling.', report: 'The conversational evaluator found that visible turns can remain compact while the runtime retains a richer event graph. The main agent received only the distilled result.', parentMessageId: 'u1', duration: '14s', outputs: ['conversation-qc.md'] },
    { id: 'ag2', name: 'Software design solvers', task: 'Inspect full-stack repair behavior', status: 'done', summary: 'Mapped code-edit artifacts and validation gates.', report: 'The software solver produced a patch plan, changed-file manifest, test summary, and final report. None of those internal objects were inserted into the transcript.', parentMessageId: 'u1', duration: '31s', outputs: ['repair-plan.md', 'patch.diff'] },
    { id: 'ag3', name: 'Circuit design QC', task: 'Validate circuit constraints and result binding', status: 'done', summary: 'Found missing environmental constraints.', report: 'The circuit candidate did not pass serious QC until device identity, voltage range, temperature corners, tolerance, dissipation, and source capability were bound into the design report.', parentMessageId: 'u1', duration: '22s', outputs: ['circuit-report.md', 'schematic.svg'] }
  ],
  artifacts: [
    { id: 'ar1', title: 'workspace-object-model.ts', kind: 'code', language: 'typescript', content: `type WorkspaceObject = Message | AgentRun | Artifact | Citation | ConnectorCall;\n\ninterface AgentRun {\n  parentMessageId: string;\n  privateReport: string;\n  distilledResult: string;\n}` },
    { id: 'ar2', title: 'architecture memo', kind: 'document', content: 'The transcript is a user-facing projection over an execution graph. Internal reports remain inspectable but are not injected as visible messages.' }
  ]
};

function providerIcon(provider: ProviderId) {
  if (provider === 'openai') return '◎';
  if (provider === 'anthropic') return 'A';
  if (provider === 'openrouter') return '◈';
  return 'Q';
}

export default function Page() {
  const [threads, setThreads] = useState<Thread[]>([seedThread]);
  const [projects, setProjects] = useState<Project[]>(projectsSeed);
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [activeThreadId, setActiveThreadId] = useState<string>('new');
  const [mode, setMode] = useState<WorkspaceMode>('chat');
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [toolMode, setToolMode] = useState<ToolMode>('none');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>([]);
  const [model, setModel] = useState<ModelSpec>(MODEL_CATALOG[0]);
  const [effort, setEffort] = useState<Effort>('high');
  const [speed, setSpeed] = useState<Speed>('standard');
  const [streaming, setStreaming] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [tuningOpen, setTuningOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const [providerDetail, setProviderDetail] = useState<ProviderId | null>(null);
  const [integrationDetail, setIntegrationDetail] = useState<string | null>(null);
  const [credentialDraft, setCredentialDraft] = useState('');
  const [temporary, setTemporary] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [providerStatuses, setProviderStatuses] = useState<Partial<Record<ProviderId, ProviderStatus>>>({});
  const [integrationStatuses, setIntegrationStatuses] = useState<Record<string, ProviderStatus>>({});
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const [workspaceResponse, providersResponse, integrationsResponse, usageResponse] = await Promise.all([
          fetch('/api/workspace', { cache: 'no-store' }),
          fetch('/api/providers', { cache: 'no-store' }),
          fetch('/api/integrations', { cache: 'no-store' }),
          fetch('/api/usage', { cache: 'no-store' }),
        ]);
        if (!workspaceResponse.ok) throw new Error(await workspaceResponse.text());
        const workspace = await workspaceResponse.json() as { projects: Project[]; threads: Thread[]; settings: AppSettings | null };
        if (cancelled) return;
        setThreads((workspace.threads?.length ? workspace.threads : [seedThread]).map(thread => ({ ...thread, activities: thread.activities || [], agents: thread.agents || [], artifacts: thread.artifacts || [], mode: thread.mode || 'chat' })));
        setProjects(workspace.projects?.length ? workspace.projects : projectsSeed);
        setSettings({ ...initialSettings, ...(workspace.settings || {}), customModels: workspace.settings?.customModels || [] });
        if (providersResponse.ok) setProviderStatuses(await providersResponse.json());
        if (integrationsResponse.ok) setIntegrationStatuses(await integrationsResponse.json());
        if (usageResponse.ok) setUsage(await usageResponse.json());
      } catch (loadError) {
        setError(loadError instanceof Error ? `workspace persistence unavailable: ${loadError.message}` : 'workspace persistence unavailable');
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }
    void hydrate();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      void fetch('/api/workspace', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects, threads, settings }),
      }).then(response => { if (!response.ok) throw new Error('save failed'); }).catch(() => setError('workspace changes could not be saved to the database'));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [hydrated, projects, threads, settings]);
  async function refreshUsage() {
    const response = await fetch('/api/usage', { cache: 'no-store' });
    if (response.ok) setUsage(await response.json());
  }
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [threads, activeThreadId, streaming]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); }
      if (e.key === 'Escape') { setModelMenuOpen(false); setTuningOpen(false); setPlusOpen(false); setAccountOpen(false); setSearchOpen(false); }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let target: EventTarget | null = null;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      target = event.target;
    };
    const onEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      const element = target instanceof Element ? target : null;
      if (startX < 28 && dx > 0) setLeftOpen(true);
      else if (element?.closest('.sidebar') && dx < 0) setLeftOpen(false);
      else if (element?.closest('.inspector') && dx > 0) setRightOpen(false);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchend', onEnd); };
  }, []);

  const activeThread = activeThreadId === 'new' ? null : threads.find(t => t.id === activeThreadId) || null;
  const allModels = useMemo(() => [...MODEL_CATALOG, ...(settings.customModels || [])], [settings.customModels]);
  const pinnedModels = useMemo(() => allModels.filter(m => settings.pinnedModelKeys.includes(modelKey(m))), [allModels, settings.pinnedModelKeys]);
  const visibleThreads = useMemo(() => threads.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase())), [threads, searchQuery]);
  const selectedAgent = activeThread?.agents.find(a => a.id === selectedAgentId) || null;
  const selectedArtifact = activeThread?.artifacts.find(a => a.id === selectedArtifactId) || null;
  const selectedActivity = activeThread?.activities.find(a => a.id === selectedActivityId) || null;
  const activeProject = projects.find(p => p.id === activeThread?.projectId);
  const connectedProvider = Boolean(providerStatuses[model.provider]?.connected);

  function patchThread(id: string, updater: (thread: Thread) => Thread) {
    setThreads(prev => prev.map(t => t.id === id ? updater(t) : t));
  }

  function createNewChat(projectId?: string) {
    setActiveThreadId('new');
    setInput('');
    setAttachments([]);
    setSelectedSkills([]);
    setSelectedConnectors([]);
    setToolMode('none');
    setRightOpen(false);
    if (projectId) {
      const id = uid();
      const thread: Thread = { id, title: 'New chat', projectId, messages: [], activities: [], agents: [], artifacts: [], updatedAt: Date.now(), mode };
      setThreads(prev => [thread, ...prev]);
      setActiveThreadId(id);
    }
    setTimeout(() => composerRef.current?.focus(), 0);
  }

  function createProject() {
    const name = prompt('Project name');
    if (!name?.trim()) return;
    setProjects(prev => [...prev, { id: uid(), name: name.trim(), icon: 'folder', threads: [] }]);
  }

  async function readFiles(fileList: FileList | null) {
    if (!fileList) return;
    const next: Attachment[] = [];
    for (const file of Array.from(fileList)) {
      const item: Attachment = { id: uid(), name: file.name, mime: file.type || 'application/octet-stream', size: file.size };
      if (file.type.startsWith('image/')) item.dataUrl = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); });
      else if (file.size <= 2_000_000 && (/text|json|csv|javascript|typescript|markdown|xml|yaml/.test(file.type) || /\.(txt|md|json|csv|ts|tsx|js|jsx|py|go|rs|yaml|yml|xml|html|css)$/i.test(file.name))) item.text = await file.text();
      next.push(item);
    }
    setAttachments(prev => [...prev, ...next]);
    setPlusOpen(false);
  }

  async function saveProviderCredential(provider: ProviderId) {
    if (!credentialDraft.trim()) return;
    const response = await fetch('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey: credentialDraft.trim(), baseURL: settings.providerBaseURLs[provider] }),
    });
    if (!response.ok) { setError(await response.text()); return; }
    setProviderStatuses(statuses => ({ ...statuses, [provider]: { connected: true, baseURL: settings.providerBaseURLs[provider], updatedAt: Date.now() } }));
    setCredentialDraft('');
    setProviderDetail(null);
  }

  async function disconnectProvider(provider: ProviderId) {
    const response = await fetch(`/api/providers?provider=${encodeURIComponent(provider)}`, { method: 'DELETE' });
    if (!response.ok) { setError(await response.text()); return; }
    setProviderStatuses(statuses => { const next = { ...statuses }; delete next[provider]; return next; });
    setProviderDetail(null);
  }

  async function saveIntegrationCredential(integration: string) {
    if (!credentialDraft.trim()) return;
    const response = await fetch('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration, token: credentialDraft.trim(), baseURL: settings.connectorBaseURLs[integration] }),
    });
    if (!response.ok) { setError(await response.text()); return; }
    setIntegrationStatuses(statuses => ({ ...statuses, [integration]: { connected: true, baseURL: settings.connectorBaseURLs[integration], updatedAt: Date.now() } }));
    setSettings(current => ({ ...current, enabledIntegrations: current.enabledIntegrations.includes(integration) ? current.enabledIntegrations : [...current.enabledIntegrations, integration] }));
    setCredentialDraft('');
  }

  async function disconnectIntegration(integration: string) {
    const response = await fetch(`/api/integrations?integration=${encodeURIComponent(integration)}`, { method: 'DELETE' });
    if (!response.ok) { setError(await response.text()); return; }
    setIntegrationStatuses(statuses => { const next = { ...statuses }; delete next[integration]; return next; });
    setSettings(current => ({ ...current, enabledIntegrations: current.enabledIntegrations.filter(id => id !== integration) }));
  }

  function upsertActivity(threadId: string, messageId: string, activity: Omit<Activity, 'messageId'>) {
    patchThread(threadId, thread => {
      const activities = thread.activities || [];
      const next: Activity = { ...activity, messageId };
      const exists = activities.some(item => item.id === next.id);
      return { ...thread, activities: exists ? activities.map(item => item.id === next.id ? { ...item, ...next } : item) : [...activities, next], updatedAt: Date.now() };
    });
  }

  function upsertAgent(threadId: string, agent: AgentRun) {
    patchThread(threadId, thread => {
      const exists = thread.agents.some(item => item.id === agent.id);
      return { ...thread, agents: exists ? thread.agents.map(item => item.id === agent.id ? { ...item, ...agent } : item) : [...thread.agents, agent], updatedAt: Date.now() };
    });
  }

  async function send() {
    const prompt = input.trim();
    if (!prompt || streaming) return;
    setError(null);
    const threadId = activeThread?.id || uid();
    const userMessage: Message = { id: uid(), role: 'user', content: prompt, createdAt: Date.now(), attachments: attachments.length ? attachments : undefined };
    const assistantId = uid();
    const baseThread: Thread = activeThread || { id: threadId, title: prompt.slice(0, 52), messages: [], activities: [], agents: [], artifacts: [], updatedAt: Date.now(), temporary, mode };
    const nextThread: Thread = {
      ...baseThread,
      activities: baseThread.activities || [],
      title: baseThread.messages.length ? baseThread.title : prompt.slice(0, 52),
      messages: [...baseThread.messages, userMessage, { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() }],
      updatedAt: Date.now()
    };
    if (activeThread) setThreads(prev => prev.map(t => t.id === threadId ? nextThread : t));
    else { setThreads(prev => [nextThread, ...prev]); setActiveThreadId(threadId); }
    setInput('');
    setAttachments([]);
    setStreaming(true);

    try {
      const history = [...baseThread.messages, userMessage].map(m => ({ role: m.role, content: m.content, attachments: m.attachments }));
      if (toolMode === 'image') {
        const actionId = uid();
        upsertActivity(threadId, assistantId, { id: actionId, kind: 'artifact', label: 'Generating image', detail: 'Calling the configured OpenAI image endpoint.', status: 'running', createdAt: Date.now() });
        const imageResponse = await fetch('/api/image', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt })
        });
        if (!imageResponse.ok) throw new Error(await imageResponse.text());
        const imageData = await imageResponse.json() as { image: string };
        patchThread(threadId, t => ({ ...t, messages: t.messages.map(m => m.id === assistantId ? { ...m, content: 'generated image', generatedImage: imageData.image } : m), updatedAt: Date.now() }));
        upsertActivity(threadId, assistantId, { id: actionId, kind: 'artifact', label: 'Generated image', detail: 'The image result was attached to this response.', status: 'done', createdAt: Date.now(), finishedAt: Date.now() });
        return;
      }

      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: model.provider, model: model.id, baseURL: settings.providerBaseURLs[model.provider], effort, speed, mode, toolMode, skills: selectedSkills, connectors: selectedConnectors, messages: history })
      });
      if (!res.ok || !res.body) throw new Error(await res.text());

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as any;
          if (event.type === 'delta') {
            content += event.text || '';
            patchThread(threadId, t => ({ ...t, messages: t.messages.map(m => m.id === assistantId ? { ...m, content } : m), updatedAt: Date.now() }));
          } else if (event.type === 'action') {
            upsertActivity(threadId, assistantId, { ...event.action, createdAt: event.action.createdAt || Date.now() });
          } else if (event.type === 'agent') {
            const agent = { ...event.agent, parentMessageId: userMessage.id } as AgentRun;
            upsertAgent(threadId, agent);
            upsertActivity(threadId, assistantId, {
              id: `activity:${agent.id}`,
              kind: 'agent',
              label: `${agent.status === 'done' ? 'Completed' : agent.status === 'running' ? 'Running' : 'Queued'} ${agent.name}`,
              detail: agent.status === 'done' ? agent.summary : agent.task,
              status: agent.status,
              createdAt: Date.now(),
              finishedAt: agent.status === 'done' ? Date.now() : undefined,
              agentId: agent.id
            });
            if (agent.status === 'running') { setRightOpen(true); setSelectedAgentId(agent.id); }
          } else if (event.type === 'artifact') {
            patchThread(threadId, t => ({ ...t, artifacts: t.artifacts.some(a => a.id === event.artifact.id) ? t.artifacts : [...t.artifacts, event.artifact], updatedAt: Date.now() }));
          } else if (event.type === 'citations') {
            patchThread(threadId, t => ({ ...t, messages: t.messages.map(m => m.id === assistantId ? { ...m, citations: event.citations } : m), updatedAt: Date.now() }));
          } else if (event.type === 'usage') {
            void refreshUsage();
          } else if (event.type === 'error') {
            throw new Error(event.message || 'Provider request failed');
          }
        }
        if (done) break;
      }
      if (buffer.trim()) {
        const event = JSON.parse(buffer) as any;
        if (event.type === 'delta') {
          content += event.text || '';
          patchThread(threadId, t => ({ ...t, messages: t.messages.map(m => m.id === assistantId ? { ...m, content } : m), updatedAt: Date.now() }));
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Request failed';
      setError(message);
      patchThread(threadId, t => ({ ...t, messages: t.messages.map(m => m.id === assistantId ? { ...m, content: `request failed: ${message}` } : m) }));
      upsertActivity(threadId, assistantId, { id: `error:${assistantId}`, kind: 'system', label: 'Request failed', detail: message, status: 'error', createdAt: Date.now(), finishedAt: Date.now() });
    } finally { setStreaming(false); void refreshUsage(); }
  }

  function onComposerKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
  }

  function chooseModel(m: ModelSpec) { setModel(m); setModelMenuOpen(false); }
  function togglePin(m: ModelSpec) {
    const key = modelKey(m);
    setSettings(s => ({ ...s, pinnedModelKeys: s.pinnedModelKeys.includes(key) ? s.pinnedModelKeys.filter(k => k !== key) : [...s.pinnedModelKeys, key] }));
  }
  function toggleIntegration(id: string) {
    setSettings(s => ({ ...s, enabledIntegrations: s.enabledIntegrations.includes(id) ? s.enabledIntegrations.filter(x => x !== id) : [...s.enabledIntegrations, id] }));
  }

  function addCustomModel(provider: ProviderId) {
    const id = prompt('Provider model ID');
    if (!id?.trim()) return;
    const label = prompt('Display name', id.trim()) || id.trim();
    const mode = (prompt('Picker group: instant, thinking, or pro', 'thinking') || 'thinking').toLowerCase();
    const normalizedMode: ModelSpec['mode'] = mode === 'instant' || mode === 'pro' ? mode : 'thinking';
    const custom: ModelSpec = { id: id.trim(), provider, label: label.trim(), family: label.trim(), mode: normalizedMode, description: 'Custom provider model', capabilities: ['text', 'vision', 'files', 'tools'] };
    setSettings(current => ({ ...current, customModels: [...(current.customModels || []).filter(item => modelKey(item) !== modelKey(custom)), custom], pinnedModelKeys: current.pinnedModelKeys.includes(modelKey(custom)) ? current.pinnedModelKeys : [...current.pinnedModelKeys, modelKey(custom)] }));
  }

  const contextSkills = useMemo(() => {
    const text = input.toLowerCase();
    const keywordScore: Record<string, string[]> = {
      github: ['code', 'repo', 'bug', 'github', 'pull request', 'pr', 'ci', 'test', 'commit'],
      figma: ['figma', 'design', 'frame', 'component', 'ui', 'ux'],
      gmail: ['email', 'mail', 'inbox', 'reply', 'draft'],
      calendar: ['calendar', 'meeting', 'schedule', 'availability', 'event']
    };
    return skills
      .filter(skill => settings.enabledIntegrations.includes(skill.integration))
      .sort((a, b) => {
        const score = (skill: typeof skills[number]) => (keywordScore[skill.integration] || []).reduce((sum, keyword) => sum + (text.includes(keyword) ? 1 : 0), 0);
        return score(b) - score(a);
      });
  }, [input, settings.enabledIntegrations]);
  const modelLabel = model.label.replace(' Instant', '').replace(' Thinking', '').replace(' Pro', '');
  const indexedTopics = useMemo(() => {
    const words = threads.flatMap(thread => [thread.title, ...thread.messages.filter(message => message.role === 'user').slice(-2).map(message => message.content)])
      .join(' ').toLowerCase().match(/[a-z][a-z0-9-]{4,}/g) || [];
    const stop = new Set(['about','there','their','would','could','should','which','where','these','those','please','make','what','with','have','this','that','from','your']);
    const counts = new Map<string, number>();
    for (const word of words) if (!stop.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
    return [...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0,4).map(([word]) => word);
  }, [threads]);
  const chatSuggestions = [
    indexedTopics[0] ? `continue our conversation about ${indexedTopics[0]}` : 'help me think through something',
    indexedTopics[1] ? `explain something related to ${indexedTopics[1]}` : 'explain a difficult idea simply',
    'help me write or revise something',
  ];
  const workSuggestions = [
    activeProject ? `review the current state of ${activeProject.name}` : 'build a production implementation plan',
    'research a decision and cite the evidence',
    'analyze files and produce implementation artifacts',
  ];
  function switchMode(next: WorkspaceMode) {
    setMode(next);
    setModelMenuOpen(false);
    setTuningOpen(false);
    if (next === 'chat') { setRightOpen(false); setSelectedActivityId(null); setSelectedAgentId(null); setSelectedArtifactId(null); }
  }

  return (
    <div className={`app ${settings.appearance} mode-${mode}`} style={{ '--accent': settings.accent } as React.CSSProperties}>
      <input ref={fileRef} hidden multiple type="file" onChange={e => void readFiles(e.target.files)} />

      <aside className={`sidebar ${leftOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-top">
          <button className="brand" onClick={() => createNewChat()}>ChatGPT</button>
          <div className="sidebar-actions">
            <button className="icon-btn" onClick={() => setSearchOpen(true)} title="Search"><Search /></button>
            <button className="icon-btn" onClick={() => setLeftOpen(false)} title="Close sidebar"><PanelLeftClose /></button>
          </div>
        </div>
        <button className="primary-nav active" onClick={() => createNewChat()}><MessageCircle /> <span>New chat</span></button>
        <button className="primary-nav"><Library /> <span>Library</span></button>
        {mode === 'work' && <>
          <button className="primary-nav"><Clock3 /> <span>Scheduled</span></button>
          <button className="primary-nav" onClick={() => { setSettingsOpen(true); setSettingsSection('integrations'); }}><Puzzle /> <span>Plugins</span></button>
        </>}

        <div className="sidebar-scroll">
          {mode === 'work' && <>
            <div className="sidebar-section"><div className="section-label">Pinned</div>
              <button className="tree-row"><span className="heart">♡</span><span>Feelings</span></button>
              <button className="tree-row"><TerminalSquare /><span>commandAGI</span></button>
              <button className={`nested-row ${activeThreadId === 'seed' ? 'active' : ''}`} onClick={() => setActiveThreadId('seed')}>Structural Metalanguage and Algebra</button>
            </div>
            <div className="sidebar-section"><div className="section-heading"><span>Projects</span><button onClick={createProject}><Plus /></button></div>
              {projects.map(project => <button className="tree-row" key={project.id} onClick={() => createNewChat(project.id)}>
                {project.icon === 'code' ? <Code2 /> : project.icon === 'bot' ? <Bot /> : <Folder />}<span>{project.name}</span>
              </button>)}
            </div>
          </>}
          <div className="sidebar-section"><div className="section-label">{mode === 'chat' ? 'Recent' : 'Chats'}</div>
            {visibleThreads.filter(thread => (thread.mode || 'chat') === mode).slice(0, 24).map(thread => <button key={thread.id} className={`chat-row ${thread.id === activeThreadId ? 'active' : ''}`} onClick={() => { setActiveThreadId(thread.id); setMode(thread.mode || 'chat'); }}>{thread.title}</button>)}
          </div>
        </div>
        <div className="account-anchor">
          <button className="account-row" onClick={() => setAccountOpen(v => !v)}><div className="avatar">J</div><div><strong>{settings.name}</strong><small>{mode === 'work' ? 'Workspace account' : 'Personal account'}</small></div><BriefcaseBusiness /></button>
          {accountOpen && <AccountMenu name={settings.name} onSettings={() => { setSettingsOpen(true); setSettingsSection('general'); setAccountOpen(false); }} />}
        </div>
      </aside>

      {!leftOpen && <button className="reopen-left" onClick={() => setLeftOpen(true)}><Menu /></button>}

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            {mode === 'work' ? <>
              <div className="model-anchor">
                <button className="top-model" onClick={() => setModelMenuOpen(v => !v)}>{modelLabel}<ChevronDown /></button>
                {modelMenuOpen && <ModelMenu models={pinnedModels.length ? pinnedModels : allModels} selected={model} onChoose={chooseModel} onConfigure={() => { setSettingsOpen(true); setSettingsSection('models'); setModelMenuOpen(false); }} />}
              </div>
              {activeProject && <><span className="slash">/</span><span className="context-title">{activeProject.name}</span></>}
            </> : <span className="chat-mode-title">ChatGPT</span>}
          </div>
          <div className="mode-tabs"><button className={mode === 'chat' ? 'active' : ''} onClick={() => switchMode('chat')}>Chat</button><button className={mode === 'work' ? 'active' : ''} onClick={() => switchMode('work')}>Work</button></div>
          <div className="topbar-right">
            {mode === 'work' && <button className={`temporary ${temporary ? 'active' : ''}`} onClick={() => setTemporary(v => !v)}><Archive /> Temporary</button>}
            {activeThread && (activeThread.activities.length > 0 || activeThread.agents.length > 0 || activeThread.artifacts.length > 0) && <button className="icon-btn" onClick={() => setRightOpen(v => !v)}>{rightOpen ? <PanelRightClose /> : <PanelRightOpen />}</button>}
          </div>
        </header>

        <section className="conversation">
          {!activeThread || activeThread.messages.length === 0 ? (
            <div className="new-chat-state">
              <div className="mode-kicker">{mode === 'work' ? 'Agent workspace' : 'Conversation'}</div>
              <h1>{mode === 'work' ? 'What should we accomplish?' : `How can I help, ${settings.name}?`}</h1>
              <Composer />
              <div className={`suggestions suggestions-${mode}`}>
                {(mode === 'work' ? workSuggestions : chatSuggestions).map((suggestion, index) => <button key={suggestion} onClick={() => setInput(suggestion)}>{index === 0 ? <WandSparkles /> : index === 1 ? <Globe2 /> : <Paperclip />}<span>{suggestion}</span></button>)}
              </div>
            </div>
          ) : (
            <>
              <div className="message-column">
                {activeThread.messages.map(message => <article key={message.id} className={`message ${message.role}`}>
                  {message.role === 'user' ? <div className="user-bubble">
                    <div>{message.content}</div>
                    {message.attachments?.length ? <AttachmentStrip attachments={message.attachments} /> : null}
                  </div> : <div className="assistant-message">
                    <ActivityStream activities={(activeThread.activities || []).filter(activity => activity.messageId === message.id)} onOpen={activity => { setSelectedActivityId(activity.id); setSelectedAgentId(null); setSelectedArtifactId(null); setRightOpen(true); }} />
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || (streaming ? '▍' : '')}</ReactMarkdown>
                    {message.generatedImage && <img className="generated-image" src={message.generatedImage} alt="Generated" />}
                    {message.citations?.length ? <div className="citation-row">{message.citations.map(c => <button key={c.id} onClick={() => { setRightOpen(true); setSelectedActivityId(null); setSelectedArtifactId(null); }}><Link2 />{c.label}</button>)}</div> : null}
                    <div className="message-actions"><button title="Copy" onClick={() => navigator.clipboard.writeText(message.content)}><FileText /></button><button><RefreshCcw /></button><button><MoreHorizontal /></button></div>
                  </div>}
                </article>)}
                {error && <div className="error-banner">{error}</div>}
                <div ref={bottomRef} />
              </div>
              <div className="bottom-composer"><Composer /><div className="disclaimer">AI can make mistakes. Check important information.</div></div>
            </>
          )}
        </section>
      </main>

      {rightOpen && activeThread && <aside className="inspector">
        <div className="inspector-header"><strong>{selectedActivity ? 'Activity details' : selectedAgent ? 'Subagent report' : selectedArtifact ? 'Artifact' : 'Workspace details'}</strong><button className="icon-btn" onClick={() => setRightOpen(false)}><X /></button></div>
        {selectedActivity ? <ActivityDetail activity={selectedActivity} agent={selectedActivity.agentId ? activeThread.agents.find(agent => agent.id === selectedActivity.agentId) : undefined} onBack={() => setSelectedActivityId(null)} onOpenAgent={agentId => { setSelectedActivityId(null); setSelectedAgentId(agentId); }} /> : selectedAgent ? <AgentReport agent={selectedAgent} onBack={() => setSelectedAgentId(null)} /> : selectedArtifact ? <ArtifactView artifact={selectedArtifact} onBack={() => setSelectedArtifactId(null)} /> : <div className="inspector-list">
          {activeThread.activities.length > 0 && <><div className="inspector-group-title">Activity</div>{activeThread.activities.slice(-12).reverse().map(activity => <button className="detail-row" key={activity.id} onClick={() => setSelectedActivityId(activity.id)}><ActivityGlyph activity={activity}/><span>{activity.label}</span><ChevronRight/></button>)}</>}
          {mode === 'work' && <><div className="inspector-group-title">Active agents</div>
          {activeThread.agents.filter(a => a.status !== 'done').map(agent => <AgentRow key={agent.id} agent={agent} onClick={() => setSelectedAgentId(agent.id)} />)}
          <div className="inspector-group-title">Completed agents · {activeThread.agents.filter(a => a.status === 'done').length}</div>
          {activeThread.agents.filter(a => a.status === 'done').map(agent => <AgentRow key={agent.id} agent={agent} onClick={() => setSelectedAgentId(agent.id)} />)}
          <div className="inspector-group-title">Artifacts</div>
          {activeThread.artifacts.map(artifact => <button className="artifact-row" key={artifact.id} onClick={() => setSelectedArtifactId(artifact.id)}><FileText /><span>{artifact.title}</span><ChevronRight /></button>)}</>}
        </div>}
      </aside>}

      {settingsOpen && <SettingsModal section={settingsSection} setSection={setSettingsSection} settings={settings} setSettings={setSettings} onClose={() => { setSettingsOpen(false); setProviderDetail(null); setIntegrationDetail(null); }} providerDetail={providerDetail} setProviderDetail={setProviderDetail} integrationDetail={integrationDetail} setIntegrationDetail={setIntegrationDetail} credentialDraft={credentialDraft} setCredentialDraft={setCredentialDraft} saveProviderCredential={saveProviderCredential} disconnectProvider={disconnectProvider} togglePin={togglePin} toggleIntegration={toggleIntegration} addCustomModel={addCustomModel} allModels={allModels} providerStatuses={providerStatuses} integrationStatuses={integrationStatuses} saveIntegrationCredential={saveIntegrationCredential} disconnectIntegration={disconnectIntegration} usage={usage} />}
      {searchOpen && <SearchOverlay query={searchQuery} setQuery={setSearchQuery} threads={visibleThreads} onClose={() => setSearchOpen(false)} onChoose={id => { setActiveThreadId(id); setSearchOpen(false); }} />}
    </div>
  );

  function Composer() {
    return <div className="composer-shell">
      {attachments.length > 0 && <AttachmentStrip attachments={attachments} removable onRemove={id => setAttachments(a => a.filter(x => x.id !== id))} />}
      {(toolMode !== 'none' || selectedSkills.length > 0 || selectedConnectors.length > 0) && <div className="active-tools">
        {toolMode === 'web' && <button onClick={() => setToolMode('none')}><Globe2 /> Web search <X /></button>}
        {toolMode === 'image' && <button onClick={() => setToolMode('none')}><ImageIcon /> Create image <X /></button>}
        {selectedConnectors.map(id => { const connector = integrations.find(item => item.id === id)!; const Icon = connector.icon; return <button key={id} onClick={() => setSelectedConnectors(items => items.filter(item => item !== id))}><Icon />{connector.name}<X /></button>; })}
        {selectedSkills.map(id => { const skill = skills.find(s => s.id === id)!; return <button key={id} onClick={() => setSelectedSkills(s => s.filter(x => x !== id))}><Sparkles />{skill.name}<X /></button>; })}
      </div>}
      <textarea ref={composerRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onComposerKey} rows={activeThread ? 2 : 3} placeholder={mode === 'work' ? 'Describe a task, deliverables, and constraints' : 'Message ChatGPT'} />
      <div className="composer-footer">
        <div className="composer-left">
          <div className="plus-anchor"><button className="round-button" onClick={() => setPlusOpen(v => !v)}><Plus /></button>{plusOpen && <PlusMenu onUpload={() => fileRef.current?.click()} setToolMode={setToolMode} integrations={integrations.filter(i => settings.enabledIntegrations.includes(i.id))} skills={contextSkills} selectedSkills={selectedSkills} selectedConnectors={selectedConnectors} toggleConnector={id => setSelectedConnectors(items => items.includes(id) ? items.filter(item => item !== id) : [...items, id])} toggleSkill={id => setSelectedSkills(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])} />}</div>
          {mode === 'work' && <div className="tuning-anchor"><button className="composer-model" onClick={() => setTuningOpen(v => !v)}>{modelLabel} <span>{effort === 'extra-high' ? 'Extra High' : effort[0].toUpperCase() + effort.slice(1)}</span><ChevronDown /></button>{tuningOpen && <TuningMenu model={model} effort={effort} speed={speed} setEffort={setEffort} setSpeed={setSpeed} onModel={() => { setTuningOpen(false); setModelMenuOpen(true); }} />}</div>}
        </div>
        <div className="composer-right">{settings.dictation && <button className="round-button"><Mic /></button>}<button className="voice-button"><Headphones /></button><button className="send-button" disabled={!input.trim() || streaming} onClick={() => void send()}>{streaming ? <Square /> : <ArrowUp />}</button></div>
      </div>
    </div>;
  }
}


function ActivityGlyph({ activity }: { activity: Activity }) {
  if (activity.status === 'running') return <RefreshCcw className="spinning" />;
  if (activity.status === 'error') return <X />;
  if (activity.status === 'done') return <Check />;
  if (activity.kind === 'web') return <Globe2 />;
  if (activity.kind === 'file') return <FileText />;
  if (activity.kind === 'skill') return <Sparkles />;
  if (activity.kind === 'connector') return <Puzzle />;
  if (activity.kind === 'agent') return <Users />;
  if (activity.kind === 'artifact') return <Boxes />;
  return <Clock3 />;
}

function ActivityStream({ activities, onOpen }: { activities: Activity[]; onOpen: (activity: Activity) => void }) {
  if (!activities.length) return null;
  return <div className="activity-stream" aria-label="Response actions">
    {activities.map(activity => <button key={activity.id} className={`activity-item ${activity.status}`} onClick={() => onOpen(activity)}>
      <span className="activity-icon"><ActivityGlyph activity={activity} /></span>
      <span className="activity-copy">{activity.label}</span>
      <ChevronRight />
    </button>)}
  </div>;
}

function ActivityDetail({ activity, agent, onBack, onOpenAgent }: { activity: Activity; agent?: AgentRun; onBack: () => void; onOpenAgent: (id: string) => void }) {
  const elapsed = activity.finishedAt ? Math.max(0, activity.finishedAt - activity.createdAt) : Math.max(0, Date.now() - activity.createdAt);
  return <div className="agent-report"><div className="report-title"><button onClick={onBack}><ArrowLeft /></button><ActivityGlyph activity={activity}/><strong>{activity.label}</strong></div><div className="report-body activity-detail-body">
    <div className="detail-status"><span>{activity.status}</span><span>{activity.kind}</span><span>{elapsed < 1000 ? `${elapsed}ms` : `${Math.round(elapsed/1000)}s`}</span></div>
    {activity.detail ? <><h3>Details</h3><p>{activity.detail}</p></> : <p className="muted-text">No additional payload was recorded for this event.</p>}
    <h3>Event metadata</h3>
    <dl className="event-metadata"><div><dt>Started</dt><dd>{new Date(activity.createdAt).toLocaleString()}</dd></div>{activity.finishedAt && <div><dt>Finished</dt><dd>{new Date(activity.finishedAt).toLocaleString()}</dd></div>}<div><dt>Event ID</dt><dd>{activity.id}</dd></div></dl>
    {agent && <button className="linked-object" onClick={() => onOpenAgent(agent.id)}><Users/><div><strong>{agent.name}</strong><small>Open the linked private report</small></div><ChevronRight/></button>}
  </div></div>;
}

function AttachmentStrip({ attachments, removable, onRemove }: { attachments: Attachment[]; removable?: boolean; onRemove?: (id: string) => void }) {
  return <div className="attachment-strip">{attachments.map(a => <div className="attachment-chip" key={a.id}>{a.dataUrl ? <img src={a.dataUrl} alt="" /> : a.mime.includes('pdf') ? <FileText /> : <File />}<div><strong>{a.name}</strong><small>{Math.max(1, Math.round(a.size / 1024))} KB</small></div>{removable && <button onClick={() => onRemove?.(a.id)}><X /></button>}</div>)}</div>;
}

function ModelMenu({ models, selected, onChoose, onConfigure }: { models: ModelSpec[]; selected: ModelSpec; onChoose: (m: ModelSpec) => void; onConfigure: () => void }) {
  const groups: Array<[string, ModelSpec['mode'], string]> = [['Instant', 'instant', 'Answers right away'], ['Thinking', 'thinking', 'Thinks longer for better answers'], ['Pro', 'pro', 'Research-grade intelligence']];
  return <div className="model-menu popover">{groups.map(([title, mode, desc]) => {
    const rows = models.filter(m => m.mode === mode); if (!rows.length) return null;
    return <div className="model-group" key={mode}><div className="model-group-label"><strong>{title}</strong><span>{desc}</span></div>{rows.map(m => <button key={modelKey(m)} className={modelKey(m) === modelKey(selected) ? 'selected' : ''} onClick={() => onChoose(m)}><div className="provider-mark">{providerIcon(m.provider)}</div><div><strong>{m.label}</strong><small>{m.description}</small></div>{modelKey(m) === modelKey(selected) && <Check />}</button>)}</div>})}<div className="popover-divider"/><button className="configure-row" onClick={onConfigure}><Settings /><span>Configure models</span><ChevronRight /></button></div>;
}

function TuningMenu({ model, effort, speed, setEffort, setSpeed, onModel }: { model: ModelSpec; effort: Effort; speed: Speed; setEffort: (e: Effort) => void; setSpeed: (s: Speed) => void; onModel: () => void }) {
  const [effortOpen, setEffortOpen] = useState(false);
  return <div className="tuning-menu popover"><button onClick={onModel}><span>Model</span><strong>{model.label}</strong><ChevronRight /></button><button onClick={() => setEffortOpen(v => !v)}><span>Effort</span><strong>{effort === 'extra-high' ? 'Extra High' : effort[0].toUpperCase() + effort.slice(1)}</strong><ChevronRight /></button>{effortOpen && <div className="effort-submenu popover">{(['light','medium','high','extra-high','max','ultra'] as Effort[]).map(e => <button key={e} onClick={() => { setEffort(e); setEffortOpen(false); }}><span>{e === 'extra-high' ? 'Extra High' : e[0].toUpperCase()+e.slice(1)}</span>{e === effort && <Check />}{e === 'ultra' && <small>Consumes usage limits faster</small>}</button>)}</div>}<button onClick={() => setSpeed(speed === 'standard' ? 'fast' : 'standard')}><span>Speed</span><strong>{speed[0].toUpperCase()+speed.slice(1)}</strong><ChevronRight /></button><div className="popover-divider"/><button className="muted"><span>Reset to default</span><RefreshCcw /></button></div>;
}

function PlusMenu({ onUpload, setToolMode, integrations: integrationItems, skills: skillItems, selectedSkills, selectedConnectors, toggleConnector, toggleSkill }: { onUpload: () => void; setToolMode: (m: ToolMode) => void; integrations: Array<(typeof integrations)[number]>; skills: Array<(typeof skills)[number]>; selectedSkills: string[]; selectedConnectors: string[]; toggleConnector: (id: string) => void; toggleSkill: (id: string) => void }) {
  return <div className="plus-menu popover"><button onClick={onUpload}><Paperclip /><div><strong>Add photos & files</strong><small>Upload from computer</small></div></button><button onClick={() => setToolMode('image')}><ImageIcon /><div><strong>Create image</strong><small>Visualize anything</small></div></button><button onClick={() => setToolMode('web')}><Globe2 /><div><strong>Web search</strong><small>Find real-time news and info</small></div></button>{integrationItems.map(item => { const Icon = item.icon; const selected = selectedConnectors.includes(item.id); return <button key={item.id} className={selected ? 'selected' : ''} onClick={() => toggleConnector(item.id)}><Icon /><div><strong>{item.name}</strong><small>{item.description}</small></div>{selected && <Check />}</button>})}<div className="popover-divider"/><div className="mini-label">Context-relevant skills</div>{skillItems.slice(0, 5).map(skill => <button key={skill.id} className={selectedSkills.includes(skill.id) ? 'selected' : ''} onClick={() => toggleSkill(skill.id)}><Sparkles /><div><strong>{skill.name}</strong><small>{skill.description}</small></div>{selectedSkills.includes(skill.id) && <Check />}</button>)}<div className="plugin-search">Type to search plugins, files, folders & skills</div></div>;
}

function AccountMenu({ name, onSettings }: { name: string; onSettings: () => void }) {
  return <div className="account-menu popover"><button className="profile-head"><div className="avatar">J</div><div><strong>{name}</strong><small>Personal account</small></div><ChevronRight /></button><div className="popover-divider"/><button><Palette /><span>Personalization</span></button><button><User /><span>Profile</span></button><button className="selected" onClick={onSettings}><Settings /><span>Settings</span></button><div className="popover-divider"/><button><HelpCircle /><span>Help</span><ChevronRight /></button><button><LogOut /><span>Log out</span></button></div>;
}

function AgentRow({ agent, onClick }: { agent: AgentRun; onClick: () => void }) {
  return <button className="agent-row" onClick={onClick}><div className={`agent-glyph ${agent.status}`}>{agent.status === 'done' ? <Sparkles /> : <RefreshCcw />}</div><div><strong>{agent.name}</strong><small>{agent.status === 'done' ? 'Finished' : agent.status === 'running' ? 'Working' : 'Queued'}</small></div><ChevronRight /></button>;
}

function AgentReport({ agent, onBack }: { agent: AgentRun; onBack: () => void }) {
  return <div className="agent-report"><div className="report-title"><button onClick={onBack}><ArrowLeft /></button><div className="agent-glyph done"><Sparkles /></div><strong>{agent.name}</strong></div><div className="report-body"><p className="report-lead">{agent.summary}</p><div className="report-meta"><span>{agent.status}</span>{agent.duration && <span>{agent.duration}</span>}</div><h3>End-of-work report</h3><ReactMarkdown remarkPlugins={[remarkGfm]}>{agent.report}</ReactMarkdown>{agent.outputs?.length ? <><h3>Outputs</h3>{agent.outputs.map(o => <button className="output-row" key={o}><FileText />{o}<ChevronRight /></button>)}</> : null}<div className="private-callout"><LockKeyhole />This internal report was linked to the parent turn and distilled into the main agent context. It was not inserted into the user-facing transcript.</div></div></div>;
}

function ArtifactView({ artifact, onBack }: { artifact: Artifact; onBack: () => void }) {
  return <div className="agent-report"><div className="report-title"><button onClick={onBack}><ArrowLeft /></button><FileText /><strong>{artifact.title}</strong></div><div className="artifact-content">{artifact.kind === 'code' ? <pre><code>{artifact.content}</code></pre> : <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content}</ReactMarkdown>}</div></div>;
}

function SettingsModal(props: {
  section: SettingsSection; setSection: (s: SettingsSection) => void; settings: AppSettings; setSettings: React.Dispatch<React.SetStateAction<AppSettings>>; onClose: () => void;
  providerDetail: ProviderId | null; setProviderDetail: (p: ProviderId | null) => void; integrationDetail: string | null; setIntegrationDetail: (id: string | null) => void;
  credentialDraft: string; setCredentialDraft: (s: string) => void; saveProviderCredential: (p: ProviderId) => void | Promise<void>; disconnectProvider: (p: ProviderId) => void | Promise<void>; togglePin: (m: ModelSpec) => void; toggleIntegration: (id: string) => void; addCustomModel: (p: ProviderId) => void; allModels: ModelSpec[];
  providerStatuses: Partial<Record<ProviderId, ProviderStatus>>; integrationStatuses: Record<string, ProviderStatus>; saveIntegrationCredential: (id: string) => void | Promise<void>; disconnectIntegration: (id: string) => void | Promise<void>; usage: UsageSummary | null;
}) {
  const nav: Array<[SettingsSection, string, React.ComponentType<any>]> = [['general','General',Settings],['models','Models & providers',SlidersHorizontal],['integrations','Plugins',Puzzle],['personalization','Personalization',UserCog],['voice','Voice',Mic],['usage','Usage',Database],['data','Data controls',HardDrive],['security','Security and login',ShieldCheck],['account','Account',User]];
  return <div className="modal-backdrop"><div className="settings-modal"><aside className="settings-nav"><button className="settings-close" onClick={props.onClose}><X /></button>{nav.map(([id,label,Icon]) => <button key={id} className={props.section === id ? 'active' : ''} onClick={() => { props.setSection(id); props.setProviderDetail(null); props.setIntegrationDetail(null); }}><Icon />{label}</button>)}</aside><section className="settings-content">{props.providerDetail ? <ProviderDetail {...props} provider={props.providerDetail} /> : props.integrationDetail ? <IntegrationDetail {...props} integrationId={props.integrationDetail} /> : <SettingsContent {...props} />}</section></div></div>;
}

const ACCENTS = ['#111111','#2563eb','#7c3aed','#db2777','#dc2626','#ea580c','#16a34a','#0891b2'];

function SettingsContent(props: any) {
  const { section, settings, setSettings, setProviderDetail, setIntegrationDetail, togglePin, allModels, providerStatuses, usage } = props;
  if (section === 'models') return <><h1>Models & providers</h1><p className="settings-subtitle">Credentials remain encrypted on the server. Pin only the models you want in Work mode.</p><div className="settings-card"><div className="settings-card-heading"><h2>Providers</h2><span>{Object.values(providerStatuses).filter((status:any) => status?.connected).length} connected</span></div>{PROVIDERS.map(p => <button className="settings-row provider-row" key={p.id} onClick={() => setProviderDetail(p.id)}><div className="provider-logo">{providerIcon(p.id)}</div><div><strong>{p.name}</strong><small>{providerStatuses[p.id]?.connected ? 'Connected · encrypted server credential' : 'Not connected'}</small></div><span className={`connection-pill ${providerStatuses[p.id]?.connected ? 'on' : ''}`}>{providerStatuses[p.id]?.connected ? 'Connected' : 'Connect'}</span><ChevronRight /></button>)}</div><div className="settings-card"><div className="settings-card-heading"><h2>Pinned models</h2><span>{settings.pinnedModelKeys.length} in picker</span></div>{allModels.map((m: ModelSpec) => { const pinned=settings.pinnedModelKeys.includes(modelKey(m)); return <div className="settings-row model-settings-row" key={modelKey(m)}><div className="provider-logo">{providerIcon(m.provider)}</div><div><strong>{m.label}</strong><small>{m.provider} · {m.id}</small></div><button className={`pin-action ${pinned ? 'pinned' : ''}`} onClick={() => togglePin(m)} title={pinned ? 'Unpin model' : 'Pin model'}>{pinned ? <><X/><span>Unpin</span></> : <><Plus/><span>Pin</span></>}</button></div>})}</div></>;
  if (section === 'integrations') return <><h1>Plugins</h1><p className="settings-subtitle">Manage connector availability, permissions, and context-relevant skills.</p><div className="settings-card"><button className="settings-row wide-control"><div><strong>Default permissions</strong><small>Allow low-risk reads. Ask before external writes or destructive operations.</small></div><span>Low-risk actions</span><ChevronRight /></button></div><div className="settings-card"><div className="settings-card-heading"><h2>Installed integrations</h2><span>{settings.enabledIntegrations.length} enabled</span></div>{integrations.map(item => { const Icon=item.icon; const enabled=settings.enabledIntegrations.includes(item.id); return <button className="settings-row provider-row" key={item.id} onClick={() => setIntegrationDetail(item.id)}><div className="provider-logo"><Icon /></div><div><strong>{item.name}</strong><small>{item.description}</small></div><span className={`connection-pill ${enabled ? 'on' : ''}`}>{enabled ? 'Enabled' : 'Set up'}</span><ChevronRight /></button>})}</div><div className="settings-card"><div className="settings-card-heading"><h2>Connector skills</h2><span>Selected by context</span></div>{skills.filter(s => settings.enabledIntegrations.includes(s.integration)).map(s => <div className="settings-row model-settings-row" key={s.id}><div className="provider-logo"><Sparkles /></div><div><strong>{s.name}</strong><small>{s.description}</small></div><span className="skill-source">{integrations.find(item=>item.id===s.integration)?.name}</span></div>)}</div></>;
  if (section === 'usage') {
    const eight=usage?.eightHour, weekly=usage?.weekly;
    return <><h1>Usage limits</h1><p className="settings-subtitle">Included quotas are enforced server-side. Overage is metered through pay-as-you-go.</p><div className="usage-grid"><div className="usage-card"><div className="usage-head"><span>8-hour limit</span><strong>{eight ? `${Math.round(eight.percentRemaining)}% remaining` : 'Loading'}</strong></div><div className="progress"><span style={{width:`${eight?.percentRemaining ?? 0}%`}}/></div><div className="usage-meta"><span>{eight ? `${eight.totalTokens.toLocaleString()} / ${eight.includedTokens.toLocaleString()} tokens` : '—'}</span><span>{eight ? `Resets ${new Date(eight.resetsAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : '—'}</span></div></div><div className="usage-card"><div className="usage-head"><span>Weekly limit</span><strong>{weekly ? `${Math.round(weekly.percentRemaining)}% remaining` : 'Loading'}</strong></div><div className="progress"><span style={{width:`${weekly?.percentRemaining ?? 0}%`}}/></div><div className="usage-meta"><span>{weekly ? `${weekly.totalTokens.toLocaleString()} / ${weekly.includedTokens.toLocaleString()} tokens` : '—'}</span><span>{weekly ? `Resets ${new Date(weekly.resetsAt).toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'})}` : '—'}</span></div></div></div><div className="settings-card"><div className="settings-row wide-control"><div><strong>Pay as you go</strong><small>Requests continue above included quotas. Estimated current overage: ${usage ? (usage.payg.estimatedMicros/1_000_000).toFixed(2) : '0.00'}.</small></div><span>{usage?.payg.enabled ? 'Enabled' : 'Disabled'}</span></div></div></>;
  }
  if (section === 'general') return <><h1>General</h1><p className="settings-subtitle">Configure the shared application shell. Accent choices propagate to every interactive control.</p><div className="settings-card"><div className="settings-row wide-control"><div><strong>Appearance</strong><small>Use the system theme or force a light or dark interface.</small></div><select value={settings.appearance} onChange={e => setSettings((s: AppSettings)=>({...s,appearance:e.target.value as AppSettings['appearance']}))}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div><div className="settings-row wide-control"><div><strong>Accent color</strong><small>Applied to toggles, progress bars, focus rings, and selected controls.</small></div><div className="accent-options">{ACCENTS.map(color=><button key={color} aria-label={`Use ${color}`} className={settings.accent===color?'selected':''} style={{background:color}} onClick={()=>setSettings((s:AppSettings)=>({...s,accent:color}))}>{settings.accent===color&&<Check/>}</button>)}</div></div><div className="settings-row wide-control"><div><strong>Higher intelligence</strong><small>Automatically select more reasoning for complex Work-mode requests.</small></div><button className={`switch ${settings.higherIntelligence?'on':''}`} onClick={()=>setSettings((s:AppSettings)=>({...s,higherIntelligence:!s.higherIntelligence}))}><span/></button></div><div className="settings-row wide-control"><div><strong>Enable dictation</strong><small>Show dictation controls in both composers.</small></div><button className={`switch ${settings.dictation?'on':''}`} onClick={()=>setSettings((s:AppSettings)=>({...s,dictation:!s.dictation}))}><span/></button></div></div></>;
  return <><h1>{section[0].toUpperCase()+section.slice(1)}</h1><p className="settings-subtitle">This area uses the same database-backed preference model.</p><div className="settings-empty"><Settings /><span>No additional controls configured.</span></div></>;
}

function ProviderDetail(props: any) {
  const provider = PROVIDERS.find(p => p.id === props.provider)!;
  const connected = Boolean(props.providerStatuses[props.provider]?.connected);
  const base = props.settings.providerBaseURLs[props.provider] || provider.baseURL;
  return <><button className="back-row" onClick={() => props.setProviderDetail(null)}><ArrowLeft />Back</button><div className="provider-detail-head"><div className="provider-logo large">{providerIcon(provider.id)}</div><div><h1>{provider.name}</h1><p>{connected ? 'Connected with an encrypted server-side credential' : 'Connect a provider credential for live inference'}</p></div><span className={`connection-pill ${connected?'on':''}`}>{connected?'Connected':'Offline'}</span></div><div className="settings-card connection-card"><div className="settings-card-heading"><h2>Connection</h2><span>Stored encrypted</span></div><div className="form-grid"><label><span>API key</span><input className="text-field" type="password" value={props.credentialDraft} onChange={(e:any)=>props.setCredentialDraft(e.target.value)} placeholder={connected?'Replace existing credential':'Paste API key'} /></label><label><span>Base URL</span><input className="text-field" value={base} onChange={(e:any)=>props.setSettings((s:AppSettings)=>({...s,providerBaseURLs:{...s.providerBaseURLs,[provider.id]:e.target.value}}))}/></label></div><div className="button-row"><button className="primary-button" onClick={()=>void props.saveProviderCredential(provider.id)}>{connected?'Update connection':'Connect'}</button>{connected&&<button className="danger-button" onClick={()=>void props.disconnectProvider(provider.id)}>Disconnect</button>}</div></div><div className="settings-card"><div className="settings-card-heading"><h2>Available models</h2><button className="text-action" onClick={()=>props.addCustomModel(provider.id)}><Plus/>Add by ID</button></div>{props.allModels.filter((m: ModelSpec)=>m.provider===provider.id).map((m: ModelSpec)=>{const pinned=props.settings.pinnedModelKeys.includes(modelKey(m));return <div className="settings-row model-settings-row" key={m.id}><div><strong>{m.label}</strong><small>{m.id}</small></div><button className={`pin-action ${pinned?'pinned':''}`} onClick={()=>props.togglePin(m)}>{pinned?<><X/><span>Unpin</span></>:<><Plus/><span>Pin</span></>}</button></div>})}</div></>;
}

function IntegrationDetail(props: any) {
  const integration = integrations.find(item => item.id === props.integrationId)!;
  const Icon = integration.icon;
  const enabled = props.settings.enabledIntegrations.includes(integration.id);
  const connected = Boolean(props.integrationStatuses[integration.id]?.connected);
  const relevantSkills = skills.filter(skill => skill.integration === integration.id);
  const actions = connectorActions[integration.id] || [];
  const tokenLabel = integration.id === 'figma' ? 'Figma personal access token' : integration.id === 'github' ? 'GitHub access token' : integration.id === 'finances' ? 'Connector API token' : 'OAuth access token';
  return <><button className="back-row" onClick={() => props.setIntegrationDetail(null)}><ArrowLeft />Back</button><div className="provider-detail-head"><div className="provider-logo large"><Icon /></div><div><h1>{integration.name}</h1><p>{connected ? 'Authenticated connector tools are available to agent runs' : enabled ? 'Manifest enabled; connect a credential for live actions' : 'Not configured'}</p></div><span className={`connection-pill ${connected?'on':''}`}>{connected?'Connected':enabled?'Enabled':'Offline'}</span></div><div className="settings-card connection-card"><div className="settings-card-heading"><h2>Connection</h2><span>Encrypted server-side</span></div><div className="form-grid"><label><span>{tokenLabel}</span><input className="text-field" type="password" value={props.credentialDraft} onChange={(e:any)=>props.setCredentialDraft(e.target.value)} placeholder={connected?'Replace connected credential':'Paste access token'} /></label>{integration.id==='finances'&&<label><span>Connector base URL</span><input className="text-field" value={props.settings.connectorBaseURLs[integration.id] || ''} onChange={(e:any)=>props.setSettings((current:AppSettings)=>({...current,connectorBaseURLs:{...current.connectorBaseURLs,[integration.id]:e.target.value}}))} placeholder="https://api.example.com/query"/></label>}</div><div className="button-row"><button className="primary-button" onClick={()=>void props.saveIntegrationCredential(integration.id)}>{connected?'Update connection':'Connect'}</button>{connected&&<button className="danger-button" onClick={()=>void props.disconnectIntegration(integration.id)}>Disconnect</button>}{!connected&&<button className="secondary-button" onClick={()=>props.toggleIntegration(integration.id)}>{enabled?'Disable manifest':'Enable manifest only'}</button>}</div></div>{relevantSkills.length > 0 && <div className="settings-card"><div className="settings-card-heading"><h2>Skills</h2><span>{relevantSkills.length} available</span></div>{relevantSkills.map(skill => <div className="settings-row model-settings-row" key={skill.id}><div className="provider-logo"><Sparkles /></div><div><strong>{skill.name}</strong><small>{skill.description}</small></div><ChevronRight /></div>)}</div>}<div className="settings-card"><div className="settings-card-heading"><h2>Actions</h2><span>{connected?'Live':'Requires connection'}</span></div>{actions.map(action => <details className="connector-action" key={action.name}><summary><span>{action.name}</span><small>{action.risk === 'read' ? 'Read action' : 'Write action'}</small><ChevronRight /></summary><p>{action.description}</p></details>)}</div></>;
}

function SearchOverlay({ query, setQuery, threads, onClose, onChoose }: { query:string; setQuery:(s:string)=>void; threads:Thread[]; onClose:()=>void; onChoose:(id:string)=>void }) {
  return <div className="search-backdrop" onMouseDown={onClose}><div className="search-modal" onMouseDown={e=>e.stopPropagation()}><div className="search-input"><Search/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search chats, projects, files, and skills"/><kbd>esc</kbd></div><div className="search-results">{threads.slice(0,12).map(t=><button key={t.id} onClick={()=>onChoose(t.id)}><MessageCircle/><div><strong>{t.title}</strong><small>{new Date(t.updatedAt).toLocaleDateString()}</small></div><ChevronRight/></button>)}</div></div></div>;
}
