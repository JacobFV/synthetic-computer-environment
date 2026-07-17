import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, streamText, stepCountIs } from 'ai';
import { z } from 'zod';
import { getWorkspaceId } from '@/lib/session';
import { getCredential } from '@/lib/secrets';
import { assertQuota, recordUsage } from '@/lib/usage';
import { buildConnectorTools } from '@/lib/connectors';

export const runtime = 'nodejs';

const attachmentSchema = z.object({
  name: z.string(),
  mime: z.string(),
  dataUrl: z.string().optional(),
  text: z.string().optional()
});

const requestSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'openrouter', 'alibaba']),
  model: z.string(),
  baseURL: z.string().url().optional(),
  effort: z.enum(['light', 'medium', 'high', 'extra-high', 'max', 'ultra']).default('high'),
  speed: z.enum(['standard', 'fast']).default('standard'),
  mode: z.enum(['chat', 'work']).default('chat'),
  toolMode: z.enum(['none', 'image', 'web']).default('none'),
  skills: z.array(z.string()).default([]),
  connectors: z.array(z.string()).default([]),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
    attachments: z.array(attachmentSchema).optional()
  }))
});

type Body = z.infer<typeof requestSchema>;
type AgentStatus = 'queued' | 'running' | 'done';

type AgentEvent = {
  id: string;
  name: string;
  task: string;
  status: AgentStatus;
  summary: string;
  report: string;
  parentMessageId: string;
  duration?: string;
  outputs?: string[];
};

function envKey(provider: Body['provider']) {
  if (provider === 'openai') return process.env.OPENAI_API_KEY;
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY;
  if (provider === 'openrouter') return process.env.OPENROUTER_API_KEY;
  if (provider === 'alibaba') return process.env.DASHSCOPE_API_KEY;
}

function createModel(body: Body, apiKey: string) {
  if (body.provider === 'anthropic') return createAnthropic({ apiKey })(body.model);
  const defaults = {
    openai: 'https://api.openai.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    alibaba: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1'
  } as const;
  const compatible = createOpenAI({
    apiKey,
    baseURL: body.baseURL || defaults[body.provider as keyof typeof defaults],
    name: body.provider,
    headers: body.provider === 'openrouter' ? {
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
      'X-OpenRouter-Title': 'Workspace AI'
    } : undefined
  });
  return compatible(body.model);
}

function reasoningEffort(effort: Body['effort']): 'low' | 'medium' | 'high' {
  if (effort === 'light') return 'low';
  if (effort === 'medium') return 'medium';
  return 'high';
}

function summarize(text: string, fallback: string) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return fallback;
  return cleaned.length > 210 ? `${cleaned.slice(0, 207)}…` : cleaned;
}

function extractArtifacts(text: string) {
  const artifacts: Array<{ id: string; title: string; kind: 'code' | 'document'; content: string; language?: string }> = [];
  const fence = /```([\w.+-]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = fence.exec(text)) && index < 5) {
    const language = match[1] || 'text';
    artifacts.push({
      id: crypto.randomUUID(),
      title: `generated-${index + 1}.${language === 'typescript' ? 'ts' : language === 'javascript' ? 'js' : language === 'python' ? 'py' : language}`,
      kind: 'code',
      language,
      content: match[2].trim()
    });
    index += 1;
  }
  return artifacts;
}

function modelMessages(body: Body) {
  return body.messages.map(message => {
    if (message.role !== 'user' || !message.attachments?.length) return { role: message.role, content: message.content };
    const parts: any[] = [{ type: 'text', text: message.content }];
    for (const attachment of message.attachments) {
      if (attachment.mime.startsWith('image/') && attachment.dataUrl) parts.push({ type: 'image', image: attachment.dataUrl });
      else if (attachment.text) parts.push({ type: 'text', text: `\n\n[File: ${attachment.name}]\n${attachment.text}` });
      else parts.push({ type: 'text', text: `\n\n[Attached file: ${attachment.name}; ${attachment.mime}]` });
    }
    return { role: message.role, content: parts };
  });
}

async function demoStream(body: Body, emit: (event: unknown) => void) {
  const prompt = [...body.messages].reverse().find(message => message.role === 'user')?.content || 'the request';
  const modelActionId = crypto.randomUUID();
  emit({ type: 'action', action: { id: modelActionId, kind: 'model', label: `Calling ${body.model}`, detail: 'Demo mode: connect a provider key in Settings for live inference.', status: 'running', createdAt: Date.now() } });

  let agentContext = '';
  if (body.mode === 'work') {
    const agents: AgentEvent[] = [
      { id: crypto.randomUUID(), name: 'Research', task: 'Collect constraints, sources, and relevant context', status: 'queued', summary: 'Queued.', report: 'Queued.', parentMessageId: '', outputs: ['evidence.md'] },
      { id: crypto.randomUUID(), name: 'Implementation', task: 'Construct the concrete solution and artifacts', status: 'queued', summary: 'Queued.', report: 'Queued.', parentMessageId: '', outputs: ['implementation.md'] },
      { id: crypto.randomUUID(), name: 'Quality control', task: 'Adversarially inspect the final result', status: 'queued', summary: 'Queued.', report: 'Queued.', parentMessageId: '', outputs: ['qc-report.md'] }
    ];
    for (const agent of agents) emit({ type: 'agent', agent });
    for (let i = 0; i < agents.length; i += 1) {
      const started = Date.now();
      agents[i] = { ...agents[i], status: 'running', summary: `Working on ${agents[i].task.toLowerCase()}.`, report: 'Work in progress.' };
      emit({ type: 'agent', agent: agents[i] });
      await new Promise(resolve => setTimeout(resolve, 260));
      const reports = [
        `Reviewed the request “${prompt}”. Identified the UI, provider abstraction, persistence, streaming, action telemetry, and deployment constraints. This is a concise work product, not hidden reasoning.`,
        'Produced a typed implementation plan with provider adapters, activity events, subagent reports, artifacts, settings, uploads, and connector-aware skills.',
        'Checked the candidate for visible progress reporting, private report separation, safe credential handling, responsive layout, build integrity, and testability.'
      ];
      const summaries = ['Returned the requirement and constraint packet.', 'Produced the implementation candidate and artifact manifest.', 'Validated the candidate and returned final corrections.'];
      agents[i] = { ...agents[i], status: 'done', summary: summaries[i], report: reports[i], duration: `${Date.now() - started}ms` };
      emit({ type: 'agent', agent: agents[i] });
    }
    agentContext = ' Three inspectable specialist reports were completed and distilled into this answer.';
    emit({ type: 'artifact', artifact: { id: crypto.randomUUID(), title: 'workspace-events.ts', kind: 'code', language: 'typescript', content: "type RuntimeEvent = TextDelta | ActionUpdate | AgentUpdate | ArtifactCreated;\n\n// streamed as newline-delimited JSON" } });
  }

  const answer = `the workspace shell is operating in demo mode.${agentContext}\n\nfor live inference, open **settings → models & providers**, connect an api key, pin the desired models, then send the request again. the runtime now streams user-facing actions as they happen, while complete subagent reports remain inspectable in the right panel.`;
  for (const chunk of answer.match(/[\s\S]{1,18}/g) || [answer]) {
    emit({ type: 'delta', text: chunk });
    await new Promise(resolve => setTimeout(resolve, 22));
  }
  emit({ type: 'action', action: { id: modelActionId, kind: 'model', label: `Completed ${body.model}`, detail: 'Demo response streamed successfully.', status: 'done', createdAt: Date.now(), finishedAt: Date.now() } });
}

export async function POST(req: Request) {
  const workspaceId = await getWorkspaceId();
  let body: Body;
  try {
    body = requestSchema.parse(await req.json());
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Invalid request.', { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const finish = () => {
        try { controller.close(); } catch { /* already closed */ }
      };

      try {
        const lastUser = [...body.messages].reverse().find(message => message.role === 'user');
        const attachments = lastUser?.attachments || [];
        if (attachments.length) {
          const id = crypto.randomUUID();
          emit({ type: 'action', action: { id, kind: 'file', label: `Reading ${attachments.length} uploaded ${attachments.length === 1 ? 'file' : 'files'}`, detail: attachments.map(file => file.name).join(', '), status: 'running', createdAt: Date.now() } });
          emit({ type: 'action', action: { id, kind: 'file', label: `Read ${attachments.length} uploaded ${attachments.length === 1 ? 'file' : 'files'}`, detail: attachments.map(file => file.name).join(', '), status: 'done', createdAt: Date.now(), finishedAt: Date.now() } });
        }

        for (const skill of body.skills) {
          const id = crypto.randomUUID();
          emit({ type: 'action', action: { id, kind: 'skill', label: `Applying ${skill} skill`, detail: 'Loaded the configured skill instructions into this run.', status: 'running', createdAt: Date.now() } });
          emit({ type: 'action', action: { id, kind: 'skill', label: `Applied ${skill} skill`, detail: 'Skill context is active for the lead agent.', status: 'done', createdAt: Date.now(), finishedAt: Date.now() } });
        }

        for (const connector of body.connectors) {
          const id = crypto.randomUUID();
          emit({ type: 'action', action: { id, kind: 'connector', label: `Loading ${connector} connector`, detail: 'Preparing authenticated connector tools and permission policy.', status: 'running', createdAt: Date.now() } });
          emit({ type: 'action', action: { id, kind: 'connector', label: `Loaded ${connector} connector`, detail: 'Connector tools are available when a server-side credential is connected.', status: 'done', createdAt: Date.now(), finishedAt: Date.now() } });
        }

        await assertQuota(workspaceId);
        const storedCredential = await getCredential(workspaceId, 'model-provider', body.provider);
        const apiKey = storedCredential?.secret || envKey(body.provider);
        if (!apiKey) {
          await demoStream(body, emit);
          finish();
          return;
        }

        const model = createModel({ ...body, baseURL: body.baseURL || storedCredential?.baseURL }, apiKey);
        let externalContext = '';
        let citations: Array<{ id: string; label: string; url?: string; source?: string }> = [];
        if (body.toolMode === 'web') {
          const searchId = crypto.randomUUID();
          emit({ type: 'action', action: { id: searchId, kind: 'web', label: 'Searching the web', detail: lastUser?.content || '', status: 'running', createdAt: Date.now() } });
          const key = process.env.TAVILY_API_KEY;
          if (!key) throw new Error('Web search is selected but TAVILY_API_KEY is not configured.');
          const searchResponse = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: key, query: lastUser?.content || '', search_depth: 'advanced', max_results: 6, include_answer: true })
          });
          if (!searchResponse.ok) throw new Error(`Web search failed: ${await searchResponse.text()}`);
          const search = await searchResponse.json() as { answer?: string; results?: Array<{ title: string; url: string; content: string }> };
          const results = search.results || [];
          externalContext = `\n\nWEB SEARCH CONTEXT\n${search.answer || ''}\n${results.map((result, index) => `[${index + 1}] ${result.title}\n${result.url}\n${result.content}`).join('\n\n')}\n\nCite these sources by title and URL in the answer.`;
          citations = results.map((result, index) => ({ id: `web:${index}`, label: result.title, url: result.url, source: new URL(result.url).hostname }));
          emit({ type: 'citations', citations });
          emit({ type: 'action', action: { id: searchId, kind: 'web', label: `Searched ${results.length} web sources`, detail: results.slice(0, 3).map(result => result.title).join(' · '), status: 'done', createdAt: Date.now(), finishedAt: Date.now() } });
        }

        const baseMessages = modelMessages(body);
        let workContext = '';
        if (body.mode === 'work') {
          const parentMessageId = '';
          const agents: AgentEvent[] = [
            { id: crypto.randomUUID(), name: 'Research', task: 'Collect constraints, sources, and relevant context', status: 'queued', summary: 'Queued.', report: 'Queued.', parentMessageId, outputs: ['evidence.md'] },
            { id: crypto.randomUUID(), name: 'Implementation', task: 'Construct the concrete solution and artifacts', status: 'queued', summary: 'Queued.', report: 'Queued.', parentMessageId, outputs: ['implementation.md', 'artifact-manifest.json'] },
            { id: crypto.randomUUID(), name: 'Quality control', task: 'Adversarially inspect the final result', status: 'queued', summary: 'Queued.', report: 'Queued.', parentMessageId, outputs: ['qc-report.md'] }
          ];
          agents.forEach(agent => emit({ type: 'agent', agent }));

          const prompt = lastUser?.content || '';
          const runAgent = async (index: number, system: string, context = '') => {
            const started = Date.now();
            agents[index] = { ...agents[index], status: 'running', summary: `Working on ${agents[index].task.toLowerCase()}.`, report: 'Work in progress.' };
            emit({ type: 'agent', agent: agents[index] });
            const result = await generateText({
              model,
              system: `${system}\nReturn a concise professional end-of-work report and explicit deliverables. Do not provide hidden chain-of-thought or private scratch reasoning.${externalContext}`,
              prompt: `User request:\n${prompt}${context}`,
              temperature: 0.25
            });
            agents[index] = {
              ...agents[index],
              status: 'done',
              summary: summarize(result.text, 'Completed the assigned work.'),
              report: result.text,
              duration: `${Math.max(1, Math.round((Date.now() - started) / 1000))}s`
            };
            emit({ type: 'agent', agent: agents[index] });
            return result.text;
          };

          const research = await runAgent(0, 'You are the research and requirements specialist. Identify constraints, relevant evidence, interfaces, risks, and acceptance criteria.');
          const implementation = await runAgent(1, 'You are the implementation specialist. Produce a concrete solution, architecture, code-level decisions, and artifact manifest.', `\n\nResearch handoff:\n${research}`);
          const qc = await runAgent(2, 'You are the adversarial quality-control specialist. Inspect the proposed implementation for correctness, completeness, UX fidelity, security, and deployment failures.', `\n\nResearch handoff:\n${research}\n\nImplementation candidate:\n${implementation}`);
          workContext = `\n\nPRIVATE SUBAGENT WORK PRODUCTS\nResearch:\n${research}\n\nImplementation:\n${implementation}\n\nQuality control:\n${qc}\n\nUse these work products to produce the user-facing synthesis. Do not mention hidden reasoning; the reports are separately inspectable.`;
          for (const artifact of extractArtifacts(implementation)) emit({ type: 'artifact', artifact });
        }

        const modelActionId = crypto.randomUUID();
        emit({ type: 'action', action: { id: modelActionId, kind: 'model', label: `Calling ${body.model}`, detail: `${body.provider} · ${body.speed} · ${body.effort} effort`, status: 'running', createdAt: Date.now() } });

        const skillContext = body.skills.length ? `\n\nEnabled skills: ${body.skills.join(', ')}. Apply these workflows when relevant.` : '';
        const connectorContext = body.connectors.length ? `\n\nSelected connector contexts: ${body.connectors.join(', ')}. Only use connector capabilities that are actually configured; otherwise state the missing connection.` : '';
        const connectorTools = await buildConnectorTools(workspaceId, body.connectors);
        const system = (body.mode === 'work'
          ? 'You are the lead agent in a multi-agent workspace. Produce the final user-facing synthesis. Internal subagent reports, artifacts, citations, connector calls, and approvals are represented separately by the application.'
          : 'You are a precise, capable conversational assistant. Answer directly and use attached files when relevant.') + skillContext + connectorContext + externalContext + workContext;

        const result = streamText({
          model,
          messages: baseMessages as any,
          system,
          temperature: body.speed === 'fast' ? 0.25 : 0.55,
          providerOptions: body.provider === 'openai' ? { openai: { reasoningEffort: reasoningEffort(body.effort) } } : undefined,
          tools: connectorTools,
          stopWhen: stepCountIs(8),
        });

        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') emit({ type: 'delta', text: part.text });
          else if (part.type === 'tool-call') emit({ type: 'action', action: { id: `tool:${part.toolCallId}`, kind: 'connector', label: `Calling ${part.toolName}`, detail: 'Tool input prepared by the model.', status: 'running', createdAt: Date.now() } });
          else if (part.type === 'tool-result') emit({ type: 'action', action: { id: `tool:${part.toolCallId}`, kind: 'connector', label: `Completed ${part.toolName}`, detail: 'Tool result returned to the model.', status: 'done', createdAt: Date.now(), finishedAt: Date.now() } });
          else if (part.type === 'error') throw part.error;
        }

        const usage = await result.usage;
        await recordUsage({
          workspaceId,
          providerId: body.provider,
          modelId: body.model,
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
          totalTokens: usage.totalTokens || 0,
        });
        emit({ type: 'usage', usage });
        emit({ type: 'action', action: { id: modelActionId, kind: 'model', label: `Completed ${body.model}`, detail: citations.length ? `Synthesized ${citations.length} cited sources.` : 'Response stream completed.', status: 'done', createdAt: Date.now(), finishedAt: Date.now() } });
        emit({ type: 'done' });
        finish();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown request error';
        emit({ type: 'error', message });
        finish();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    }
  });
}
