"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";
import { deriveScore, type PointSide } from "@/lib/scoreUtils";

type MatchRow = {
  id: string;
  status: string;
  created_at: string;
  score_state: { pointHistory: PointSide[] };
  verification_status?: string;
  challenger: { display_name: string }[];
  opponent: { display_name: string }[];
};

export default function MatchesPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<{ display_name: string | null } | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        setLoading(false);
        router.replace("/login");
        return;
      }
      Promise.all([
        supabase.from("profiles").select("display_name").eq("id", session.user.id).single(),
        supabase
          .from("matches")
          .select("id, status, created_at, score_state, verification_status, challenger:players!challenger_id(display_name), opponent:players!opponent_id(display_name)")
          .order("created_at", { ascending: false }),
      ]).then(([profileRes, matchesRes]) => {
        setProfile((profileRes.data as { display_name: string | null }) ?? null);
        setMatches((matchesRes.data as MatchRow[]) ?? []);
        setLoading(false);
      });
    });
  }, [router]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-zinc-400">Loading…</p>
      </div>
    );
  }

  const displayName = profile?.display_name?.trim() || session.user?.email || "Signed in";

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 pb-8">
      <div className="mx-auto max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-zinc-50">Matches</h1>
        <p className="mb-6 text-sm text-zinc-400">{displayName}</p>

        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            href="/new-match"
            className="flex-1 min-w-[120px] rounded-full bg-emerald-600 py-3 text-center text-sm font-medium text-white active:bg-emerald-500"
          >
            New match
          </Link>
          <Link
            href="/stats"
            className="rounded-full border border-zinc-600 px-4 py-3 text-sm font-medium text-zinc-300 active:bg-zinc-800"
          >
            Stats
          </Link>
          <Link
            href="/leaderboard"
            className="rounded-full border border-zinc-600 px-4 py-3 text-sm font-medium text-zinc-300 active:bg-zinc-800"
          >
            Leaderboard
          </Link>
          <Link
            href="/profile"
            className="rounded-full border border-zinc-600 px-4 py-3 text-sm font-medium text-zinc-300 active:bg-zinc-800"
          >
            Profile
          </Link>
        </div>

        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Your matches</h2>
        <ul className="space-y-2">
          {matches.length === 0 && (
            <li className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-6 text-center text-sm text-zinc-500">
              No matches yet. Tap <strong className="text-zinc-400">New match</strong> to start tracking.
            </li>
          )}
          {matches.map((m) => {
            const derived = deriveScore(m.score_state?.pointHistory ?? []);
            const scoreStr = derived.games.length > 0
              ? derived.games.map((g) => `${g.left}-${g.right}`).join(", ") +
                (derived.games.length < 3 && !derived.matchOver
                  ? ` (${derived.currentGame.left}-${derived.currentGame.right})`
                  : "")
              : "0-0";
            return (
              <li key={m.id}>
                <Link
                  href={`/match/${m.id}`}
                  className="block rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-zinc-50 active:bg-zinc-800"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.challenger?.[0]?.display_name ?? "?"} vs {m.opponent?.[0]?.display_name ?? "?"}</span>
                    {m.status !== "completed" && (
                      <span className="rounded bg-emerald-600/90 px-1.5 py-0.5 text-xs font-medium text-white">LIVE</span>
                    )}
                  </div>
                  <span className="mt-1 block text-sm text-zinc-400">
                    {scoreStr}
                    {m.status === "completed" && " ✓"}
                    {m.status === "completed" && m.verification_status === "verified" && (
                      <span className="ml-1 text-emerald-500">· Verified</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
