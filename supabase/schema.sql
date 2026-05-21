-- Run in Supabase SQL Editor after creating the project.
-- Storage buckets: create "simulation-results" and "market-data" (private) in Dashboard → Storage,
-- or run the insert below for market-data.

create table if not exists public.saved_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id text not null,
  name text not null,
  simulation_name text,
  results_filename text not null,
  storage_path text not null,
  study_inputs jsonb,
  created_at timestamptz not null default now()
);

-- One row per saved CSV file (multiple runs may share simulation_name).
create unique index if not exists saved_simulations_user_project_file_idx
  on public.saved_simulations (user_id, project_id, results_filename);

create index if not exists saved_simulations_user_project_idx
  on public.saved_simulations (user_id, project_id, created_at desc);

-- Daily market-data refresh audit (written by API service role only).
create table if not exists public.market_data_refresh_log (
  id uuid primary key default gen_random_uuid(),
  dataset text not null,
  status text not null,
  message text,
  last_utc text,
  row_count integer,
  refreshed_at timestamptz not null default now()
);

create index if not exists market_data_refresh_log_refreshed_at_idx
  on public.market_data_refresh_log (refreshed_at desc);

alter table public.market_data_refresh_log enable row level security;

alter table public.saved_simulations enable row level security;

create policy "Users read own saved simulations"
  on public.saved_simulations for select
  using (auth.uid() = user_id);

create policy "Users insert own saved simulations"
  on public.saved_simulations for insert
  with check (auth.uid() = user_id);

create policy "Users delete own saved simulations"
  on public.saved_simulations for delete
  using (auth.uid() = user_id);

-- Storage policies (bucket simulation-results, private):
-- Allow authenticated users to read/write objects under their user id folder.
-- In Dashboard: Storage → simulation-results → Policies, or:

create policy "Users read own result files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'simulation-results'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users upload own result files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'simulation-results'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete own result files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'simulation-results'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Shared GB market datasets (day-ahead + PV yield). API uploads via service role only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'market-data',
  'market-data',
  false,
  52428800,
  array['text/csv', 'application/json', 'text/plain']
)
on conflict (id) do nothing;
