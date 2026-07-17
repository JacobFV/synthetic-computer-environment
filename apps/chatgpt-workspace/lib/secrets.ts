import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { db, ensureSchema } from './db';

function key(): Buffer {
  const source = process.env.APP_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || 'development-only-change-me';
  return createHash('sha256').update(source).digest();
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(buffer => buffer.toString('base64url')).join('.');
}

function decrypt(value: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = value.split('.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64url')), decipher.final()]).toString('utf8');
}

export type CredentialType = 'model-provider' | 'connector';

export async function setCredential(input: {
  workspaceId: string;
  type: CredentialType;
  providerId: string;
  secret: string;
  baseURL?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  await db().execute({
    sql: `INSERT INTO credentials (workspace_id, credential_type, provider_id, encrypted_secret, base_url, metadata_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, credential_type, provider_id) DO UPDATE SET
        encrypted_secret=excluded.encrypted_secret,
        base_url=excluded.base_url,
        metadata_json=excluded.metadata_json,
        updated_at=excluded.updated_at`,
    args: [input.workspaceId, input.type, input.providerId, encrypt(input.secret), input.baseURL || null, JSON.stringify(input.metadata || {}), now],
  });
}

export async function getCredential(workspaceId: string, type: CredentialType, providerId: string): Promise<{ secret: string; baseURL?: string; metadata: Record<string, unknown> } | null> {
  await ensureSchema();
  const result = await db().execute({
    sql: 'SELECT encrypted_secret, base_url, metadata_json FROM credentials WHERE workspace_id=? AND credential_type=? AND provider_id=?',
    args: [workspaceId, type, providerId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    secret: decrypt(String(row.encrypted_secret)),
    baseURL: row.base_url ? String(row.base_url) : undefined,
    metadata: row.metadata_json ? JSON.parse(String(row.metadata_json)) : {},
  };
}

export async function deleteCredential(workspaceId: string, type: CredentialType, providerId: string): Promise<void> {
  await ensureSchema();
  await db().execute({
    sql: 'DELETE FROM credentials WHERE workspace_id=? AND credential_type=? AND provider_id=?',
    args: [workspaceId, type, providerId],
  });
}

export async function credentialStatuses(workspaceId: string, type: CredentialType): Promise<Record<string, { connected: boolean; baseURL?: string; updatedAt: number }>> {
  await ensureSchema();
  const result = await db().execute({
    sql: 'SELECT provider_id, base_url, updated_at FROM credentials WHERE workspace_id=? AND credential_type=?',
    args: [workspaceId, type],
  });
  return Object.fromEntries(result.rows.map(row => [String(row.provider_id), {
    connected: true,
    baseURL: row.base_url ? String(row.base_url) : undefined,
    updatedAt: Number(row.updated_at),
  }]));
}
