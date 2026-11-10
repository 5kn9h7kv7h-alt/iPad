-- Phase 3 / 4: Knowledge Network・Lab・連携・提案数の自動調整に合わせた変更。
-- アプリの camelCase は snake_case の列に対応する（src/data/supabase.ts）。

-- ---- Knowledge Network ----
alter table public.knowledge_nodes
  add column if not exists hidden boolean not null default false,
  add column if not exists pinned boolean not null default false,
  add column if not exists note text;

-- エッジの端点は「導出ノード」のID（例: topic:<興味ID>）を指す。位置を保存していない導出ノードは
-- knowledge_nodes に行がないため、外部キーは外す（存在しない端点のエッジは、アプリ側で描かない）。
alter table public.knowledge_edges drop constraint if exists knowledge_edges_source_node_fkey;
alter table public.knowledge_edges drop constraint if exists knowledge_edges_target_node_fkey;
alter table public.knowledge_edges drop constraint if exists knowledge_edges_origin_check;
update public.knowledge_edges set origin = 'ai' where origin in ('ai_suggested', 'ai_approved');
alter table public.knowledge_edges
  add constraint knowledge_edges_origin_check check (origin in ('user', 'ai', 'system')),
  add column if not exists status text not null default 'active' check (status in ('active', 'dismissed')),
  alter column relation set default '関連';
create index if not exists knowledge_edges_user_idx on public.knowledge_edges (user_id, source_node, target_node);

-- ---- Lab ----
alter table public.experiments
  add column if not exists plan text not null default '',
  add column if not exists outcome text check (outcome in ('supported', 'not_supported', 'unclear')),
  add column if not exists completed_at timestamptz,
  alter column hypothesis set default '',
  alter column ai_analysis type jsonb using ai_analysis::jsonb;
alter table public.experiments drop constraint if exists experiments_status_check;
alter table public.experiments add constraint experiments_status_check check (status in ('planned', 'running', 'done'));

alter table public.experiment_logs
  add column if not exists day date,
  add column if not exists did boolean not null default true,
  add column if not exists rating smallint check (rating between 1 and 5);
create index if not exists experiment_logs_exp_idx on public.experiment_logs (user_id, experiment_id, day);

-- ---- 連携（ファイル取り込み） ----
alter table public.notes
  add column if not exists source text check (source in ('calendar', 'study')),
  add column if not exists external_id text,
  add column if not exists imported_at timestamptz;
-- 同じ項目を二重に取り込まない
create unique index if not exists notes_external_uidx on public.notes (user_id, external_id) where external_id is not null;

-- ---- 設定 ----
alter table public.user_preferences
  add column if not exists frequency_mode text not null default 'adaptive' check (frequency_mode in ('adaptive', 'fixed')),
  add column if not exists integrations jsonb not null default '{}'::jsonb,
  add column if not exists onboarded boolean not null default false;
