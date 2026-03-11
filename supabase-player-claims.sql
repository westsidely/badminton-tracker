-- Player claim / identity verification: one claim per player, pending until admin approves
-- Where: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Expect: "Success. No rows returned"

-- 1) One claim record per player (latest request; admin approves or rejects)
create table if not exists public.player_claims (
  player_id uuid primary key references public.players(id) on delete cascade,
  claimed_by uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'rejected')) default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null
);

comment on table public.player_claims is 'User claims to player profiles; approved = claimed, pending = awaiting admin, rejected = unclaimed.';

-- 2) RLS: anyone authenticated can read; users can submit their own claim; only player creator can approve/reject
alter table public.player_claims enable row level security;

create policy "Authenticated can read player_claims"
  on public.player_claims for select to authenticated using (true);

create policy "Users can insert own claim (pending)"
  on public.player_claims for insert to authenticated
  with check (auth.uid() = claimed_by and status = 'pending');

create policy "Users can delete own pending claim (withdraw)"
  on public.player_claims for delete to authenticated
  using (auth.uid() = claimed_by and status = 'pending');

-- Only the player's creator (admin) can set status to approved/rejected
create policy "Player creator can decide claim"
  on public.player_claims for update to authenticated
  using (
    auth.uid() = (select p.created_by from public.players p where p.id = player_id)
  )
  with check (true);

-- Allow upsert: user claims -> insert; re-claim after reject -> update to pending (handled by policy: user can update own pending; for rejected we need to allow insert again or update. Currently one row per player, so after reject the row exists. So we need "user can update row to set status=pending and claimed_by=self when current status=rejected" OR we allow delete of rejected by the claimer so they can re-claim with a new insert. Simpler: on conflict (player_id) do update set claimed_by = excluded.claimed_by, status = 'pending', created_at = now(). So the insert policy must allow only pending. For "re-claim after reject": we need update policy that allows the user who had claimed (or any user?) to set status back to pending. Actually the requirement says "pending until approved" and "approve or reject". So after reject, the state is "rejected". To claim again, the same or another user could request. So we need: either (1) allow update where status = 'rejected' to set status = 'pending', claimed_by = auth.uid(), or (2) allow delete of rejected rows so user can insert again. Option (1) needs a policy: update allowed when (status = 'rejected') and (claimed_by = auth.uid() or we allow any user to take over a rejected claim). I'll allow update when status = 'rejected' to set status = 'pending' and claimed_by = auth.uid() - so only the same user can re-request. Actually "any user can claim" - so after reject, any user could claim. So we need: update allowed when status = 'rejected' (any authenticated user can take over the row and set claimed_by = self, status = 'pending'). So policy: "Users can update rejected claims to re-claim" using (status = 'rejected') with check (claimed_by = auth.uid() and status = 'pending'). So we have two update policies for insert... no, we have two UPDATE policies. Postgres allows multiple policies with OR. So:
-- Policy 1: User can update own pending claim (with check claimed_by = auth.uid())
-- Policy 2: Player creator can decide claim (set approved/rejected)
-- Policy 3: Any authenticated can update a rejected row to set claimed_by = self, status = pending

create policy "Users can re-claim rejected profile"
  on public.player_claims for update to authenticated
  using (status = 'rejected')
  with check (claimed_by = auth.uid() and status = 'pending');

-- 3) Index for listing claims by status / creator
create index if not exists player_claims_status_idx on public.player_claims(status);
create index if not exists player_claims_claimed_by_idx on public.player_claims(claimed_by);
