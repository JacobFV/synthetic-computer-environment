import { cookies } from 'next/headers';

const COOKIE_NAME = 'workspace_session';

export async function getWorkspaceId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(COOKIE_NAME)?.value;
  if (existing) return existing;
  const id = crypto.randomUUID();
  cookieStore.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}
