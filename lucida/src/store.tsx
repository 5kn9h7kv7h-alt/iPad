import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createEngine, getPrefs, refreshProfileSummary, type Engine, type GenerateOptions, type GenerateResult } from './ai/engine';
import { inferNewInterests, extractTags } from './ai/profile';
import { createRemoteProvider } from './ai/remote';
import { openRepository } from './data';
import type { Repository } from './data/repository';
import { deriveState, type DiscoveryState } from './domain/state';
import type {
  Discovery, Experiment, ExperimentLog, Interaction, InteractionKind, Interest, KnowledgeEdge, KnowledgeNode, Note, NoteKind, Prefs, Question, Source,
} from './domain/types';
import { removeNodeData } from './knowledge/actions';
import { nodeId } from './knowledge/graph';
import { DEFAULT_PREFS } from './domain/types';
import { newId, nowIso, parseHttpUrl } from './domain/util';

export interface Data {
  interests: Interest[]; discoveries: Discovery[]; sources: Source[]; questions: Question[];
  interactions: Interaction[]; notes: Note[]; prefs: Prefs; usageToday: number;
  nodes: KnowledgeNode[]; edges: KnowledgeEdge[]; experiments: Experiment[]; experimentLogs: ExperimentLog[];
}
const EMPTY: Data = { interests: [], discoveries: [], sources: [], questions: [], interactions: [], notes: [], prefs: DEFAULT_PREFS, usageToday: 0, nodes: [], edges: [], experiments: [], experimentLogs: [] };

export type EntryKind = NoteKind | 'question' | 'interest';

interface Ctx {
  ready: boolean;
  loadError: string | null;
  repo: Repository | null;
  data: Data;
  aiAvailable: boolean;
  toast: string | null;
  say(msg: string): void;
  stateOf(id: string): DiscoveryState;
  react(id: string, kind: InteractionKind): Promise<void>;
  generate(opts: GenerateOptions): Promise<GenerateResult>;
  ensureToday(): Promise<GenerateResult | null>;
  addEntry(kind: EntryKind, text: string): Promise<{ inferred: string[] }>;
  saveInterest(i: Partial<Interest> & { name: string }): Promise<void>;
  removeInterest(id: string): Promise<void>;
  savePrefs(p: Partial<Prefs>): Promise<void>;
  setQuestionStatus(id: string, status: Question['status']): Promise<void>;
  removeQuestion(id: string): Promise<void>;
  removeNote(id: string): Promise<void>;
  addSource(discoveryId: string, input: { title: string; url: string; note?: string }): Promise<void>;
  toggleVerified(sourceId: string): Promise<void>;
  removeSource(sourceId: string): Promise<void>;
  exportJson(): Promise<string>;
  importJson(text: string): Promise<void>;
  wipe(): Promise<void>;
  reload(): Promise<void>;
  /** 保存を伴う操作を実行し、終わったら画面のデータを読み直す */
  mutate<T>(fn: (repo: Repository) => Promise<T>): Promise<T>;
  /** 実験分析用のAIエンドポイント（未設定なら null → ルールベース） */
  analyzeEndpoint: string | null;
  aiHeaders(): Promise<Record<string, string>>;
  /** サインインが必要なバックエンドで、まだサインインしていない */
  needsSignIn: boolean;
  userEmail: string | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
}

const C = createContext<Ctx | null>(null);
export function useLucida(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error('LucidaProvider が必要です');
  return v;
}

const ENDPOINT = import.meta.env.VITE_LUCIDA_AI_ENDPOINT;
const ANALYZE_ENDPOINT = import.meta.env.VITE_LUCIDA_ANALYZE_ENDPOINT || null;

export function LucidaProvider({ children, repoOverride }: { children: ReactNode; repoOverride?: Repository }) {
  const [repo, setRepo] = useState<Repository | null>(repoOverride ?? null);
  const [data, setData] = useState<Data>(EMPTY);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const say = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async (r: Repository) => {
    const [interests, discoveries, sources, questions, interactions, notes, prefs, usage, nodes, edges, experiments, experimentLogs] = await Promise.all([
      r.interests.list(), r.discoveries.list(), r.sources.list(), r.questions.list(), r.interactions.list(),
      r.notes.list(), getPrefs(r), r.usage.list(), r.nodes.list(), r.edges.list(), r.experiments.list(), r.experimentLogs.list(),
    ]);
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setData({ interests, discoveries, sources, questions, interactions, notes, prefs, usageToday: usage.find((u) => u.id === key)?.count ?? 0, nodes, edges, experiments, experimentLogs });
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = repoOverride ?? (await openRepository());
        // ブラウザによるデータ自動削除を避けるため、永続化を要求（拒否されても動作に影響なし）
        try { await navigator.storage?.persist?.(); } catch { /* ignore */ }
        if (r.auth) {
          const email = await r.auth.currentEmail();
          if (!alive) return;
          setUserEmail(email);
          if (!email) { setRepo(r); setNeedsSignIn(true); setReady(true); return; }
        }
        await load(r);
        if (!alive) return;
        setRepo(r);
        setReady(true);
      } catch (e) {
        console.error(e);
        if (alive) setLoadError(`データの読み込みに失敗しました: ${(e as Error).message}`);
      }
    })();
    return () => { alive = false; };
  }, [load, repoOverride]);

  const engine: Engine | null = useMemo(
    () => (repo ? createEngine({ repo, remote: ENDPOINT ? createRemoteProvider(ENDPOINT, fetch, async () => (await repo.auth?.functionHeaders()) ?? {}) : null }) : null),
    [repo],
  );

  const ctx: Ctx = useMemo(() => {
    const need = () => { if (!repo || !engine) throw new Error('not ready'); return { repo, engine }; };
    const reload = async () => { if (repo) await load(repo); };
    return {
      ready, loadError, repo, data, aiAvailable: !!ENDPOINT, toast, say, reload,
      analyzeEndpoint: ANALYZE_ENDPOINT, needsSignIn, userEmail,
      aiHeaders: async () => (await repo?.auth?.functionHeaders()) ?? {},
      async mutate(fn) { const out = await fn(need().repo); await reload(); return out; },
      async signIn(email, password) {
        const { repo } = need();
        if (!repo.auth) return;
        await repo.auth.signIn(email, password);
        setUserEmail(await repo.auth.currentEmail());
        await load(repo);
        setNeedsSignIn(false);
      },
      async signUp(email, password) {
        const { repo } = need();
        if (!repo.auth) return { needsConfirmation: false };
        const r = await repo.auth.signUp(email, password);
        if (!r.needsConfirmation) { setUserEmail(await repo.auth.currentEmail()); await load(repo); setNeedsSignIn(false); }
        return r;
      },
      async signOut() {
        const { repo } = need();
        if (!repo.auth) return;
        await repo.auth.signOut();
        setUserEmail(null); setData(EMPTY); setNeedsSignIn(true);
      },
      stateOf: (id) => deriveState(id, data.interactions),
      async react(id, kind) {
        const { repo } = need();
        await repo.interactions.put({ id: newId(), discoveryId: id, kind, createdAt: nowIso() });
        await refreshProfileSummary(repo);
        await reload();
      },
      async generate(opts) { const r = await need().engine.generate(opts); await reload(); return r; },
      async ensureToday() { const r = await need().engine.ensureToday(); if (r) await reload(); return r; },
      async addEntry(kind, raw) {
        const { repo } = need();
        const text = raw.trim();
        if (!text) throw new Error('内容を入力してください');
        const createdAt = nowIso();
        let inferred: string[] = [];
        if (kind === 'interest') {
          const exists = (await repo.interests.list()).some((i) => i.name === text);
          if (!exists) await repo.interests.put({ id: newId(), name: text, weight: 3, origin: 'manual', createdAt, updatedAt: createdAt });
        } else {
          if (kind === 'question') await repo.questions.put({ id: newId(), text, status: 'open', createdAt });
          else await repo.notes.put({ id: newId(), kind, text, tags: extractTags(text), createdAt });
          inferred = inferNewInterests(text, await repo.interests.list());
          for (const name of inferred) await repo.interests.put({ id: newId(), name, weight: 2, origin: 'inferred', createdAt, updatedAt: createdAt });
        }
        await refreshProfileSummary(repo);
        await reload();
        return { inferred };
      },
      async saveInterest(i) {
        const { repo } = need();
        const name = i.name.trim();
        if (!name) throw new Error('名前を入力してください');
        const t = nowIso();
        const prev = i.id ? await repo.interests.get(i.id) : undefined;
        await repo.interests.put({
          id: prev?.id ?? newId(), name, weight: (i.weight ?? prev?.weight ?? 3) as Interest['weight'],
          // 手動で編集したら「推定」ではなく手動扱い
          origin: 'manual', createdAt: prev?.createdAt ?? t, updatedAt: t,
        });
        await refreshProfileSummary(repo);
        await reload();
      },
      async removeInterest(id) {
        const { repo } = need();
        await repo.interests.remove(id); await removeNodeData(repo, nodeId('topic', id));
        await refreshProfileSummary(repo); await reload();
      },
      async savePrefs(p) { const { repo } = need(); await repo.preferences.put({ ...(await getPrefs(repo)), ...p, id: 'prefs' }); await reload(); },
      async setQuestionStatus(id, status) {
        const { repo } = need(); const q = await repo.questions.get(id); if (q) await repo.questions.put({ ...q, status }); await reload();
      },
      async removeQuestion(id) { const { repo } = need(); await repo.questions.remove(id); await removeNodeData(repo, nodeId('question', id)); await reload(); },
      async removeNote(id) { const { repo } = need(); await repo.notes.remove(id); await removeNodeData(repo, nodeId('insight', id)); await reload(); },
      async addSource(discoveryId, input) {
        const { repo } = need();
        const url = parseHttpUrl(input.url);
        if (!url) throw new Error('URLは http:// または https:// で始まる形式で入力してください');
        const title = input.title.trim() || url;
        await repo.sources.put({ id: newId(), discoveryId, title, url, fetchedAt: nowIso(), note: input.note?.trim() || undefined, origin: 'user', verifiedAt: nowIso() });
        await reload();
      },
      async toggleVerified(sourceId) {
        const { repo } = need(); const s = await repo.sources.get(sourceId); if (!s) return;
        await repo.sources.put({ ...s, verifiedAt: s.verifiedAt ? undefined : nowIso() });
        await reload();
      },
      async removeSource(sourceId) {
        const { repo } = need(); const s = await repo.sources.get(sourceId);
        if (s?.origin !== 'user') throw new Error('自分で追加した出典だけ削除できます');
        await repo.sources.remove(sourceId); await reload();
      },
      async exportJson() { return JSON.stringify({ app: 'lucida', version: 1, exportedAt: nowIso(), ...(await need().repo.exportAll()) }, null, 2); },
      async importJson(text) {
        const { repo } = need();
        let parsed: any;
        try { parsed = JSON.parse(text); } catch { throw new Error('JSONとして読み込めませんでした'); }
        if (parsed?.app !== 'lucida') throw new Error('LUCIDAのバックアップではありません');
        await repo.importAll(parsed);
        await reload();
      },
      async wipe() { await need().repo.clearAll(); await reload(); },
    };
  }, [ready, loadError, repo, engine, data, toast, say, load, needsSignIn, userEmail]);

  return <C.Provider value={ctx}>{children}</C.Provider>;
}
