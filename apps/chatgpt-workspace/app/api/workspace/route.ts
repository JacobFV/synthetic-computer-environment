import { z } from 'zod';
import { getWorkspaceId } from '@/lib/session';
import { loadWorkspaceState, replaceWorkspaceState } from '@/lib/workspace-store';

export const runtime = 'nodejs';

const stateSchema = z.object({
  projects: z.array(z.any()),
  threads: z.array(z.any()),
  settings: z.record(z.string(), z.any()).nullable(),
});

export async function GET() {
  const workspaceId = await getWorkspaceId();
  const state = await loadWorkspaceState(workspaceId);
  return Response.json({ workspaceId, ...state });
}

export async function PUT(request: Request) {
  const workspaceId = await getWorkspaceId();
  const state = stateSchema.parse(await request.json());
  await replaceWorkspaceState(workspaceId, state);
  return Response.json({ ok: true, updatedAt: Date.now() });
}
