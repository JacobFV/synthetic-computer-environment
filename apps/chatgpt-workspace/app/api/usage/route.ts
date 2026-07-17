import { getWorkspaceId } from '@/lib/session';
import { usageSummary } from '@/lib/usage';

export const runtime = 'nodejs';

export async function GET() {
  const workspaceId = await getWorkspaceId();
  return Response.json(await usageSummary(workspaceId));
}
