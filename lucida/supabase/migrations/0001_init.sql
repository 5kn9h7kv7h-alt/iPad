-- LUCIDA 初期スキーマ。Supabase の SQL Editor か `supabase db push` で適用する。
-- 全テーブルに user_id を持たせ、Row Level Security で本人の行だけを許可する。
-- アプリの camelCase は snake_case の列に対応する（src/data/supabase.ts）。

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  display_name text,
  timezone text default 'Asia/Tokyo',
  created_at timestamptz not null default now()
);

create table public.interests (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  weight smallint not null check (weight between 1 and 5),
  origin text not null check (origin in ('manual','inferred')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.discoveries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  source_key text not null,
  content_hash text not null,
  title text not null,
  category text not null check (category in ('Science','Technology','Society','Daily Life','Ideas','Unknown')),
  tags text[] not null default '{}',
  fact text not null,            -- 事実（出典つき）
  reasoning text not null,       -- 推測
  suggestion text not null,      -- 提案
  provenance text not null check (provenance in ('bundled','ai')),
  scores jsonb not null,         -- interest/novelty/utility/timing/diversity/total
  generated_for date not null,
  created_at timestamptz not null default now(),
  unique (user_id, content_hash) -- 重複生成の防止
);

create table public.sources (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  discovery_id text not null references public.discoveries(id) on delete cascade,
  title text not null,
  url text not null,
  fetched_at timestamptz not null,
  note text
);

create table public.questions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  text text not null,
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now()
);

create table public.interactions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  discovery_id text not null references public.discoveries(id) on delete cascade,
  kind text not null check (kind in ('like','dislike','clear_rating','save','unsave','plan','unplan')),
  created_at timestamptz not null default now()
);

-- 手動入力（アイデア・気づき・日常の記録）。仕様の表にない補助テーブル。
create table public.notes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('idea','insight','log')),
  text text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.user_preferences (
  id text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade default auth.uid(),
  daily_target int not null default 3,
  daily_limit int not null default 6,
  ai_mode text not null default 'auto' check (ai_mode in ('auto','rule')),
  profile_summary text not null default '',
  summary_updated_at text not null default ''
);

-- AIコスト対策: 日次の生成回数とレスポンスキャッシュ
create table public.ai_usage (
  id text primary key,           -- YYYY-MM-DD
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  count int not null default 0
);
create table public.ai_cache (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  value jsonb not null,
  created_at timestamptz not null default now()
);

-- Phase 3 で使う（スキーマだけ先に用意）
create table public.knowledge_nodes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  type text not null check (type in ('topic','discovery','question','insight','experiment')),
  label text not null,
  ref_id text,
  x real, y real,
  created_at timestamptz not null default now()
);
create table public.knowledge_edges (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  source_node text not null references public.knowledge_nodes(id) on delete cascade,
  target_node text not null references public.knowledge_nodes(id) on delete cascade,
  relation text,
  origin text not null default 'user' check (origin in ('user','ai_suggested','ai_approved')),
  created_at timestamptz not null default now()
);
create table public.experiments (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  hypothesis text,
  starts_on date, ends_on date,
  status text not null default 'planned',
  result text, ai_analysis text,
  discovery_id text references public.discoveries(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.experiment_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  experiment_id text not null references public.experiments(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

-- RLS: 全テーブルで「自分の行だけ」読み書き可能
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','interests','discoveries','sources','questions','interactions','notes','user_preferences',
    'ai_usage','ai_cache','knowledge_nodes','knowledge_edges','experiments','experiment_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t || '_own', t);
  end loop;
end $$;

create index on public.discoveries (user_id, generated_for);
create index on public.interactions (user_id, discovery_id, created_at);
