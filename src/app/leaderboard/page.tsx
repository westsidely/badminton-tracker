"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

type LeaderboardRow = {
  user_id: string;
  display_name: string | null;
  verified_matches: number;
  wins: number;
  losses: number;
  win_pct: number;
};

export default function LeaderboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        setLoading(false);
        router.replace("/login");
        return;
      }
      supabase
        .rpc("get_leaderboard")
        .then(({ data, error }) => {
          setRows((data as LeaderboardRow[]) ?? []);
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

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 pb-8">
      <div className="mx-auto max-w-sm">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-50">Leaderboard</h1>
          <Link href="/matches" className="text-sm text-zinc-400 underline active:text-zinc-300">
            ← Matches
          </Link>
        </div>
        <p className="mb-6 text-sm text-zinc-500">
          Min 20 verified matches. Ranked by win %.
        </p>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-6 text-center text-sm text-zinc-500">
            No players with 20+ verified matches yet. Complete and verify matches to appear here.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li
                key={r.user_id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-3"
              >
                <div className="flex items-center justify-between">
                  <span className="w-6 text-sm font-semibold text-zinc-400">#{i + 1}</span>
                  <span className="text-sm font-medium text-zinc-50">
                    {r.display_name?.trim() || `Player ${i + 1}`}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-emerald-400 font-medium">{r.win_pct}%</span>
                  <span className="text-zinc-400">{r.wins}–{r.losses}</span>
                  <span className="text-zinc-500">{r.verified_matches} verified matches</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
