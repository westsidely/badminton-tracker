-- Profile representation + player representation + match type / tournament
-- Where: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Expect: "Success. No rows returned"

-- 1) Profile representation (optional identity fields)
alter table public.profiles
  add column if not exists club_affiliation text,
  add column if not exists school_affiliation text,
  add column if not exists corporate_affiliation text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists represented_as text,
  add column if not exists home_venue text;

-- 2) Player representation (for display next to player names)
alter table public.players
  add column if not exists club_affiliation text,
  add column if not exists school_affiliation text,
  add column if not exists corporate_affiliation text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists represented_as text,
  add column if not exists home_venue text;

-- 3) Match type and tournament name
alter table public.matches
  add column if not exists match_type text default 'recreational' check (match_type is null or match_type in ('recreational', 'tournament')),
  add column if not exists tournament_name text;
