-- Match end reason for normal vs early finish
-- Where: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Expect: "Success. No rows returned"

alter table public.matches
  add column if not exists end_reason text check (
    end_reason is null
    or end_reason in ('completed_normally', 'opponent_retired', 'win_by_default', 'technical_other')
  );
