-- Admin vs players: separate login (admin) from player identities
-- Where: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Expect: "Success. No rows returned" (or migration messages).
-- Run after matches + profiles + verification_status exist. Backfill runs only if matches has user_id column.

-- 1) Players table: identities that can play matches (created by an admin)
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  created_by uuid references auth.users(id) on delete set null,
  unique(created_by, display_name)
);

alter table public.players enable row level security;

create policy "Authenticated can read players"
  on public.players for select to authenticated using (true);

create policy "Users can manage players they created"
  on public.players for all to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create index if not exists players_created_by_idx on public.players(created_by);

-- 2) Add new columns to matches (nullable for backfill)
alter table public.matches
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists challenger_id uuid references public.players(id) on delete restrict,
  add column if not exists opponent_id uuid references public.players(id) on delete restrict;

-- 3) Backfill: create players from existing data, then link matches (only if old columns exist)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'user_id') then
    insert into public.players (display_name, created_by)
    select coalesce(p.display_name, 'Player'), m.user_id
    from (select distinct user_id from public.matches) m
    left join public.profiles p on p.id = m.user_id
    on conflict (created_by, display_name) do nothing;

    insert into public.players (display_name, created_by)
    select distinct opponent_name, user_id from public.matches
    on conflict (created_by, display_name) do nothing;

    update public.matches m set
      created_by = m.user_id,
      challenger_id = (select id from public.players where created_by = m.user_id and display_name = coalesce((select display_name from public.profiles where id = m.user_id), 'Player') limit 1),
      opponent_id = (select id from public.players where created_by = m.user_id and display_name = m.opponent_name limit 1)
    where m.challenger_id is null and m.user_id is not null;
  end if;
end $$;

-- 4) Enforce new columns and drop old ones (skip if no user_id column)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'user_id') then
    alter table public.matches alter column created_by set not null;
    alter table public.matches alter column challenger_id set not null;
    alter table public.matches alter column opponent_id set not null;
    alter table public.matches drop column user_id;
    alter table public.matches drop column opponent_name;
  else
    alter table public.matches alter column created_by set not null;
    alter table public.matches alter column challenger_id set not null;
    alter table public.matches alter column opponent_id set not null;
  end if;
end $$;

-- 5) RLS: admin (creator) can manage their matches
drop policy if exists "Users can manage own matches" on public.matches;
create policy "Creators can manage their matches"
  on public.matches for all to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create index if not exists matches_created_by_created_at_idx on public.matches(created_by, created_at desc);
create index if not exists matches_challenger_opponent_idx on public.matches(challenger_id, opponent_id);

-- 6) Leaderboard: by player (challenger/opponent), min 20 verified matches
create or replace function public.get_leaderboard()
returns table (
  player_id uuid,
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
with match_sides as (
  select m.id, m.challenger_id as player_id, (m.winner_side = 'left') as is_win
  from public.matches m
  where m.status = 'completed' and m.verification_status = 'verified'
  union all
  select m.id, m.opponent_id as player_id, (m.winner_side = 'right') as is_win
  from public.matches m
  where m.status = 'completed' and m.verification_status = 'verified'
),
agg as (
  select
    player_id,
    count(*)::bigint as verified_matches,
    count(*) filter (where is_win)::bigint as wins,
    count(*) filter (where not is_win)::bigint as losses
  from match_sides
  group by player_id
  having count(*) >= 20
)
select
  a.player_id,
  pl.display_name,
  a.verified_matches,
  a.wins,
  a.losses,
  round((a.wins::numeric / nullif(a.verified_matches, 0)) * 100, 1) as win_pct
from agg a
join public.players pl on pl.id = a.player_id
order by win_pct desc nulls last, a.verified_matches desc;
$$;

grant execute on function public.get_leaderboard() to authenticated;
grant execute on function public.get_leaderboard() to anon;
