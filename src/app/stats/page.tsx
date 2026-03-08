"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";
import { normalizeEntry, type PointReason } from "@/lib/scoreUtils";

const REASON_LABELS: Record<PointReason, string> = {
  winner: "Winner",
  opponent_unforced_error: "Opponent Unforced Error",
  forced_error: "Forced Error",
  service_error: "Service Error",
  lucky: "Lucky (net cord)",
};

type MatchRow = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: string;
  winner_side: string | null;
  score_state: { pointHistory?: unknown[] };
  verification_status?: string;
};

type PlayerOption = { id: string; display_name: string };

export default function StatsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<{ display_name: string | null } | null>(null);
  const [playerOptions, setPlayerOptions] = useState<PlayerOption[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
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
        supabase.from("matches").select("id, challenger_id, opponent_id, status, winner_side, score_state, verification_status").eq("status", "completed"),
      ]).then(async ([profileRes, matchesRes]) => {
        setProfile((profileRes.data as { display_name: string | null }) ?? null);
        const rows = (matchesRes.data as MatchRow[] | null) ?? [];
        setMatches(rows);
        const playerIds = new Set<string>();
        rows.forEach((m) => {
          playerIds.add(m.challenger_id);
          playerIds.add(m.opponent_id);
        });
        if (playerIds.size > 0) {
          const { data: playerData } = await supabase.from("players").select("id, display_name").in("id", [...playerIds]);
          const opts = (playerData as PlayerOption[]) ?? [];
          setPlayerOptions(opts);
          if (opts[0]) setSelectedPlayerId(opts[0].id);
        }
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

  const displayName = profile?.display_name?.trim() || session.user?.email || "You";
  const selectedPlayer = playerOptions.find((p) => p.id === selectedPlayerId);

  const playerMatches = selectedPlayerId
    ? matches.filter((m) => m.challenger_id === selectedPlayerId || m.opponent_id === selectedPlayerId)
    : [];
  let totalMatches = 0;
  let wins = 0;
  let losses = 0;
  let verifiedCount = 0;
  let pointsScored = 0;
  let pointsAllowed = 0;
  const byReason: Record<PointReason, number> = {
    winner: 0,
    opponent_unforced_error: 0,
    forced_error: 0,
    service_error: 0,
    lucky: 0,
  };

  for (const m of playerMatches) {
    if (m.status !== "completed") continue;
    totalMatches++;
    if (m.verification_status === "verified") verifiedCount++;
    const isChallenger = m.challenger_id === selectedPlayerId;
    if (m.winner_side === "left" && isChallenger) wins++;
    else if (m.winner_side === "right" && !isChallenger) wins++;
    else if (m.winner_side) losses++;

    const history = m.score_state?.pointHistory ?? [];
    for (const raw of history) {
      const entry = normalizeEntry(raw);
      const pointIsForPlayer = (entry.side === "left" && isChallenger) || (entry.side === "right" && !isChallenger);
      if (pointIsForPlayer) {
        pointsScored++;
        byReason[entry.reason]++;
      } else {
        pointsAllowed++;
      }
    }
  }

  const stats = {
    totalMatches,
    wins,
    losses,
    verifiedCount,
    pointsScored,
    pointsAllowed,
    byReason,
  };

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 pb-8">
      <div className="mx-auto max-w-sm">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-50">Stats</h1>
          <Link href="/matches" className="text-sm text-zinc-400 underline active:text-zinc-300">
            ← Matches
          </Link>
        </div>
        <p className="mb-4 text-sm text-zinc-400">{displayName}</p>

        <div className="mb-6">
          <label className="mb-2 block text-xs font-medium text-zinc-500">View stats for</label>
          <select
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50"
          >
            {playerOptions.length === 0 && <option value="">No players in matches yet</option>}
            {playerOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
        </div>

        {playerOptions.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-6 text-center text-sm text-zinc-500">
            Complete matches to see stats per player.
          </p>
        ) : (
          <>
            {selectedPlayer && (
              <p className="mb-6 text-sm text-zinc-500">Stats for <strong className="text-zinc-400">{selectedPlayer.display_name}</strong></p>
            )}
            <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Record</h2>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-semibold text-zinc-50">{stats.totalMatches}</p>
                  <p className="text-xs text-zinc-500">matches</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-emerald-400">{stats.wins}</p>
                  <p className="text-xs text-zinc-500">wins</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-red-400/90">{stats.losses}</p>
                  <p className="text-xs text-zinc-500">losses</p>
                </div>
              </div>
              {stats.verifiedCount > 0 && (
                <p className="mt-2 text-center text-xs text-zinc-500">
                  <span className="text-emerald-500">{stats.verifiedCount} verified</span>
                </p>
              )}
            </section>

            <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Points</h2>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Scored</span>
                <span className="font-medium text-zinc-50">{stats.pointsScored}</span>
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-zinc-400">Allowed</span>
                <span className="font-medium text-zinc-50">{stats.pointsAllowed}</span>
              </div>
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Points by reason</h2>
              <ul className="space-y-2">
                {(Object.keys(REASON_LABELS) as PointReason[]).map((reason) => (
                  <li key={reason} className="flex justify-between text-sm">
                    <span className="text-zinc-400">{REASON_LABELS[reason]}</span>
                    <span className="font-medium text-zinc-50">{stats.byReason[reason]}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
