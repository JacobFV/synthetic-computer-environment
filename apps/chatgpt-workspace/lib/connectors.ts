import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { getCredential } from './secrets';

async function fetchJSON(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  return response.json();
}

function bearer(secret: string, extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${secret}`, Accept: 'application/json', ...extra };
}

export async function buildConnectorTools(workspaceId: string, connectorIds: string[]): Promise<ToolSet> {
  const tools: ToolSet = {};
  const credentials = Object.fromEntries(await Promise.all(connectorIds.map(async id => [id, await getCredential(workspaceId, 'connector', id)] as const)));

  if (connectorIds.includes('github') && credentials.github) {
    const credential = credentials.github;
    tools.github_search_repositories = tool({
      description: 'Search GitHub repositories accessible to the connected account.',
      inputSchema: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(20).default(8) }),
      execute: async ({ query, limit }) => {
        const data = await fetchJSON(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${limit}`, { headers: bearer(credential.secret, { 'X-GitHub-Api-Version': '2022-11-28' }) });
        return { repositories: (data.items || []).map((item: any) => ({ fullName: item.full_name, description: item.description, url: item.html_url, stars: item.stargazers_count, updatedAt: item.updated_at })) };
      },
    });
    tools.github_read_file = tool({
      description: 'Read a UTF-8 file from a GitHub repository.',
      inputSchema: z.object({ repository: z.string().regex(/^[^/]+\/[^/]+$/), path: z.string().min(1), ref: z.string().optional() }),
      execute: async ({ repository, path, ref }) => {
        const url = `https://api.github.com/repos/${repository}/contents/${path.split('/').map(encodeURIComponent).join('/')}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;
        const data = await fetchJSON(url, { headers: bearer(credential.secret, { 'X-GitHub-Api-Version': '2022-11-28' }) });
        return { path: data.path, sha: data.sha, content: data.encoding === 'base64' ? Buffer.from(data.content, 'base64').toString('utf8') : data.content };
      },
    });
  }

  if (connectorIds.includes('gmail') && credentials.gmail) {
    const credential = credentials.gmail;
    tools.gmail_search = tool({
      description: 'Search Gmail messages using Gmail search syntax.',
      inputSchema: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(20).default(10) }),
      execute: async ({ query, limit }) => {
        const list = await fetchJSON(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${limit}`, { headers: bearer(credential.secret) });
        const messages = await Promise.all((list.messages || []).slice(0, limit).map(async (message: any) => {
          const data = await fetchJSON(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, { headers: bearer(credential.secret) });
          const headers = Object.fromEntries((data.payload?.headers || []).map((header: any) => [header.name.toLowerCase(), header.value]));
          return { id: data.id, threadId: data.threadId, subject: headers.subject, from: headers.from, date: headers.date, snippet: data.snippet };
        }));
        return { messages };
      },
    });
  }

  if (connectorIds.includes('calendar') && credentials.calendar) {
    const credential = credentials.calendar;
    tools.calendar_list_events = tool({
      description: 'List Google Calendar events in a time range.',
      inputSchema: z.object({ timeMin: z.string().datetime(), timeMax: z.string().datetime(), query: z.string().optional(), limit: z.number().int().min(1).max(50).default(20) }),
      execute: async ({ timeMin, timeMax, query, limit }) => {
        const params = new URLSearchParams({ timeMin, timeMax, maxResults: String(limit), singleEvents: 'true', orderBy: 'startTime' });
        if (query) params.set('q', query);
        const data = await fetchJSON(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers: bearer(credential.secret) });
        return { events: (data.items || []).map((event: any) => ({ id: event.id, title: event.summary, start: event.start, end: event.end, location: event.location, attendees: event.attendees })) };
      },
    });
  }

  if (connectorIds.includes('drive') && credentials.drive) {
    const credential = credentials.drive;
    tools.drive_search_files = tool({
      description: 'Search Google Drive files by name or full text.',
      inputSchema: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(50).default(20) }),
      execute: async ({ query, limit }) => {
        const escaped = query.replace(/'/g, "\\'");
        const params = new URLSearchParams({ q: `(name contains '${escaped}' or fullText contains '${escaped}') and trashed=false`, pageSize: String(limit), fields: 'files(id,name,mimeType,modifiedTime,webViewLink,owners)' });
        const data = await fetchJSON(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: bearer(credential.secret) });
        return { files: data.files || [] };
      },
    });
  }

  if (connectorIds.includes('figma') && credentials.figma) {
    const credential = credentials.figma;
    tools.figma_read_file = tool({
      description: 'Read a Figma file document tree and component metadata.',
      inputSchema: z.object({ fileKey: z.string().min(1), depth: z.number().int().min(1).max(6).default(2) }),
      execute: async ({ fileKey, depth }) => fetchJSON(`https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}?depth=${depth}`, { headers: { 'X-Figma-Token': credential.secret } }),
    });
  }

  if (connectorIds.includes('finances') && credentials.finances?.baseURL) {
    const credential = credentials.finances;
    tools.finances_query = tool({
      description: 'Query the configured finances connector endpoint for account-grounded data.',
      inputSchema: z.object({ queryType: z.enum(['transactions','recurring_transactions','investment_holdings','investment_transactions','liabilities']), filters: z.record(z.string(), z.any()).default({}) }),
      execute: async input => fetchJSON(credential.baseURL!, { method: 'POST', headers: bearer(credential.secret, { 'Content-Type': 'application/json' }), body: JSON.stringify(input) }),
    });
  }

  return tools;
}
