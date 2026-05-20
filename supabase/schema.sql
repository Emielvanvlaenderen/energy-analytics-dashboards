-- Run in Supabase SQL Editor after creating the project.
-- Storage bucket: create "simulation-results" (private) in Dashboard → Storage.

create table if not exists public.saved_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id text not null,
  name text not null,
  results_filename text not null,
  storage_path text not null,
  study_inputs jsonb,
  created_at timestamptz not null default now(),
  constraint saved_simulations_user_project_name unique (user_id, project_id, name)
);

create index if not exists saved_simulations_user_project_idx
  on public.saved_simulations (user_id, project_id, created_at desc);

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
