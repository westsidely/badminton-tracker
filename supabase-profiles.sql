-- Profiles: display_name for each user
-- Where: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Expect: "Success. No rows returned"

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text
);

alter table public.profiles enable row level security;

create policy "Anyone can read profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Update leaderboard function to return display_name
create or replace function public.get_leaderboard()
returns table (
  user_id uuid,
  display_name text,
  verified_matches bigint,
  wins bigint,
  losses bigint,
  win_pct numeric
)
language sql
security definer
set search_path = public
as $$
  select
    m.user_id,
    p.display_name,
    count(*)::bigint as verified_matches,
    count(*) filter (where m.winner_side = 'left')::bigint as wins,
    count(*) filter (where m.winner_side = 'right')::bigint as losses,
    round((count(*) filter (where m.winner_side = 'left')::numeric / nullif(count(*), 0)) * 100, 1) as win_pct
  from public.matches m
  left join public.profiles p on p.id = m.user_id
  where m.status = 'completed' and m.verification_status = 'verified'
  group by m.user_id, p.display_name
  having count(*) >= 20
  order by win_pct desc nulls last, verified_matches desc;
$$;
