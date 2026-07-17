import { db, ensureSchema } from './db';

export type StoredAttachment = { id: string; name: string; mime: string; size: number; dataUrl?: string; text?: string };
export type StoredCitation = { id: string; label: string; url?: string; source?: string };
export type StoredMessage = { id: string; role: 'user' | 'assistant'; content: string; createdAt: number; attachments?: StoredAttachment[]; citations?: StoredCitation[]; generatedImage?: string };
export type StoredActivity = { id: string; messageId: string; kind: string; label: string; detail?: string; status: string; createdAt: number; finishedAt?: number; agentId?: string; metadata?: Record<string, unknown> };
export type StoredAgent = { id: string; name: string; task: string; status: string; summary: string; report: string; parentMessageId: string; duration?: string; outputs?: string[] };
export type StoredArtifact = { id: string; title: string; kind: string; content: string; language?: string };
export type StoredThread = { id: string; title: string; projectId?: string; messages: StoredMessage[]; activities: StoredActivity[]; agents: StoredAgent[]; artifacts: StoredArtifact[]; updatedAt: number; temporary?: boolean; mode?: 'chat' | 'work' };
export type StoredProject = { id: string; name: string; icon: string; threads?: string[] };
export type WorkspaceState = { projects: StoredProject[]; threads: StoredThread[]; settings: Record<string, unknown> | null };

function parseJSON<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
}

export async function loadWorkspaceState(workspaceId: string): Promise<WorkspaceState> {
  await ensureSchema();
  const database = db();
  const [projectsResult, threadsResult, messagesResult, activitiesResult, agentsResult, artifactsResult, settingsResult] = await Promise.all([
    database.execute({ sql: 'SELECT * FROM projects WHERE workspace_id=? ORDER BY position, created_at', args: [workspaceId] }),
    database.execute({ sql: 'SELECT * FROM threads WHERE workspace_id=? ORDER BY updated_at DESC', args: [workspaceId] }),
    database.execute({ sql: `SELECT m.* FROM messages m JOIN threads t ON t.id=m.thread_id WHERE t.workspace_id=? ORDER BY m.created_at`, args: [workspaceId] }),
    database.execute({ sql: `SELECT a.* FROM activities a JOIN threads t ON t.id=a.thread_id WHERE t.workspace_id=? ORDER BY a.created_at`, args: [workspaceId] }),
    database.execute({ sql: `SELECT a.* FROM agent_runs a JOIN threads t ON t.id=a.thread_id WHERE t.workspace_id=? ORDER BY a.created_at`, args: [workspaceId] }),
    database.execute({ sql: `SELECT a.* FROM artifacts a JOIN threads t ON t.id=a.thread_id WHERE t.workspace_id=? ORDER BY a.created_at`, args: [workspaceId] }),
    database.execute({ sql: 'SELECT settings_json FROM workspace_settings WHERE workspace_id=?', args: [workspaceId] }),
  ]);

  const projects: StoredProject[] = projectsResult.rows.map(row => ({
    id: String(row.id),
    name: String(row.name),
    icon: String(row.icon),
    threads: [],
  }));

  const threadMap = new Map<string, StoredThread>();
  for (const row of threadsResult.rows) {
    threadMap.set(String(row.id), {
      id: String(row.id),
      title: String(row.title),
      projectId: row.project_id ? String(row.project_id) : undefined,
      messages: [],
      activities: [],
      agents: [],
      artifacts: [],
      updatedAt: Number(row.updated_at),
      temporary: Boolean(row.temporary),
      mode: String(row.mode || 'chat') === 'work' ? 'work' : 'chat',
    });
  }

  for (const row of messagesResult.rows) {
    threadMap.get(String(row.thread_id))?.messages.push({
      id: String(row.id),
      role: String(row.role) === 'user' ? 'user' : 'assistant',
      content: String(row.content),
      createdAt: Number(row.created_at),
      attachments: parseJSON<StoredAttachment[] | undefined>(row.attachments_json, undefined),
      citations: parseJSON<StoredCitation[] | undefined>(row.citations_json, undefined),
      generatedImage: row.generated_image ? String(row.generated_image) : undefined,
    });
  }

  for (const row of activitiesResult.rows) {
    threadMap.get(String(row.thread_id))?.activities.push({
      id: String(row.id),
      messageId: String(row.message_id),
      kind: String(row.kind),
      label: String(row.label),
      detail: row.detail ? String(row.detail) : undefined,
      status: String(row.status),
      createdAt: Number(row.created_at),
      finishedAt: row.finished_at ? Number(row.finished_at) : undefined,
      agentId: row.agent_id ? String(row.agent_id) : undefined,
      metadata: parseJSON<Record<string, unknown> | undefined>(row.metadata_json, undefined),
    });
  }

  for (const row of agentsResult.rows) {
    threadMap.get(String(row.thread_id))?.agents.push({
      id: String(row.id),
      name: String(row.name),
      task: String(row.task),
      status: String(row.status),
      summary: String(row.summary),
      report: String(row.report),
      parentMessageId: String(row.parent_message_id),
      duration: row.duration ? String(row.duration) : undefined,
      outputs: parseJSON<string[] | undefined>(row.outputs_json, undefined),
    });
  }

  for (const row of artifactsResult.rows) {
    threadMap.get(String(row.thread_id))?.artifacts.push({
      id: String(row.id),
      title: String(row.title),
      kind: String(row.kind),
      content: String(row.content),
      language: row.language ? String(row.language) : undefined,
    });
  }

  for (const project of projects) {
    project.threads = [...threadMap.values()].filter(thread => thread.projectId === project.id).map(thread => thread.id);
  }

  return {
    projects,
    threads: [...threadMap.values()],
    settings: settingsResult.rows[0] ? parseJSON<Record<string, unknown>>(settingsResult.rows[0].settings_json, {}) : null,
  };
}

export async function replaceWorkspaceState(workspaceId: string, state: WorkspaceState): Promise<void> {
  await ensureSchema();
  const database = db();
  const tx = await database.transaction('write');
  const now = Date.now();
  try {
    await tx.execute({
      sql: `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at`,
      args: [workspaceId, 'Workspace', now, now],
    });

    await tx.execute({ sql: 'DELETE FROM messages WHERE thread_id IN (SELECT id FROM threads WHERE workspace_id=?)', args: [workspaceId] });
    await tx.execute({ sql: 'DELETE FROM activities WHERE thread_id IN (SELECT id FROM threads WHERE workspace_id=?)', args: [workspaceId] });
    await tx.execute({ sql: 'DELETE FROM agent_runs WHERE thread_id IN (SELECT id FROM threads WHERE workspace_id=?)', args: [workspaceId] });
    await tx.execute({ sql: 'DELETE FROM artifacts WHERE thread_id IN (SELECT id FROM threads WHERE workspace_id=?)', args: [workspaceId] });
    await tx.execute({ sql: 'DELETE FROM threads WHERE workspace_id=?', args: [workspaceId] });
    await tx.execute({ sql: 'DELETE FROM projects WHERE workspace_id=?', args: [workspaceId] });

    for (let position = 0; position < state.projects.length; position += 1) {
      const project = state.projects[position];
      await tx.execute({
        sql: 'INSERT INTO projects (id, workspace_id, name, icon, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [project.id, workspaceId, project.name, project.icon, position, now, now],
      });
    }

    for (const thread of state.threads) {
      const createdAt = thread.messages[0]?.createdAt || thread.updatedAt || now;
      await tx.execute({
        sql: 'INSERT INTO threads (id, workspace_id, project_id, title, temporary, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [thread.id, workspaceId, thread.projectId || null, thread.title, thread.temporary ? 1 : 0, thread.mode || 'chat', createdAt, thread.updatedAt || now],
      });
      for (const message of thread.messages) {
        await tx.execute({
          sql: 'INSERT INTO messages (id, thread_id, role, content, attachments_json, citations_json, generated_image, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          args: [message.id, thread.id, message.role, message.content, message.attachments ? JSON.stringify(message.attachments) : null, message.citations ? JSON.stringify(message.citations) : null, message.generatedImage || null, message.createdAt],
        });
      }
      for (const activity of thread.activities || []) {
        await tx.execute({
          sql: 'INSERT INTO activities (id, thread_id, message_id, kind, label, detail, status, created_at, finished_at, agent_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [activity.id, thread.id, activity.messageId, activity.kind, activity.label, activity.detail || null, activity.status, activity.createdAt, activity.finishedAt || null, activity.agentId || null, activity.metadata ? JSON.stringify(activity.metadata) : null],
        });
      }
      for (const agent of thread.agents || []) {
        await tx.execute({
          sql: 'INSERT INTO agent_runs (id, thread_id, name, task, status, summary, report, parent_message_id, duration, outputs_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [agent.id, thread.id, agent.name, agent.task, agent.status, agent.summary, agent.report, agent.parentMessageId, agent.duration || null, agent.outputs ? JSON.stringify(agent.outputs) : null, now, now],
        });
      }
      for (const artifact of thread.artifacts || []) {
        await tx.execute({
          sql: 'INSERT INTO artifacts (id, thread_id, title, kind, content, language, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          args: [artifact.id, thread.id, artifact.title, artifact.kind, artifact.content, artifact.language || null, now],
        });
      }
    }

    await tx.execute({
      sql: `INSERT INTO workspace_settings (workspace_id, settings_json, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET settings_json=excluded.settings_json, updated_at=excluded.updated_at`,
      args: [workspaceId, JSON.stringify(state.settings || {}), now],
    });
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}
