-- Verification status for matches (run once in Supabase SQL Editor)
-- Where: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Expect: "Success. No rows returned"

alter table public.matches
  add column if not exists verification_status text not null default 'unverified'
  check (verification_status in ('unverified', 'pending', 'verified'));
