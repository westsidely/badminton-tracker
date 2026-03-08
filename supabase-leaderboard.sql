-- Leaderboard: users with >= 20 verified matches, ranked by win %
-- Where: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Expect: "Success. No rows returned"

create or replace function public.get_leaderboard()
returns table (
  user_id uuid,
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
    count(*)::bigint as verified_matches,
    count(*) filter (where m.winner_side = 'left')::bigint as wins,
    count(*) filter (where m.winner_side = 'right')::bigint as losses,
    round((count(*) filter (where m.winner_side = 'left')::numeric / nullif(count(*), 0)) * 100, 1) as win_pct
  from public.matches m
  where m.status = 'completed' and m.verification_status = 'verified'
  group by m.user_id
  having count(*) >= 20
  order by win_pct desc nulls last, verified_matches desc;
$$;

grant execute on function public.get_leaderboard() to authenticated;
grant execute on function public.get_leaderboard() to anon;
