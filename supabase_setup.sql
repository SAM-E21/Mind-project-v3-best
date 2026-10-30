-- Run in the Supabase SQL editor for the project used by this app.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null default 'Personal',
  due_date date,
  priority text not null default 'Normal' check (priority in ('Baja', 'Normal', 'Alta')),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.vault_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);

create table if not exists public.vault_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  salt text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.vault_credential (
  user_id uuid primary key references auth.users(id) on delete cascade,
  verifier text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.vault_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failure_count integer not null default 0 check (failure_count between 0 and 4),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.vault_login_attempts (
  attempt_key text primary key,
  failure_count integer not null default 0 check (failure_count between 0 and 5),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.vault_objects (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  metadata_cipher text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.vault_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.vault_conversations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload_cipher text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;
alter table public.vault_access enable row level security;
alter table public.vault_config enable row level security;
alter table public.vault_credential enable row level security;
alter table public.vault_attempts enable row level security;
alter table public.vault_login_attempts enable row level security;
alter table public.vault_objects enable row level security;
alter table public.vault_sessions enable row level security;
alter table public.vault_conversations enable row level security;

grant select, insert, update, delete on public.tasks to authenticated;
grant select on public.vault_access, public.vault_config to authenticated;
grant select, insert, update, delete on public.vault_objects to authenticated;
grant select, insert, update, delete on public.vault_conversations to authenticated;

drop policy if exists "Users manage own tasks" on public.tasks;
create policy "Users manage own tasks" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users read own vault access" on public.vault_access;
create policy "Users read own vault access" on public.vault_access
  for select using (auth.uid() = user_id);

drop policy if exists "Users read own vault config" on public.vault_config;
create policy "Users read own vault config" on public.vault_config
  for select using (
    auth.uid() = user_id and exists (
      select 1 from public.vault_access where user_id = auth.uid()
    )
  );

drop policy if exists "Users manage own vault metadata" on public.vault_objects;
create policy "Users manage own vault metadata" on public.vault_objects
  for all using (
    auth.uid() = user_id and exists (
      select 1 from public.vault_access where user_id = auth.uid()
    )
  ) with check (
    auth.uid() = user_id and exists (
      select 1 from public.vault_access where user_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public)
values ('vault', 'vault', false)
on conflict (id) do update set public = false;

drop policy if exists "Users read own vault blobs" on storage.objects;
create policy "Users read own vault blobs" on storage.objects
  for select using (
    bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.vault_access where user_id = auth.uid())
  );

drop policy if exists "Users upload own vault blobs" on storage.objects;
create policy "Users upload own vault blobs" on storage.objects
  for insert with check (
    bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.vault_access where user_id = auth.uid())
  );

drop policy if exists "Users delete own vault blobs" on storage.objects;
create policy "Users delete own vault blobs" on storage.objects
  for delete using (
    bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.vault_access where user_id = auth.uid())
  );

drop policy if exists "Users manage own encrypted conversations" on public.vault_conversations;
create policy "Users manage own encrypted conversations" on public.vault_conversations
  for all using (
    auth.uid() = user_id and exists (
      select 1 from public.vault_access where user_id = auth.uid()
    )
  ) with check (
    auth.uid() = user_id and exists (
      select 1 from public.vault_access where user_id = auth.uid()
    )
  );