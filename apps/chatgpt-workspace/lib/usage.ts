import { db, ensureSchema } from './db';

export const DEFAULT_PLAN = {
  tier: 'pro',
  eightHourIncludedTokens: 250_000,
  weeklyIncludedTokens: 1_000_000,
  paygEnabled: true,
  paygMicrosPerMillionTokens: 5_000_000,
};

function eightHourWindow(now = Date.now()) {
  const length = 8 * 60 * 60 * 1000;
  const start = Math.floor(now / length) * length;
  return { start, end: start + length };
}

function weekWindow(now = Date.now()) {
  const date = new Date(now);
  const day = (date.getUTCDay() + 6) % 7;
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day, 0, 0, 0, 0);
  return { start, end: start + 7 * 24 * 60 * 60 * 1000 };
}

export async function recordUsage(input: {
  workspaceId: string;
  providerId: string;
  modelId: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costMicros?: number;
}): Promise<void> {
  await ensureSchema();
  const inputTokens = Math.max(0, Math.round(input.inputTokens || 0));
  const outputTokens = Math.max(0, Math.round(input.outputTokens || 0));
  const totalTokens = Math.max(0, Math.round(input.totalTokens || inputTokens + outputTokens));
  await db().execute({
    sql: `INSERT INTO usage_events (id, workspace_id, provider_id, model_id, input_tokens, output_tokens, total_tokens, cost_micros, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [crypto.randomUUID(), input.workspaceId, input.providerId, input.modelId, inputTokens, outputTokens, totalTokens, Math.max(0, Math.round(input.costMicros || 0)), Date.now()],
  });
}

async function sum(workspaceId: string, start: number, end: number) {
  const result = await db().execute({
    sql: `SELECT COALESCE(SUM(input_tokens),0) input_tokens, COALESCE(SUM(output_tokens),0) output_tokens,
      COALESCE(SUM(total_tokens),0) total_tokens, COALESCE(SUM(cost_micros),0) cost_micros
      FROM usage_events WHERE workspace_id=? AND created_at>=? AND created_at<?`,
    args: [workspaceId, start, end],
  });
  const row = result.rows[0];
  return {
    inputTokens: Number(row.input_tokens || 0),
    outputTokens: Number(row.output_tokens || 0),
    totalTokens: Number(row.total_tokens || 0),
    providerCostMicros: Number(row.cost_micros || 0),
  };
}

export async function usageSummary(workspaceId: string, plan = DEFAULT_PLAN) {
  await ensureSchema();
  const now = Date.now();
  const eight = eightHourWindow(now);
  const week = weekWindow(now);
  const [eightUsage, weeklyUsage] = await Promise.all([sum(workspaceId, eight.start, eight.end), sum(workspaceId, week.start, week.end)]);
  const eightOverage = Math.max(0, eightUsage.totalTokens - plan.eightHourIncludedTokens);
  const weeklyOverage = Math.max(0, weeklyUsage.totalTokens - plan.weeklyIncludedTokens);
  const billableTokens = Math.max(eightOverage, weeklyOverage);
  const paygMicros = plan.paygEnabled ? Math.round((billableTokens / 1_000_000) * plan.paygMicrosPerMillionTokens) : 0;
  return {
    plan,
    eightHour: {
      ...eightUsage,
      includedTokens: plan.eightHourIncludedTokens,
      remainingTokens: Math.max(0, plan.eightHourIncludedTokens - eightUsage.totalTokens),
      percentRemaining: Math.max(0, Math.min(100, ((plan.eightHourIncludedTokens - eightUsage.totalTokens) / plan.eightHourIncludedTokens) * 100)),
      resetsAt: eight.end,
    },
    weekly: {
      ...weeklyUsage,
      includedTokens: plan.weeklyIncludedTokens,
      remainingTokens: Math.max(0, plan.weeklyIncludedTokens - weeklyUsage.totalTokens),
      percentRemaining: Math.max(0, Math.min(100, ((plan.weeklyIncludedTokens - weeklyUsage.totalTokens) / plan.weeklyIncludedTokens) * 100)),
      resetsAt: week.end,
    },
    payg: { enabled: plan.paygEnabled, billableTokens, estimatedMicros: paygMicros },
  };
}

export async function assertQuota(workspaceId: string, plan = DEFAULT_PLAN): Promise<void> {
  const summary = await usageSummary(workspaceId, plan);
  if (!plan.paygEnabled && (summary.eightHour.remainingTokens <= 0 || summary.weekly.remainingTokens <= 0)) {
    throw new Error('Included usage is exhausted. Enable pay-as-you-go or wait for the next reset.');
  }
}
