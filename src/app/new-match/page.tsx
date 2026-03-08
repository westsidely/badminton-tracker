"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function NewMatchPage() {
  const router = useRouter();
  const [opponent, setOpponent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setChecking(false);
      if (!session) router.replace("/login");
    });
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!opponent.trim()) return;
    setLoading(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in");
      setLoading(false);
      return;
    }
    const { data, error: insertError } = await supabase
      .from("matches")
      .insert({
        user_id: user.id,
        opponent_name: opponent.trim(),
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
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="opponent" className="mb-1 block text-sm text-zinc-400">
              Opponent
            </label>
            <input
              id="opponent"
              type="text"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="Name"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50 placeholder-zinc-500"
              autoComplete="off"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-emerald-600 py-2.5 text-sm font-medium text-white disabled:opacity-70"
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
