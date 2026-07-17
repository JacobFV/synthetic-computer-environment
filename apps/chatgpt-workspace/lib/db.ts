import { createClient, type Client } from '@libsql/client';

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

export function db(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL || 'file:./workspace.db';
    client = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return client;
}

export async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const database = db();
      const statements = [
        `CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL DEFAULT 'Workspace',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          name TEXT NOT NULL,
          icon TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS projects_workspace_idx ON projects(workspace_id, position)`,
        `CREATE TABLE IF NOT EXISTS threads (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          project_id TEXT,
          title TEXT NOT NULL,
          temporary INTEGER NOT NULL DEFAULT 0,
          mode TEXT NOT NULL DEFAULT 'chat',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
        )`,
        `CREATE INDEX IF NOT EXISTS threads_workspace_idx ON threads(workspace_id, updated_at DESC)`,
        `CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          attachments_json TEXT,
          citations_json TEXT,
          generated_image TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages(thread_id, created_at)`,
        `CREATE TABLE IF NOT EXISTS activities (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL,
          message_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          label TEXT NOT NULL,
          detail TEXT,
          status TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          finished_at INTEGER,
          agent_id TEXT,
          metadata_json TEXT,
          FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS activities_thread_idx ON activities(thread_id, created_at)`,
        `CREATE TABLE IF NOT EXISTS agent_runs (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL,
          name TEXT NOT NULL,
          task TEXT NOT NULL,
          status TEXT NOT NULL,
          summary TEXT NOT NULL,
          report TEXT NOT NULL,
          parent_message_id TEXT NOT NULL,
          duration TEXT,
          outputs_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS agent_runs_thread_idx ON agent_runs(thread_id, updated_at)`,
        `CREATE TABLE IF NOT EXISTS artifacts (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL,
          title TEXT NOT NULL,
          kind TEXT NOT NULL,
          content TEXT NOT NULL,
          language TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS artifacts_thread_idx ON artifacts(thread_id, created_at)`,
        `CREATE TABLE IF NOT EXISTS workspace_settings (
          workspace_id TEXT PRIMARY KEY,
          settings_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS credentials (
          workspace_id TEXT NOT NULL,
          credential_type TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          encrypted_secret TEXT NOT NULL,
          base_url TEXT,
          metadata_json TEXT,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY(workspace_id, credential_type, provider_id),
          FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS usage_events (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          model_id TEXT NOT NULL,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          total_tokens INTEGER NOT NULL DEFAULT 0,
          cost_micros INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS usage_events_workspace_idx ON usage_events(workspace_id, created_at DESC)`,
      ];
      for (const statement of statements) await database.execute(statement);
    })();
  }
  return schemaReady;
}
