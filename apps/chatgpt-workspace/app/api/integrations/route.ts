import { z } from 'zod';
import { getWorkspaceId } from '@/lib/session';
import { credentialStatuses, deleteCredential, setCredential } from '@/lib/secrets';

export const runtime = 'nodejs';
const integrationSchema = z.enum(['github','gmail','calendar','drive','figma','finances']);

export async function GET() {
  const workspaceId = await getWorkspaceId();
  return Response.json(await credentialStatuses(workspaceId, 'connector'));
}

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceId();
  const body = z.object({ integration: integrationSchema, token: z.string().min(1), baseURL: z.string().url().optional() }).parse(await request.json());
  await setCredential({ workspaceId, type: 'connector', providerId: body.integration, secret: body.token, baseURL: body.baseURL });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const workspaceId = await getWorkspaceId();
  const integration = integrationSchema.parse(new URL(request.url).searchParams.get('integration'));
  await deleteCredential(workspaceId, 'connector', integration);
  return Response.json({ ok: true });
}
