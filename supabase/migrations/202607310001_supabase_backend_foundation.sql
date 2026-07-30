-- Additive local-first cloud foundation. Apply manually to the intended Supabase project only.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  initials text not null check (initials ~ '^[A-Z]{1,3}$'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.finance_accounts (
  user_id uuid not null references auth.users(id) on delete cascade, id text not null, name text not null check (length(trim(name)) > 0),
  type text not null check (type in ('cash','bank','wallet','savings','other')), institution_name text, last_four_digits text check (last_four_digits is null or last_four_digits ~ '^\\d{4}$'),
  opening_balance bigint not null check (opening_balance between 0 and 100000000), is_default boolean not null, is_archived boolean not null,
  deleted_at timestamptz, created_at timestamptz not null, updated_at timestamptz not null, primary key (user_id,id)
);
create unique index if not exists finance_one_active_default_per_user on public.finance_accounts(user_id) where is_default and not is_archived and deleted_at is null;
create table if not exists public.finance_transactions (
  user_id uuid not null references auth.users(id) on delete cascade, id text not null, type text not null check (type in ('income','expense','transfer')), amount bigint not null check (amount between 1 and 100000000),
  date date not null, title text not null check (length(trim(title)) > 0), category_id text not null, account_id text not null, destination_account_id text, person_or_business text, note text,
  status text not null check (status in ('paid','received','pending','overdue','transfer')), deleted_at timestamptz, created_at timestamptz not null, updated_at timestamptz not null, primary key (user_id,id)
);
create table if not exists public.receivables (
  user_id uuid not null references auth.users(id) on delete cascade, id text not null, counterparty text not null check (length(trim(counterparty)) > 0), original_amount bigint not null check (original_amount between 1 and 100000000), received_amount bigint not null check (received_amount between 0 and original_amount), due_date date not null, note text, account_id text, deleted_at timestamptz, created_at timestamptz not null, updated_at timestamptz not null, primary key (user_id,id)
);
create table if not exists public.payables (
  user_id uuid not null references auth.users(id) on delete cascade, id text not null, counterparty text not null check (length(trim(counterparty)) > 0), original_amount bigint not null check (original_amount between 1 and 100000000), paid_amount bigint not null check (paid_amount between 0 and original_amount), due_date date not null, note text, account_id text, deleted_at timestamptz, created_at timestamptz not null, updated_at timestamptz not null, primary key (user_id,id)
);
create table if not exists public.commitments (
  user_id uuid not null references auth.users(id) on delete cascade, id text not null, label text not null check (length(trim(label)) > 0), category_id text not null, amount bigint not null check (amount between 1 and 100000000), frequency text not null check (frequency in ('weekly','monthly','quarterly','yearly','one-time')), due_date date not null, note text, account_id text, is_settled boolean not null, is_archived boolean not null, last_paid_date date, deleted_at timestamptz, created_at timestamptz not null, updated_at timestamptz not null, primary key (user_id,id)
);
alter table public.profiles enable row level security; alter table public.user_settings enable row level security; alter table public.finance_accounts enable row level security; alter table public.finance_transactions enable row level security; alter table public.receivables enable row level security; alter table public.payables enable row level security; alter table public.commitments enable row level security;
do $$ declare table_name text; begin foreach table_name in array array['profiles','user_settings','finance_accounts','finance_transactions','receivables','payables','commitments'] loop
  execute format('create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)', table_name || '_select_own', table_name);
  execute format('create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id)', table_name || '_insert_own', table_name);
  execute format('create policy %I on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', table_name || '_update_own', table_name);
  execute format('create policy %I on public.%I for delete to authenticated using (auth.uid() = user_id)', table_name || '_delete_own', table_name);
end loop; end $$;

-- Manual RLS verification (run with two authenticated test JWTs, never service-role in the browser):
-- User A: select * from public.finance_accounts; -- only A rows
-- User A: insert into public.finance_accounts(user_id,id,name,type,opening_balance,is_default,is_archived,created_at,updated_at) values ('<USER_B_UUID>','probe','Probe','cash',0,false,false,now(),now()); -- must fail RLS
-- Anonymous: select * from public.finance_accounts; -- must return no rows / permission denied
