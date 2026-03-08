"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Player = { id: string; display_name: string };

export default function NewMatchPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [challengerId, setChallengerId] = useState("");
  const [opponentId, setOpponentId] = useState("");
  const [newChallengerName, setNewChallengerName] = useState("");
  const [newOpponentName, setNewOpponentName] = useState("");
  const [useNewChallenger, setUseNewChallenger] = useState(false);
  const [useNewOpponent, setUseNewOpponent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setChecking(false);
      if (!session) router.replace("/login");
    });
  }, [router]);

  useEffect(() => {
    if (checking) return;
    supabase
      .from("players")
      .select("id, display_name")
      .order("display_name")
      .then(({ data }) => setPlayers((data as Player[]) ?? []));
  }, [checking]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in");
      return;
    }

    let cId = challengerId;
    let oId = opponentId;

    if (useNewChallenger && newChallengerName.trim()) {
      const { data: newPlayer, error: insertErr } = await supabase
        .from("players")
        .insert({ display_name: newChallengerName.trim(), created_by: user.id })
        .select("id")
        .single();
      if (insertErr) {
        setError(insertErr.message);
        return;
      }
      cId = newPlayer!.id;
    }
    if (useNewOpponent && newOpponentName.trim()) {
      const { data: newPlayer, error: insertErr } = await supabase
        .from("players")
        .insert({ display_name: newOpponentName.trim(), created_by: user.id })
        .select("id")
        .single();
      if (insertErr) {
        setError(insertErr.message);
        return;
      }
      oId = newPlayer!.id;
    }

    if (!cId || !oId) {
      setError("Select or enter challenger and opponent");
      return;
    }
    if (cId === oId) {
      setError("Challenger and opponent must be different");
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("matches")
      .insert({
        created_by: user.id,
        challenger_id: cId,
        opponent_id: oId,
        status: "in_progress",
        score_state: { pointHistory: [] },
      })
      .select("id")
      .single();
    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }
    if (data?.id) router.replace(`/match/${data.id}`);
    else setLoading(false);
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-zinc-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6">
      <div className="mx-auto max-w-sm">
        <h1 className="mb-6 text-xl font-semibold text-zinc-50">New match</h1>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-400">Challenger</label>
            {!useNewChallenger ? (
              <div className="space-y-2">
                <select
                  value={challengerId}
                  onChange={(e) => setChallengerId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50"
                >
                  <option value="">Select player</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>{p.display_name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setUseNewChallenger(true)} className="text-xs text-zinc-500 underline">
                  Or add new player
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newChallengerName}
                  onChange={(e) => setNewChallengerName(e.target.value)}
                  placeholder="New challenger name"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50 placeholder-zinc-500"
                />
                <button type="button" onClick={() => setUseNewChallenger(false)} className="text-xs text-zinc-500 underline">
                  Choose existing
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-400">Opponent</label>
            {!useNewOpponent ? (
              <div className="space-y-2">
                <select
                  value={opponentId}
                  onChange={(e) => setOpponentId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50"
                >
                  <option value="">Select player</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>{p.display_name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setUseNewOpponent(true)} className="text-xs text-zinc-500 underline">
                  Or add new player
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newOpponentName}
                  onChange={(e) => setNewOpponentName(e.target.value)}
                  placeholder="New opponent name"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50 placeholder-zinc-500"
                />
                <button type="button" onClick={() => setUseNewOpponent(false)} className="text-xs text-zinc-500 underline">
                  Choose existing
                </button>
              </div>
            )}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-emerald-600 py-3 text-sm font-medium text-white disabled:opacity-70"
          >
            {loading ? "Creating…" : "Start match"}
          </button>
        </form>
        <p className="mt-6 text-center">
          <Link href="/matches" className="text-sm text-zinc-400 underline">← Back to matches</Link>
        </p>
      </div>
    </div>
  );
}
