-- Locations (clubs/venues) + match location
-- Where: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Expect: "Success. No rows returned"

-- 1) Locations table
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.locations enable row level security;

create policy "Authenticated can read locations"
  on public.locations for select to authenticated using (true);

create policy "Users can insert locations they create"
  on public.locations for insert to authenticated
  with check (auth.uid() = created_by);

create policy "Users can update locations they created"
  on public.locations for update to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create index if not exists locations_created_by_idx on public.locations(created_by);
create index if not exists locations_name_idx on public.locations(name);

-- 2) Add location_id to matches
alter table public.matches
  add column if not exists location_id uuid references public.locations(id) on delete set null;

create index if not exists matches_location_id_idx on public.matches(location_id);
