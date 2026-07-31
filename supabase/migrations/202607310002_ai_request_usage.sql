-- Additive. Adds only the AI rate-limit ledger. No existing table, column, policy,
-- or row is altered or dropped. Apply manually to the intended Supabase project only.
create table if not exists public.ai_request_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  intent text not null check (length(trim(intent)) > 0 and length(intent) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists ai_request_usage_user_time on public.ai_request_usage(user_id, created_at desc);

alter table public.ai_request_usage enable row level security;

-- Owner-only read so a user can see their own usage. No client insert, update, or
-- delete policy exists: only the Edge Function's service role writes this ledger,
-- so the rate limit cannot be cleared or forged from the browser.
create policy ai_request_usage_select_own on public.ai_request_usage
  for select to authenticated using (auth.uid() = user_id);

-- Manual RLS verification (run with two authenticated test JWTs, never service-role in the browser):
-- User A: select * from public.ai_request_usage; -- only A rows
-- User A: insert into public.ai_request_usage(user_id,intent) values (auth.uid(),'probe'); -- must fail RLS
-- User A: delete from public.ai_request_usage; -- must fail RLS
-- Anonymous: select * from public.ai_request_usage; -- must return no rows / permission denied
