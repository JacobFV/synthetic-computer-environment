import { z } from 'zod';
import { getWorkspaceId } from '@/lib/session';
import { credentialStatuses, deleteCredential, setCredential } from '@/lib/secrets';

export const runtime = 'nodejs';

const providerSchema = z.enum(['openai', 'anthropic', 'openrouter', 'alibaba']);

export async function GET() {
  const workspaceId = await getWorkspaceId();
  return Response.json(await credentialStatuses(workspaceId, 'model-provider'));
}

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceId();
  const body = z.object({ provider: providerSchema, apiKey: z.string().min(1), baseURL: z.string().url().optional() }).parse(await request.json());
  await setCredential({ workspaceId, type: 'model-provider', providerId: body.provider, secret: body.apiKey, baseURL: body.baseURL });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const workspaceId = await getWorkspaceId();
  const { searchParams } = new URL(request.url);
  const provider = providerSchema.parse(searchParams.get('provider'));
  await deleteCredential(workspaceId, 'model-provider', provider);
  return Response.json({ ok: true });
}
