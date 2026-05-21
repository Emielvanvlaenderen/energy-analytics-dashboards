-- Allow multiple saved runs under the same simulation name (e.g. "test").
-- Run once in Supabase SQL Editor after 001 / base schema.

alter table public.saved_simulations
  drop constraint if exists saved_simulations_user_project_name;

alter table public.saved_simulations
  add column if not exists simulation_name text;

-- Backfill simulation name from legacy combined labels or CSV filename.
update public.saved_simulations
set simulation_name = trim(split_part(name, ' — ', 1))
where (simulation_name is null or simulation_name = '')
  and position(' — ' in name) > 0;

update public.saved_simulations
set simulation_name = split_part(replace(results_filename, '.csv', ''), '__', 1)
where simulation_name is null or simulation_name = '';

update public.saved_simulations
set simulation_name = coalesce(nullif(trim(name), ''), 'Saved run')
where simulation_name is null or simulation_name = '';

-- Keep name aligned with simulation_name for older API clients.
update public.saved_simulations
set name = simulation_name
where name <> simulation_name
  and position(' — ' in name) > 0;

create unique index if not exists saved_simulations_user_project_file_idx
  on public.saved_simulations (user_id, project_id, results_filename);
