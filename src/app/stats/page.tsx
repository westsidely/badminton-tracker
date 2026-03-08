"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";
import { toSide, type PointEntry, type PointReason } from "@/lib/scoreUtils";

const REASON_LABELS: Record<PointReason, string> = {
  winner: "Winner",
  opponent_unforced_error: "Opponent Unforced Error",
  forced_error: "Forced Error",
  service_error: "Service Error",
  lucky: "Lucky (net cord)",
};

function normalizeEntry(entry: unknown): PointEntry {
  if (typeof entry === "string") return { side: entry as "left" | "right", reason: "winner" };
  const e = entry as { side?: string; reason?: string };
  return { side: (e.side ?? "left") as "left" | "right", reason: (e.reason ?? "winner") as PointReason };
}

type MatchRow = {
  id: string;
  status: string;
  winner_side: string | null;
  score_state: { pointHistory?: unknown[] };
  verification_status?: string;
};

export default function StatsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<{ display_name: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    totalMatches: number;
    wins: number;
    losses: number;
    verifiedCount: number;
    pointsScored: number;
    pointsAllowed: number;
    byReason: Record<PointReason, number>;
  } | null>(null);

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
          .select("id, status, winner_side, score_state, verification_status")
          .eq("status", "completed"),
      ]).then(([profileRes, matchesRes]) => {
          setProfile((profileRes.data as { display_name: string | null }) ?? null);
          const rows = (matchesRes.data as MatchRow[] | null) ?? [];
          const totalMatches = rows.length;
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

          for (const m of rows) {
            if (m.winner_side === "left") wins++;
            else if (m.winner_side === "right") losses++;
            if (m.verification_status === "verified") verifiedCount++;

            const history = m.score_state?.pointHistory ?? [];
            for (const raw of history) {
              const entry = normalizeEntry(raw);
              if (entry.side === "left") {
                pointsScored++;
                byReason[entry.reason]++;
              } else {
                pointsAllowed++;
              }
            }
          }

          setStats({
            totalMatches,
            wins,
            losses,
            verifiedCount,
            pointsScored,
            pointsAllowed,
            byReason,
          });
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

  if (stats === null) return null;

  const displayName = profile?.display_name?.trim() || session.user?.email || "You";

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 pb-8">
      <div className="mx-auto max-w-sm">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-50">Stats</h1>
          <Link href="/matches" className="text-sm text-zinc-400 underline active:text-zinc-300">
            ← Matches
          </Link>
        </div>
        <p className="mb-6 text-sm text-zinc-400">{displayName}</p>

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
      </div>
    </div>
  );
}
