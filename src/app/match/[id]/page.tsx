"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { deriveScore, buildCurrentGameProgression, normalizeEntry, prefixCompletedGames, validateGameScore, type PointEntry, type PointReason, type PointSide } from "@/lib/scoreUtils";
import { getPlayerDisplayName, getPlayerRepresentationLabel } from "@/lib/playerDisplay";
import { getLocationName } from "@/lib/locationDisplay";
import { PointProgressionChart } from "@/components/PointProgressionChart";

function normalizeHistory(raw: unknown): PointEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => normalizeEntry(entry));
}

export type VerificationStatus = "unverified" | "pending" | "verified";

export const END_REASONS = [
  "completed_normally",
  "opponent_retired",
  "win_by_default",
  "technical_other",
] as const;
export type EndReason = (typeof END_REASONS)[number];

const END_REASON_LABELS: Record<EndReason, string> = {
  completed_normally: "Completed normally",
  opponent_retired: "Opponent retired / injured",
  win_by_default: "Win by default",
  technical_other: "Technical win / other",
};

type MatchRow = {
  id: string;
  status: string;
  created_at: string;
  created_by?: string | null;
  score_state: { pointHistory: PointEntry[] };
  winner_side: string | null;
  verification_status?: VerificationStatus;
  end_reason?: string | null;
  match_type?: string | null;
  tournament_name?: string | null;
  location_id?: string | null;
  challenger_id?: string;
  opponent_id?: string;
  challenger?: unknown;
  opponent?: unknown;
  location?: { name: string }[];
};

const LAYOUT_KEY = "badminton-match-layout";
const POINT_TYPES_KEY = "badminton-point-types-on";

type LayoutMode = 0 | 1 | 2 | 3; // 0: vert A near, 1: vert B near, 2: horiz A left, 3: horiz B left

function CourtButtons({
  layoutMode,
  challengerName,
  opponentName,
  derived,
  saving,
  onTapLeft,
  onTapRight,
}: {
  layoutMode: LayoutMode;
  challengerName: string;
  opponentName: string;
  derived: { matchOver: boolean };
  saving: boolean;
  onTapLeft: () => void;
  onTapRight: () => void;
}) {
  const isVert = layoutMode === 0 || layoutMode === 1;
  const topIsLeft = layoutMode === 0;
  const leftIsLeft = layoutMode === 2;
  const topName = topIsLeft ? challengerName : opponentName;
  const bottomName = topIsLeft ? opponentName : challengerName;
  const leftName = leftIsLeft ? challengerName : opponentName;
  const rightName = leftIsLeft ? opponentName : challengerName;
  const onTapTop = topIsLeft ? onTapLeft : onTapRight;
  const onTapBottom = topIsLeft ? onTapRight : onTapLeft;
  const onTapLeftBtn = leftIsLeft ? onTapLeft : onTapRight;
  const onTapRightBtn = leftIsLeft ? onTapRight : onTapLeft;

  if (isVert) {
    return (
      <div className="mx-4 flex max-h-52 flex-1 flex-col overflow-hidden rounded-xl border-2 border-zinc-700">
        <button
          type="button"
          onClick={() => !derived.matchOver && onTapTop()}
          disabled={saving || derived.matchOver}
          className="flex flex-1 flex-col items-center justify-center border-b-2 border-zinc-700 bg-zinc-800/50 py-4 touch-manipulation active:bg-zinc-700 disabled:opacity-50"
          aria-label={`Award point to ${topName}`}
        >
          <span className="text-base font-semibold text-zinc-50">{topName}</span>
          <span className="mt-1 text-xs text-zinc-400">Tap to award point</span>
        </button>
        <div className="h-0.5 shrink-0 bg-zinc-600" aria-hidden />
        <button
          type="button"
          onClick={() => !derived.matchOver && onTapBottom()}
          disabled={saving || derived.matchOver}
          className="flex flex-1 flex-col items-center justify-center bg-zinc-800 py-4 touch-manipulation active:bg-zinc-700 disabled:opacity-50"
          aria-label={`Award point to ${bottomName}`}
        >
          <span className="text-base font-semibold text-zinc-50">{bottomName}</span>
          <span className="mt-1 text-xs text-zinc-400">Tap to award point</span>
        </button>
      </div>
    );
  }
  return (
    <div className="mx-4 flex max-h-56 flex-1 flex-row overflow-hidden rounded-xl border-2 border-zinc-700">
      <button
        type="button"
        onClick={() => !derived.matchOver && onTapLeftBtn()}
        disabled={saving || derived.matchOver}
        className="flex flex-1 flex-col items-center justify-center border-r-2 border-zinc-700 bg-zinc-800/50 py-4 touch-manipulation active:bg-zinc-700 disabled:opacity-50"
        aria-label={`Award point to ${leftName}`}
      >
        <span className="text-base font-semibold text-zinc-50">{leftName}</span>
        <span className="mt-1 text-xs text-zinc-400">Tap to award point</span>
      </button>
      <div className="w-0.5 shrink-0 self-stretch bg-zinc-600" aria-hidden />
      <button
        type="button"
        onClick={() => !derived.matchOver && onTapRightBtn()}
        disabled={saving || derived.matchOver}
        className="flex flex-1 flex-col items-center justify-center bg-zinc-800 py-4 touch-manipulation active:bg-zinc-700 disabled:opacity-50"
        aria-label={`Award point to ${rightName}`}
      >
        <span className="text-base font-semibold text-zinc-50">{rightName}</span>
        <span className="mt-1 text-xs text-zinc-400">Tap to award point</span>
      </button>
    </div>
  );
}

function formatMatchStart(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay ? `Started ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : `Started ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } catch {
    return "";
  }
}

export default function MatchPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [session, setSession] = useState<{ user: { id: string } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(0);
  const [recordPointTypes, setRecordPointTypes] = useState(true);
  const [showEditScore, setShowEditScore] = useState(false);
  const [editScoreLeft, setEditScoreLeft] = useState("");
  const [editScoreRight, setEditScoreRight] = useState("");
  const [editScoreError, setEditScoreError] = useState<string | null>(null);
  const [pendingZone, setPendingZone] = useState<string | null>(null);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [reopenedJustNow, setReopenedJustNow] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [endReasonChoice, setEndReasonChoice] = useState<EndReason | null>(null);
  const [endWinnerSide, setEndWinnerSide] = useState<PointSide | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(LAYOUT_KEY);
    const mode = stored ? (parseInt(stored, 10) as LayoutMode) : 0;
    if (mode >= 0 && mode <= 3) setLayoutMode(mode);
    const pt = localStorage.getItem(POINT_TYPES_KEY);
    setRecordPointTypes(pt !== "false");
  }, []);

  const cycleLayout = () => {
    const next = ((layoutMode + 1) % 4) as LayoutMode;
    setLayoutMode(next);
    if (typeof window !== "undefined") localStorage.setItem(LAYOUT_KEY, String(next));
  };

  const togglePointTypes = () => {
    const next = !recordPointTypes;
    setRecordPointTypes(next);
    if (typeof window !== "undefined") localStorage.setItem(POINT_TYPES_KEY, String(next));
  };

  const fetchMatch = useCallback(async () => {
    const { data, error } = await supabase
      .from("matches")
      .select("id, status, created_at, created_by, score_state, winner_side, verification_status, end_reason, location_id, match_type, tournament_name, challenger_id, opponent_id, challenger:players!challenger_id(display_name, represented_as, club_affiliation, school_affiliation, corporate_affiliation, city, country), opponent:players!opponent_id(display_name, represented_as, club_affiliation, school_affiliation, corporate_affiliation, city, country), location:locations!location_id(name)")
      .eq("id", id)
      .single();
    if (error || !data) {
      setMatch(null);
      setLoading(false);
      return;
    }
    const d = data as { score_state?: { pointHistory?: unknown } };
    const normalized = d.score_state?.pointHistory != null ? { ...d.score_state, pointHistory: normalizeHistory(d.score_state.pointHistory) } : { pointHistory: [] as PointEntry[] };
    setMatch({ ...d, score_state: normalized } as MatchRow);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s ? { user: { id: s.user.id } } : null));
  }, []);
  useEffect(() => {
    fetchMatch();
  }, [fetchMatch]);

  const isAdmin = !!session && !!match && match.created_by === session.user.id;
  const [playerOptions, setPlayerOptions] = useState<{ id: string; display_name: string }[]>([]);
  const [editChallengerId, setEditChallengerId] = useState("");
  const [editOpponentId, setEditOpponentId] = useState("");

  useEffect(() => {
    if (!showEdit || !session) return;
    supabase.from("players").select("id, display_name").order("display_name").then(({ data }) => {
      setPlayerOptions((data as { id: string; display_name: string }[]) ?? []);
    });
  }, [showEdit, session]);

  const addPoint = async (side: PointSide, reason: PointReason, zone?: string | null) => {
    if (!match || match.status !== "in_progress" || saving) return;
    const history = [
      ...(match.score_state?.pointHistory ?? []),
      { side, reason, zone: zone ?? null },
    ];
    const derived = deriveScore(history);
    setSaving(true);
    const update: { score_state: { pointHistory: PointEntry[] }; status?: string; winner_side?: string | null } = {
      score_state: { pointHistory: history },
    };
    if (derived.matchOver) {
      update.status = "completed";
      update.winner_side = derived.winnerSide;
      (update as Record<string, unknown>).verification_status = "unverified";
    }
    const { error } = await supabase.from("matches").update(update).eq("id", id);
    setSaving(false);
    if (error) return;
    setMatch((m) =>
      !m ? m : { ...m, ...update, score_state: { pointHistory: history }, verification_status: derived.matchOver ? "unverified" : m.verification_status }
    );
  };

  const applyCatchUpScore = async () => {
    if (!match || match.status !== "in_progress" || saving) return;
    const left = parseInt(editScoreLeft, 10);
    const right = parseInt(editScoreRight, 10);
    const err = validateGameScore(left, right);
    if (err) {
      setEditScoreError(err);
      return;
    }
    setEditScoreError(null);
    setShowEditScore(false);
    setEditScoreLeft("");
    setEditScoreRight("");
    const fullHistory = match.score_state?.pointHistory ?? [];
    const prefixRaw = prefixCompletedGames(fullHistory);
    const prefix = prefixRaw as PointEntry[];
    const synthetic: PointEntry[] = [
      ...Array(left).fill({ side: "left" as PointSide, reason: "winner" as PointReason, zone: null }),
      ...Array(right).fill({ side: "right" as PointSide, reason: "winner" as PointReason, zone: null }),
    ];
    const history = [...prefix, ...synthetic];
    const newDerived = deriveScore(history);
    setSaving(true);
    const update: { score_state: { pointHistory: PointEntry[] }; status?: string; winner_side?: string | null } = {
      score_state: { pointHistory: history },
    };
    if (newDerived.matchOver) {
      update.status = "completed";
      update.winner_side = newDerived.winnerSide;
      (update as Record<string, unknown>).verification_status = "unverified";
    }
    const { error } = await supabase.from("matches").update(update).eq("id", id);
    setSaving(false);
    if (error) return;
    setMatch((m) =>
      !m ? m : { ...m, ...update, score_state: { pointHistory: history }, verification_status: newDerived.matchOver ? "unverified" : m.verification_status }
    );
  };

  const undo = async () => {
    if (!match || match.status !== "in_progress" || saving) return;
    const history = match.score_state?.pointHistory ?? [];
    if (history.length === 0) return;
    const next = history.slice(0, -1);
    setSaving(true);
    const { error } = await supabase
      .from("matches")
      .update({ score_state: { pointHistory: next } })
      .eq("id", id);
    setSaving(false);
    if (error) return;
    setMatch((m) => (!m ? m : { ...m, score_state: { pointHistory: next } }));
  };

  const endMatchWithReason = async (reason: EndReason, winnerSide?: PointSide) => {
    if (!match || match.status !== "in_progress" || saving) return;
    setShowEndModal(false);
    setEndReasonChoice(null);
    setEndWinnerSide(null);
    setSaving(true);
    const derived = deriveScore(match.score_state?.pointHistory ?? []);
    const winner =
      reason === "completed_normally"
        ? derived.matchOver ? derived.winnerSide : null
        : winnerSide ?? null;
    const { error } = await supabase
      .from("matches")
      .update({
        status: "completed",
        winner_side: winner,
        verification_status: "unverified",
        end_reason: reason,
      })
      .eq("id", id);
    setSaving(false);
    if (error) return;
    router.replace("/matches");
  };

  const markVerified = async () => {
    if (!match || match.status !== "completed" || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from("matches")
      .update({ verification_status: "verified" })
      .eq("id", id);
    setSaving(false);
    if (error) return;
    setMatch((m) => (!m ? m : { ...m, verification_status: "verified" as VerificationStatus }));
  };

  const reopenMatch = async () => {
    if (!match || match.status !== "completed" || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from("matches")
      .update({ status: "in_progress", winner_side: null, end_reason: null })
      .eq("id", id);
    setSaving(false);
    if (error) return;
    setReopenedJustNow(true);
    fetchMatch();
  };

  const saveEdit = async () => {
    if (!match || !editChallengerId || !editOpponentId || editChallengerId === editOpponentId || saving) return;
    setSaving(true);
    const { error } = await supabase.from("matches").update({ challenger_id: editChallengerId, opponent_id: editOpponentId }).eq("id", id);
    setSaving(false);
    if (error) return;
    setShowEdit(false);
    fetchMatch();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-zinc-400">Loading…</p>
      </div>
    );
  }
  if (!match) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 px-4">
        <p className="text-zinc-400">Match not found.</p>
        <Link href="/matches" className="text-sm text-zinc-300 underline">← Back to matches</Link>
      </div>
    );
  }

  const history = match.score_state?.pointHistory ?? [];
  const derived = deriveScore(history);
  const inProgress = match.status === "in_progress";
  const challengerName = getPlayerDisplayName(match.challenger, match.challenger_id);
  const opponentName = getPlayerDisplayName(match.opponent, match.opponent_id);
  const matchLocationName = getLocationName(match.location);

  const reasonStats = {
    left: { winner: 0, unforced: 0, forced: 0, service: 0, lucky: 0 },
    right: { winner: 0, unforced: 0, forced: 0, service: 0, lucky: 0 },
  };
  const zoneStats: Record<string, { wins: number; losses: number }> = {};
  for (const e of history as PointEntry[]) {
    const sideKey = e.side === "left" ? "left" : "right";
    switch (e.reason) {
      case "winner":
        reasonStats[sideKey].winner++;
        break;
      case "opponent_unforced_error":
        reasonStats[sideKey].unforced++;
        break;
      case "forced_error":
        reasonStats[sideKey].forced++;
        break;
      case "service_error":
        reasonStats[sideKey].service++;
        break;
      case "lucky":
        reasonStats[sideKey].lucky++;
        break;
    }
    if (e.zone) {
      const [team] = e.zone.split("-");
      const key = e.zone;
      if (!zoneStats[key]) zoneStats[key] = { wins: 0, losses: 0 };
      if (team === "A") {
        if (e.side === "left") zoneStats[key].wins++;
        else zoneStats[key].losses++;
      } else if (team === "B") {
        if (e.side === "right") zoneStats[key].wins++;
        else zoneStats[key].losses++;
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <Link href="/matches" className="text-sm text-zinc-400 underline active:text-zinc-300">← Matches</Link>
        <span className="text-sm text-zinc-500">
          {challengerName}
          {getPlayerRepresentationLabel(match.challenger) && (
            <span className="ml-1 text-xs text-zinc-400">({getPlayerRepresentationLabel(match.challenger)})</span>
          )}{" "}
          vs{" "}
          {opponentName}
          {getPlayerRepresentationLabel(match.opponent) && (
            <span className="ml-1 text-xs text-zinc-400">({getPlayerRepresentationLabel(match.opponent)})</span>
          )}
        </span>
      </header>

      <div className="flex flex-1 flex-col">
        {match.created_at && (
          <p className="px-4 pt-2 text-center text-xs text-zinc-500">{formatMatchStart(match.created_at)}</p>
        )}
        <p className="px-4 text-center text-xs text-zinc-500">
          {match.match_type === "tournament"
            ? `Tournament${match.tournament_name?.trim() ? ` · ${match.tournament_name.trim()}` : " · Tournament match"} · ${matchLocationName ?? "No venue indicated"}`
            : `Recreational · ${matchLocationName ?? "No venue indicated"}`}
        </p>
        <div className="flex flex-col items-center justify-center gap-1 py-3 text-center">
          <div className="flex flex-wrap items-baseline justify-center gap-2">
            {derived.games.map((g, i) => (
              <span key={i} className="text-sm font-medium text-zinc-400">
                {g.left}-{g.right}
              </span>
            ))}
            {derived.games.length > 0 && (
              <span className="text-xs text-zinc-500">(games)</span>
            )}
          </div>
          <div className="flex items-baseline justify-center gap-3">
            <span className="text-xs text-zinc-500">{challengerName}</span>
            <span className="text-3xl font-semibold text-zinc-50 md:text-4xl">
              {derived.currentGame.left} – {derived.currentGame.right}
            </span>
            <span className="text-xs text-zinc-500">{opponentName}</span>
          </div>
        </div>

        <PointProgressionChart data={buildCurrentGameProgression(history)} />

        {(derived.matchOver || (!inProgress && match.winner_side)) && (
          <p className="text-center text-emerald-400">
            Match over. {(match.winner_side ?? derived.winnerSide) === "left" ? challengerName : opponentName} won.
          </p>
        )}

        {!inProgress && (
          <div className="space-y-1 text-center text-sm text-zinc-500">
            <p>
              {(match.verification_status ?? "unverified") === "verified" && "✓ Verified"}
              {(match.verification_status ?? "unverified") === "pending" && "Pending verification"}
              {(match.verification_status ?? "unverified") === "unverified" && "Unverified"}
            </p>
            {match.end_reason && (
              <p className="text-zinc-400">
                Ended: {END_REASON_LABELS[match.end_reason as EndReason] ?? match.end_reason}
                {match.end_reason !== "completed_normally" && match.winner_side && (
                  <> – {match.winner_side === "left" ? challengerName : opponentName} won</>
                )}
              </p>
            )}
          </div>
        )}

        {inProgress && isAdmin && reopenedJustNow && (
          <p className="mx-4 mt-2 rounded-lg bg-amber-900/40 px-3 py-2 text-center text-sm text-amber-200">
            Match reopened – continue scoring below.
          </p>
        )}
        {inProgress && isAdmin && (
          <p className="px-4 py-1 text-center text-xs text-zinc-500">You manage this match</p>
        )}
        {inProgress && (
          <>
            <div className="flex flex-wrap items-center justify-center gap-2 py-2">
              <button
                type="button"
                onClick={cycleLayout}
                className="rounded px-2 py-1 text-xs font-medium bg-zinc-600 text-zinc-50"
              >
                Cycle layout
              </button>
              <button
                type="button"
                onClick={togglePointTypes}
                className={`rounded px-2 py-1 text-xs font-medium ${recordPointTypes ? "bg-zinc-600 text-zinc-50" : "text-zinc-500"}`}
              >
                {recordPointTypes ? "Zone / types ON" : "Simple scoring"}
              </button>
            </div>
            {recordPointTypes ? (
              <>
                <div className="px-4 pb-2 text-center text-xs text-zinc-500">
                  Tap a zone on the court, then choose who got the point.
                </div>
                <div className="mx-4">
                  <div className="rounded-xl border-2 border-zinc-600 bg-zinc-900/80 overflow-hidden shadow-inner">
                    <p className="py-1.5 text-center text-xs font-semibold text-zinc-300 bg-zinc-800/80 border-b border-zinc-600">
                      Team A — {challengerName}
                    </p>
                    <div className="grid grid-rows-5 gap-0.5 p-1 bg-zinc-800/40">
                      {Array.from({ length: 5 }).map((_, r) => (
                        <div key={r} className="grid grid-cols-5 gap-0.5">
                          {Array.from({ length: 5 }).map((__, c) => {
                            const zone = `A-${r + 1}-${c + 1}`;
                            const stats = zoneStats[zone] ?? { wins: 0, losses: 0 };
                            return (
                              <button
                                key={zone}
                                type="button"
                                onClick={() => {
                                  if (derived.matchOver || saving) return;
                                  setPendingZone(zone);
                                  setShowReasonModal(true);
                                }}
                                className="relative flex h-9 min-w-0 flex-col items-center justify-center rounded bg-zinc-800/90 text-xs font-bold active:bg-zinc-700 touch-manipulation"
                              >
                                {stats.wins > 0 && <span className="text-emerald-400 leading-tight">+{stats.wins}</span>}
                                {stats.losses > 0 && <span className="text-red-400 leading-tight">−{stats.losses}</span>}
                                {stats.wins === 0 && stats.losses === 0 && <span className="text-zinc-500">·</span>}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    <div className="h-0.5 bg-zinc-600 shrink-0" aria-hidden />
                    <p className="py-1.5 text-center text-xs font-semibold text-zinc-300 bg-zinc-800/80 border-t border-zinc-600">
                      Team B — {opponentName}
                    </p>
                    <div className="grid grid-rows-5 gap-0.5 p-1 bg-zinc-800/40">
                      {Array.from({ length: 5 }).map((_, r) => (
                        <div key={r} className="grid grid-cols-5 gap-0.5">
                          {Array.from({ length: 5 }).map((__, c) => {
                            const zone = `B-${r + 1}-${c + 1}`;
                            const stats = zoneStats[zone] ?? { wins: 0, losses: 0 };
                            return (
                              <button
                                key={zone}
                                type="button"
                                onClick={() => {
                                  if (derived.matchOver || saving) return;
                                  setPendingZone(zone);
                                  setShowReasonModal(true);
                                }}
                                className="relative flex h-9 min-w-0 flex-col items-center justify-center rounded bg-zinc-800/90 text-xs font-bold active:bg-zinc-700 touch-manipulation"
                              >
                                {stats.wins > 0 && <span className="text-emerald-400 leading-tight">+{stats.wins}</span>}
                                {stats.losses > 0 && <span className="text-red-400 leading-tight">−{stats.losses}</span>}
                                {stats.wins === 0 && stats.losses === 0 && <span className="text-zinc-500">·</span>}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <CourtButtons
                  layoutMode={layoutMode}
                  challengerName={challengerName}
                  opponentName={opponentName}
                  derived={derived}
                  saving={saving}
                  onTapLeft={() => {
                    addPoint("left", "winner");
                  }}
                  onTapRight={() => {
                    addPoint("right", "winner");
                  }}
                />
                <p className="px-4 py-1 text-center text-xs text-zinc-500">
                  Tap a name to award a point
                </p>
              </>
            )}

            {showReasonModal && pendingZone !== null && (
              <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/60 p-4 pb-8" role="dialog" aria-modal="true" aria-label="Who got the point?">
                <div className="w-full max-w-sm rounded-t-2xl bg-zinc-900 p-4 shadow-lg">
                  <p className="mb-3 text-center text-sm font-medium text-zinc-50">
                    Who got the point?
                  </p>
                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        addPoint("left", "winner", pendingZone);
                        setShowReasonModal(false);
                        setPendingZone(null);
                      }}
                      className="rounded-xl bg-zinc-800 py-3 text-center text-sm font-medium text-zinc-50 touch-manipulation active:bg-zinc-700"
                    >
                      Winner by Team A ({challengerName})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        addPoint("right", "winner", pendingZone);
                        setShowReasonModal(false);
                        setPendingZone(null);
                      }}
                      className="rounded-xl bg-zinc-800 py-3 text-center text-sm font-medium text-zinc-50 touch-manipulation active:bg-zinc-700"
                    >
                      Winner by Team B ({opponentName})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        addPoint("right", "opponent_unforced_error", pendingZone);
                        setShowReasonModal(false);
                        setPendingZone(null);
                      }}
                      className="rounded-xl bg-zinc-800 py-3 text-center text-sm font-medium text-zinc-50 touch-manipulation active:bg-zinc-700"
                    >
                      Error by Team A → point to B
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        addPoint("left", "opponent_unforced_error", pendingZone);
                        setShowReasonModal(false);
                        setPendingZone(null);
                      }}
                      className="rounded-xl bg-zinc-800 py-3 text-center text-sm font-medium text-zinc-50 touch-manipulation active:bg-zinc-700"
                    >
                      Error by Team B → point to A
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowReasonModal(false);
                        setPendingZone(null);
                      }}
                      className="rounded-xl border border-zinc-600 py-2.5 text-sm text-zinc-400 touch-manipulation"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 border-t border-zinc-800 p-4">
              <button
                type="button"
                onClick={undo}
                disabled={saving || history.length === 0}
                className="flex-1 min-w-[80px] rounded-lg border border-zinc-600 py-3 text-sm font-medium text-zinc-300 disabled:opacity-50 active:bg-zinc-800"
              >
                Undo
              </button>
              <button
                type="button"
                onClick={() => { setShowEditScore(true); setEditScoreLeft(String(derived.currentGame.left)); setEditScoreRight(String(derived.currentGame.right)); setEditScoreError(null); }}
                disabled={saving || derived.matchOver}
                className="flex-1 min-w-[80px] rounded-lg border border-zinc-600 py-3 text-sm font-medium text-zinc-300 disabled:opacity-50 active:bg-zinc-800"
              >
                Edit score
              </button>
              <button
                type="button"
                onClick={() => setShowEndModal(true)}
                disabled={saving}
                className="flex-1 min-w-[80px] rounded-lg bg-zinc-600 py-3 text-sm font-medium text-zinc-50 active:bg-zinc-500"
              >
                End match
              </button>
            </div>

            <div className="border-t border-zinc-800 px-4 pb-4">
              <button
                type="button"
                onClick={() => setShowAnalysis((a) => !a)}
                className="w-full py-2 text-center text-xs font-medium text-zinc-400 active:text-zinc-300"
              >
                {showAnalysis ? "Hide analysis" : "Show analysis"}
              </button>
              {showAnalysis && (
                <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3 text-xs text-zinc-400 space-y-2">
                  <p className="font-medium text-zinc-300">Point breakdown</p>
                  <p>Team A: {reasonStats.left.winner} winners, {reasonStats.left.unforced + reasonStats.left.forced + reasonStats.left.service + reasonStats.left.lucky} errors conceded</p>
                  <p>Team B: {reasonStats.right.winner} winners, {reasonStats.right.unforced + reasonStats.right.forced + reasonStats.right.service + reasonStats.right.lucky} errors conceded</p>
                </div>
              )}
            </div>

            {showEditScore && (
              <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/60 p-4 pb-8" role="dialog" aria-modal="true" aria-label="Edit score">
                <div className="w-full max-w-sm rounded-t-2xl bg-zinc-900 p-4 shadow-lg">
                  <h2 className="mb-3 text-sm font-semibold text-zinc-50">Catch up score</h2>
                  <p className="mb-3 text-xs text-zinc-400">Enter current game score (Team A vs Team B)</p>
                  <div className="mb-3 flex gap-2">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-zinc-400">Team A ({challengerName})</label>
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={editScoreLeft}
                        onChange={(e) => setEditScoreLeft(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-50"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-zinc-400">Team B ({opponentName})</label>
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={editScoreRight}
                        onChange={(e) => setEditScoreRight(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-50"
                      />
                    </div>
                  </div>
                  {editScoreError && <p className="mb-2 text-sm text-red-400">{editScoreError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={applyCatchUpScore} className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white">
                      Apply
                    </button>
                    <button type="button" onClick={() => { setShowEditScore(false); setEditScoreError(null); }} className="rounded-lg border border-zinc-600 py-2 px-4 text-sm text-zinc-400">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
            {showEndModal && (
              <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/60 p-4 pb-8" role="dialog" aria-modal="true" aria-label="How did the match end?">
                <div className="w-full max-w-sm rounded-t-2xl bg-zinc-900 p-4 shadow-lg">
                  <h2 className="mb-3 text-sm font-semibold text-zinc-50">How did the match end?</h2>
                  {endReasonChoice === null ? (
                    <div className="grid gap-2">
                      {END_REASONS.map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => {
                            if (reason === "completed_normally") {
                              endMatchWithReason("completed_normally");
                            } else {
                              setEndReasonChoice(reason);
                            }
                          }}
                          className="rounded-xl bg-zinc-800 py-3 text-left text-sm text-zinc-50 touch-manipulation active:bg-zinc-700"
                        >
                          {END_REASON_LABELS[reason]}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setShowEndModal(false)}
                        className="rounded-xl border border-zinc-600 py-2.5 text-sm text-zinc-400 touch-manipulation"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-zinc-400">Who won?</p>
                      <div className="grid gap-2">
                        <button
                          type="button"
                          onClick={() => endMatchWithReason(endReasonChoice!, "left")}
                          className="rounded-xl bg-zinc-800 py-3 text-sm font-medium text-zinc-50 touch-manipulation active:bg-zinc-700"
                        >
                          {challengerName}
                        </button>
                        <button
                          type="button"
                          onClick={() => endMatchWithReason(endReasonChoice!, "right")}
                          className="rounded-xl bg-zinc-800 py-3 text-sm font-medium text-zinc-50 touch-manipulation active:bg-zinc-700"
                        >
                          {opponentName}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEndReasonChoice(null)}
                        className="w-full rounded-xl border border-zinc-600 py-2 text-sm text-zinc-400 touch-manipulation"
                      >
                        Back
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {!inProgress && (
          <div className="space-y-2 p-4">
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={reopenMatch}
                  disabled={saving}
                  className="w-full rounded-lg border border-amber-600 py-2 text-sm font-medium text-amber-400"
                >
                  Reopen / Continue match
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditChallengerId(match.challenger_id ?? "");
                    setEditOpponentId(match.opponent_id ?? "");
                    setShowEdit(true);
                  }}
                  className="w-full rounded-lg border border-zinc-600 py-2 text-sm font-medium text-zinc-300"
                >
                  Edit match
                </button>
              </>
            )}
            {(match.verification_status ?? "unverified") === "unverified" && (
              <button
                type="button"
                onClick={markVerified}
                disabled={saving}
                className="w-full rounded-lg border border-emerald-600 py-2 text-sm font-medium text-emerald-400"
              >
                Mark as Verified
              </button>
            )}
            <Link href="/matches" className="block rounded-lg bg-zinc-700 py-3 text-center text-sm font-medium text-zinc-50 active:bg-zinc-600">
              Back to matches
            </Link>
          </div>
        )}

        {showEdit && isAdmin && (
          <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/60 p-4 pb-8" role="dialog" aria-modal="true" aria-label="Edit match">
            <div className="w-full max-w-sm rounded-t-2xl bg-zinc-900 p-4 shadow-lg">
              <h2 className="mb-3 text-sm font-semibold text-zinc-50">Edit match</h2>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Challenger</label>
                  <select
                    value={editChallengerId}
                    onChange={(e) => setEditChallengerId(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50"
                  >
                    {playerOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.display_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Opponent</label>
                  <select
                    value={editOpponentId}
                    onChange={(e) => setEditOpponentId(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50"
                  >
                    {playerOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.display_name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={saving || !editChallengerId || !editOpponentId || editChallengerId === editOpponentId}
                    className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEdit(false)}
                    className="rounded-lg border border-zinc-600 py-2 px-4 text-sm text-zinc-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
