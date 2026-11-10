// Edge Function 共通: CORS・JSON応答・利用者の確認。

export function corsHeaders(allowedOrigin: string | undefined): Record<string, string> {
  return {
    'access-control-allow-origin': allowedOrigin || '*',
    'access-control-allow-headers': 'authorization, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
  };
}

export const jsonResponse = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

export function bearerToken(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return m ? m[1] : null;
}

export interface AuthEnv { supabaseUrl?: string; anonKey?: string; allowAnonymous?: boolean }

/**
 * サインイン済みの利用者だけに使わせる（AIの利用料金を守るため）。
 * トークンは Supabase Auth に問い合わせて確かめるので、関数を --no-verify-jwt で公開していても有効。
 * LUCIDA_ALLOW_ANON=true のときだけ確認を省く（誰でも呼べるようになるので非推奨）。
 */
export async function verifyUser(request: Request, env: AuthEnv, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; userId: string | null } | { ok: false; status: number; error: string }> {
  if (env.allowAnonymous) return { ok: true, userId: null };
  const token = bearerToken(request.headers.get('authorization'));
  if (!token) return { ok: false, status: 401, error: 'sign-in required' };
  if (!env.supabaseUrl || !env.anonKey) return { ok: false, status: 503, error: 'server is not configured' };
  try {
    const res = await fetchImpl(`${env.supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: env.anonKey } });
    if (!res.ok) return { ok: false, status: 401, error: 'sign-in required' };
    const user = (await res.json()) as { id?: unknown };
    return typeof user.id === 'string' && user.id ? { ok: true, userId: user.id } : { ok: false, status: 401, error: 'sign-in required' };
  } catch {
    return { ok: false, status: 503, error: 'auth is unavailable' };
  }
}
