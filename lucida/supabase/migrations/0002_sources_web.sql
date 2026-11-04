-- Phase 2: 出典の管理(種類・ユーザー確認)と、外部情報(Web検索)の許可設定
alter table public.sources
  add column if not exists origin text check (origin in ('bundled','ai','user')),
  add column if not exists verified_at timestamptz;

alter table public.user_preferences
  add column if not exists web_search boolean not null default false;
