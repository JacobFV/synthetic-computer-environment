import { z } from 'zod';
import { getWorkspaceId } from '@/lib/session';
import { getCredential } from '@/lib/secrets';
import { assertQuota, recordUsage } from '@/lib/usage';

export const runtime = 'nodejs';

const schema = z.object({
  prompt: z.string().min(1),
  model: z.string().default('gpt-image-1'),
  size: z.enum(['1024x1024', '1536x1024', '1024x1536']).default('1024x1024')
});

export async function POST(request: Request) {
  try {
    const workspaceId = await getWorkspaceId();
    await assertQuota(workspaceId);
    const body = schema.parse(await request.json());
    const credential = await getCredential(workspaceId, 'model-provider', 'openai');
    const apiKey = credential?.secret || process.env.OPENAI_API_KEY;
    if (!apiKey) return new Response('Connect OpenAI in Settings before generating images.', { status: 400 });
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: body.model, prompt: body.prompt, size: body.size, response_format: 'b64_json' })
    });
    if (!response.ok) return new Response(await response.text(), { status: response.status });
    const json = await response.json() as { data?: Array<{ b64_json?: string; url?: string }>; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } };
    const item = json.data?.[0];
    const image = item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url;
    if (!image) return new Response('Image provider returned no image.', { status: 502 });
    await recordUsage({
      workspaceId,
      providerId: 'openai',
      modelId: body.model,
      inputTokens: json.usage?.input_tokens || Math.ceil(body.prompt.length / 4),
      outputTokens: json.usage?.output_tokens || 0,
      totalTokens: json.usage?.total_tokens || Math.ceil(body.prompt.length / 4),
    });
    return Response.json({ image });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Image request failed.', { status: 400 });
  }
}
