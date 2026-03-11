-- Leaderboard: include doubles partners (challenger_2_id, opponent_2_id) for participation and wins/losses
-- Where: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Expect: "Success. No rows returned"

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
  -- Left side: primary
  select m.id, m.challenger_id as player_id, (m.winner_side = 'left') as is_win
  from public.matches m
  where m.status = 'completed' and m.verification_status = 'verified'
  union all
  -- Left side: doubles partner
  select m.id, m.challenger_2_id as player_id, (m.winner_side = 'left') as is_win
  from public.matches m
  where m.status = 'completed' and m.verification_status = 'verified' and m.challenger_2_id is not null
  union all
  -- Right side: primary
  select m.id, m.opponent_id as player_id, (m.winner_side = 'right') as is_win
  from public.matches m
  where m.status = 'completed' and m.verification_status = 'verified'
  union all
  -- Right side: doubles partner
  select m.id, m.opponent_2_id as player_id, (m.winner_side = 'right') as is_win
  from public.matches m
  where m.status = 'completed' and m.verification_status = 'verified' and m.opponent_2_id is not null
),
agg as (
  select
    player_id,
    count(*)::bigint as verified_matches,
    count(*) filter (where is_win)::bigint as wins,
    count(*) filter (where not is_win)::bigint as losses
  from match_sides
  group by player_id
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
order by win_pct desc nulls last, a.verified_matches desc
limit 10;
$$;

grant execute on function public.get_leaderboard() to authenticated;
grant execute on function public.get_leaderboard() to anon;
