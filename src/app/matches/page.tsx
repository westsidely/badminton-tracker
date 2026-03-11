"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";
import { deriveScore, type PointSide } from "@/lib/scoreUtils";
import { getTeamDisplayName, getPlayerRepresentationLabel } from "@/lib/playerDisplay";
import { getLocationName } from "@/lib/locationDisplay";

type MatchRow = {
  id: string;
  status: string;
  created_at: string;
  score_state: { pointHistory: PointSide[] };
  verification_status?: string;
  end_reason?: string | null;
  winner_side?: string | null;
  match_type?: string | null;
  tournament_name?: string | null;
  challenger_id?: string;
  opponent_id?: string;
  challenger_2_id?: string | null;
  opponent_2_id?: string | null;
  challenger?: unknown;
  opponent?: unknown;
  challenger_2?: unknown;
  opponent_2?: unknown;
  location_id?: string | null;
  location?: { name: string }[];
};

const EARLY_END_LABELS: Record<string, string> = {
  opponent_retired: "Retired",
  win_by_default: "Default",
  technical_other: "Technical",
};

type SortOrder = "recent" | "oldest";
type StatusFilter = "all" | "live" | "completed" | "verified";
type ResultFilter = "all" | "wins" | "losses";

function formatMatchDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export default function MatchesPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<{ display_name: string | null } | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("recent");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        setLoading(false);
        router.replace("/login");
        return;
      }
      setMatchesError(null);
      Promise.all([
        supabase.from("profiles").select("display_name").eq("id", session.user.id).single(),
        supabase
          .from("matches")
          .select("id, status, created_at, score_state, verification_status, end_reason, winner_side, challenger_id, opponent_id, challenger_2_id, opponent_2_id, location_id, match_type, tournament_name, challenger:players!challenger_id(display_name, represented_as, club_affiliation, school_affiliation, corporate_affiliation, city, country), opponent:players!opponent_id(display_name, represented_as, club_affiliation, school_affiliation, corporate_affiliation, city, country), challenger_2:players!challenger_2_id(display_name, represented_as, club_affiliation, school_affiliation, corporate_affiliation, city, country), opponent_2:players!opponent_2_id(display_name, represented_as, club_affiliation, school_affiliation, corporate_affiliation, city, country), location:locations!location_id(name)")
          .order("created_at", { ascending: false }),
      ]).then(([profileRes, matchesRes]) => {
        setProfile((profileRes.data as { display_name: string | null }) ?? null);
        if (matchesRes.error) {
          setMatchesError(matchesRes.error.message);
          setMatches([]);
        } else {
          const data = matchesRes.data;
          const list = Array.isArray(data) ? data.filter((m) => m != null && typeof m === "object" && typeof (m as Record<string, unknown>).id === "string") : [];
          setMatches(list as MatchRow[]);
        }
        setLoading(false);
      }).catch((err) => {
        setMatchesError(err?.message ?? "Failed to load matches");
        setMatches([]);
        setLoading(false);
      });
    });
  }, [router]);

  const filteredMatches = useMemo(() => {
    let list = [...matches];
    if (statusFilter === "live") list = list.filter((m) => m.status === "in_progress");
    else if (statusFilter === "completed") list = list.filter((m) => m.status === "completed");
    else if (statusFilter === "verified") list = list.filter((m) => m.status === "completed" && m.verification_status === "verified");
    if (resultFilter === "wins") list = list.filter((m) => m.status === "completed" && m.winner_side === "left");
    else if (resultFilter === "losses") list = list.filter((m) => m.status === "completed" && m.winner_side === "right");
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((m) => {
        const challenger = getTeamDisplayName(m.challenger, m.challenger_id, m.challenger_2, m.challenger_2_id).toLowerCase();
        const opponent = getTeamDisplayName(m.opponent, m.opponent_id, m.opponent_2, m.opponent_2_id).toLowerCase();
        const dateStr = formatMatchDate(m.created_at).toLowerCase();
        const locationName = (getLocationName(m.location) ?? "").toLowerCase();
        const tournament = (m.tournament_name ?? "").toLowerCase();
        return (
          challenger.includes(q) ||
          opponent.includes(q) ||
          dateStr.includes(q) ||
          locationName.includes(q) ||
          tournament.includes(q)
        );
      });
    }
    if (sortOrder === "oldest") list.reverse();
    return list;
  }, [matches, sortOrder, statusFilter, resultFilter, searchQuery]);

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
          <Link
            href="/players"
            className="rounded-full border border-zinc-600 px-4 py-3 text-sm font-medium text-zinc-300 active:bg-zinc-800"
          >
            Players / Teams
          </Link>
        </div>

        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Your matches</h2>
        {matchesError && (
          <p className="mb-2 rounded-lg border border-amber-800 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
            Could not load matches: {matchesError}
          </p>
        )}
        <div className="mb-3 space-y-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by player, date, location, tournament"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder-zinc-500"
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-50"
            >
              <option value="recent">Most recent</option>
              <option value="oldest">Oldest</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-50"
            >
              <option value="all">All</option>
              <option value="live">Live</option>
              <option value="completed">Completed</option>
              <option value="verified">Verified</option>
            </select>
            <select
              value={resultFilter}
              onChange={(e) => setResultFilter(e.target.value as ResultFilter)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-50"
            >
              <option value="all">All</option>
              <option value="wins">Wins (challenger)</option>
              <option value="losses">Losses (opponent)</option>
            </select>
          </div>
        </div>
        <ul className="space-y-2">
          {matches.length === 0 && !matchesError && (
            <li className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-6 text-center text-sm text-zinc-500">
              No matches yet. Tap <strong className="text-zinc-400">New match</strong> to start tracking.
            </li>
          )}
          {filteredMatches.length === 0 && matches.length > 0 && !matchesError && (
            <li className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-4 text-center text-sm text-zinc-500">
              No matches match the current filters or search.
            </li>
          )}
          {filteredMatches.map((m) => {
            const derived = deriveScore(m.score_state?.pointHistory ?? []);
            const locationName = getLocationName(m.location);
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
                    <span className="font-medium">
                      {getTeamDisplayName(m.challenger, m.challenger_id, m.challenger_2, m.challenger_2_id)}
                      {!m.challenger_2_id && getPlayerRepresentationLabel(m.challenger) && (
                        <span className="ml-1 text-xs font-normal text-zinc-400">({getPlayerRepresentationLabel(m.challenger)})</span>
                      )}{" "}
                      vs{" "}
                      {getTeamDisplayName(m.opponent, m.opponent_id, m.opponent_2, m.opponent_2_id)}
                      {!m.opponent_2_id && getPlayerRepresentationLabel(m.opponent) && (
                        <span className="ml-1 text-xs font-normal text-zinc-400">({getPlayerRepresentationLabel(m.opponent)})</span>
                      )}
                    </span>
                    {m.status !== "completed" && (
                      <span className="rounded bg-emerald-600/90 px-1.5 py-0.5 text-xs font-medium text-white">LIVE</span>
                    )}
                    {m.status === "completed" && m.end_reason && m.end_reason !== "completed_normally" && (
                      <span className="rounded bg-amber-600/80 px-1.5 py-0.5 text-xs font-medium text-white">
                        {EARLY_END_LABELS[m.end_reason] ?? "Early end"}
                      </span>
                    )}
                  </div>
                  <span className="mt-1 block text-sm text-zinc-400">
                    {scoreStr}
                    {m.status === "completed" && " ✓"}
                    {m.status === "completed" && m.verification_status === "verified" && (
                      <span className="ml-1 text-emerald-500">· Verified</span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {m.match_type === "tournament"
                      ? `Tournament${m.tournament_name?.trim() ? ` · ${m.tournament_name.trim()}` : " · Tournament match"}${locationName ? ` · ${locationName}` : ""}`
                      : `Recreational${locationName ? ` · ${locationName}` : ""}`}
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
