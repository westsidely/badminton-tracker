-- Match format and doubles: add format + second player per side
-- Where: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Expect: "Success. No rows returned" (or success). Existing matches keep match_format null (treated as singles in app).

-- 1) Add match_format: Men's/Women's Singles, Men's/Women's Doubles, Mixed Doubles
alter table public.matches
  add column if not exists match_format text
  check (match_format is null or match_format in (
    'mens_singles', 'womens_singles',
    'mens_doubles', 'womens_doubles', 'mixed_doubles'
  ));

comment on column public.matches.match_format is 'Format: mens_singles, womens_singles, mens_doubles, womens_doubles, mixed_doubles. Null = legacy singles.';

-- 2) Second player per side (for doubles)
alter table public.matches
  add column if not exists challenger_2_id uuid references public.players(id) on delete restrict,
  add column if not exists opponent_2_id uuid references public.players(id) on delete restrict;

comment on column public.matches.challenger_2_id is 'Second player on challenger/left side (doubles only).';
comment on column public.matches.opponent_2_id is 'Second player on opponent/right side (doubles only).';

-- No backfill: existing rows stay singles (match_format null, challenger_2_id/opponent_2_id null).
