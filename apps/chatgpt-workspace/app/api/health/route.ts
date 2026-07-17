import { db, ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  let database = false;
  try {
    await ensureSchema();
    await db().execute('SELECT 1');
    database = true;
  } catch {
    database = false;
  }

  return Response.json({
    ok: database,
    service: 'workspace-ai',
    version: '0.3.0',
    timestamp: new Date().toISOString(),
    database,
    providers: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      alibaba: Boolean(process.env.DASHSCOPE_API_KEY),
    },
  }, { status: database ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
