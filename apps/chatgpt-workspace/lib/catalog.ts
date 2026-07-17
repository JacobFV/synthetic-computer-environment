export type ProviderId = 'openai' | 'anthropic' | 'openrouter' | 'alibaba';

export type ModelSpec = {
  id: string;
  provider: ProviderId;
  label: string;
  family: string;
  mode: 'instant' | 'thinking' | 'pro';
  description: string;
  capabilities: Array<'text' | 'vision' | 'files' | 'tools'>;
};

export const PROVIDERS = [
  { id: 'openai' as const, name: 'OpenAI', env: 'OPENAI_API_KEY', baseURL: 'https://api.openai.com/v1' },
  { id: 'anthropic' as const, name: 'Anthropic', env: 'ANTHROPIC_API_KEY', baseURL: 'https://api.anthropic.com' },
  { id: 'openrouter' as const, name: 'OpenRouter', env: 'OPENROUTER_API_KEY', baseURL: 'https://openrouter.ai/api/v1' },
  { id: 'alibaba' as const, name: 'Alibaba Model Studio', env: 'DASHSCOPE_API_KEY', baseURL: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1' }
];

export const MODEL_CATALOG: ModelSpec[] = [
  { id: 'gpt-5.6', provider: 'openai', label: '5.6 Instant', family: 'GPT-5.6', mode: 'instant', description: 'Fast everyday answers', capabilities: ['text', 'vision', 'files', 'tools'] },
  { id: 'gpt-5.6-thinking', provider: 'openai', label: '5.6 Thinking', family: 'GPT-5.6', mode: 'thinking', description: 'Deeper reasoning for complex tasks', capabilities: ['text', 'vision', 'files', 'tools'] },
  { id: 'gpt-5.6-pro', provider: 'openai', label: '5.6 Pro', family: 'GPT-5.6', mode: 'pro', description: 'Research-grade intelligence', capabilities: ['text', 'vision', 'files', 'tools'] },
  { id: 'claude-opus-4-8', provider: 'anthropic', label: 'Claude Opus 4.8', family: 'Claude', mode: 'pro', description: 'High-end analysis and coding', capabilities: ['text', 'vision', 'files', 'tools'] },
  { id: 'claude-sonnet-4-7', provider: 'anthropic', label: 'Claude Sonnet 4.7', family: 'Claude', mode: 'thinking', description: 'Balanced reasoning and latency', capabilities: ['text', 'vision', 'files', 'tools'] },
  { id: 'openai/gpt-5.6', provider: 'openrouter', label: 'GPT-5.6 via OpenRouter', family: 'OpenRouter', mode: 'thinking', description: 'Route through OpenRouter', capabilities: ['text', 'vision', 'files', 'tools'] },
  { id: 'anthropic/claude-opus-4.8', provider: 'openrouter', label: 'Claude Opus via OpenRouter', family: 'OpenRouter', mode: 'pro', description: 'Anthropic through OpenRouter', capabilities: ['text', 'vision', 'files', 'tools'] },
  { id: 'qwen-plus', provider: 'alibaba', label: 'Qwen Plus', family: 'Qwen', mode: 'instant', description: 'General-purpose Qwen model', capabilities: ['text', 'vision', 'files', 'tools'] },
  { id: 'qwen3-max', provider: 'alibaba', label: 'Qwen3 Max', family: 'Qwen', mode: 'pro', description: 'Frontier Qwen reasoning', capabilities: ['text', 'vision', 'files', 'tools'] }
];
