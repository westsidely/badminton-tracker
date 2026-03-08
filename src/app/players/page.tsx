"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

type PlayerRow = { id: string; display_name: string };

type LeaderboardRow = { player_id: string; verified_matches: number };
type MatchRow = { challenger_id: string; opponent_id: string; winner_side: string | null; verification_status?: string };

export default function PlayersPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [playerStats, setPlayerStats] = useState<Record<string, { wins: number; losses: number; verified: number }>>({});
  const [leaderboardIds, setLeaderboardIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        setLoading(false);
        router.replace("/login");
        return;
      }
      Promise.all([
        supabase.from("players").select("id, display_name").order("display_name"),
        supabase.from("matches").select("challenger_id, opponent_id, winner_side, verification_status").eq("status", "completed"),
        supabase.rpc("get_leaderboard"),
      ]).then(([playersRes, matchesRes, lbRes]) => {
        setPlayers((playersRes.data as PlayerRow[]) ?? []);
        const matches = (matchesRes.data as MatchRow[]) ?? [];
        const stats: Record<string, { wins: number; losses: number; verified: number }> = {};
        for (const m of matches) {
          for (const pid of [m.challenger_id, m.opponent_id]) {
            if (!pid) continue;
            if (!stats[pid]) stats[pid] = { wins: 0, losses: 0, verified: 0 };
            const isLeft = m.challenger_id === pid;
            const won = (m.winner_side === "left" && isLeft) || (m.winner_side === "right" && !isLeft);
            if (won) stats[pid].wins++;
            else if (m.winner_side) stats[pid].losses++;
            if (m.verification_status === "verified") stats[pid].verified++;
          }
        }
        setPlayerStats(stats);
        const lb = (lbRes.data as { player_id: string }[]) ?? [];
        setLeaderboardIds(new Set(lb.map((r) => r.player_id)));
        setLoading(false);
      });
    });
  }, [router]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || !session) return;
    setCreating(true);
    const { error } = await supabase.from("players").insert({
      display_name: trimmed,
      created_by: session.user.id,
    });
    setCreating(false);
    if (error) return;
    setNewName("");
    const { data } = await supabase.from("players").select("id, display_name").order("display_name");
    setPlayers((data as PlayerRow[]) ?? []);
  };

  const handleUpdate = async (playerId: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    const { error } = await supabase.from("players").update({ display_name: trimmed }).eq("id", playerId);
    if (error) return;
    setEditingId(null);
    setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, display_name: trimmed } : p)));
  };

  const getPlayerNote = (playerId: string) => {
    if (leaderboardIds.has(playerId)) return "On leaderboard";
    const s = playerStats[playerId];
    if (s?.verified && s.verified > 0) return `${s.verified} verified matches`;
    return null;
  };

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
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-50">Players</h1>
          <Link href="/matches" className="text-sm text-zinc-400 underline active:text-zinc-300">
            ← Matches
          </Link>
        </div>
        <p className="mb-6 text-sm text-zinc-500">Players you create can be used as challenger or opponent in matches.</p>

        <form onSubmit={handleCreate} className="mb-6 flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New player name"
            maxLength={50}
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50 placeholder-zinc-500"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Add
          </button>
        </form>

        <ul className="space-y-2">
          {players.length === 0 && (
            <li className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-6 text-center text-sm text-zinc-500">
              No players yet. Add one above or when creating a match.
            </li>
          )}
          {players.map((p) => {
            const s = playerStats[p.id];
            const wins = s?.wins ?? 0;
            const losses = s?.losses ?? 0;
            const note = getPlayerNote(p.id);
            return (
              <li key={p.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
                {editingId === p.id ? (
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-50"
                      autoFocus
                    />
                    <div className="ml-2 flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleUpdate(p.id)}
                        className="rounded bg-zinc-600 px-2 py-1 text-xs text-zinc-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingId(null); setEditName(""); }}
                        className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/stats?player=${p.id}`}
                      className="min-w-0 flex-1 font-medium text-zinc-50 active:text-zinc-300"
                    >
                      {p.display_name}
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm text-zinc-400">{wins}–{losses}</span>
                      {note && <span className="text-xs text-zinc-500">{note}</span>}
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setEditingId(p.id); setEditName(p.display_name); }}
                        className="text-xs text-zinc-400 underline"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
