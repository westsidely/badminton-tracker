-- Badminton tracker: matches table (v1 minimal)
-- Run this in Supabase SQL Editor once.

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opponent_name text not null,
  created_at timestamptz not null default now(),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  score_state jsonb not null default '{"pointHistory":[]}',
  winner_side text check (winner_side is null or winner_side in ('left', 'right'))
);

alter table public.matches enable row level security;

create policy "Users can manage own matches"
  on public.matches
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists matches_user_id_created_at_idx
  on public.matches (user_id, created_at desc);
