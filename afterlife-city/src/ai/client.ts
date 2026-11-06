// Browser-side AI access. Every call can fail; the simulation never depends on the result.
export interface AiStatus { enabled: boolean; provider: string | null; model: string | null }

export async function fetchStatus(): Promise<AiStatus> {
  try {
    const r = await fetch('/api/ai/status', { signal: AbortSignal.timeout(2500) });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch {
    return { enabled: false, provider: null, model: null };
  }
}

export async function callAi(task: 'events' | 'dialogue' | 'documentary' | 'summary', payload: unknown): Promise<unknown | null> {
  try {
    const r = await fetch('/api/ai', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task, payload }), signal: AbortSignal.timeout(45_000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.ok ? j.data : null;
  } catch {
    return null;
  }
}
