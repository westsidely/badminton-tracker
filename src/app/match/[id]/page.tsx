"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { deriveScore, POINT_REASONS, type PointEntry, type PointReason, type PointSide } from "@/lib/scoreUtils";
import { getPlayerDisplayName } from "@/lib/playerDisplay";
import { getLocationName } from "@/lib/locationDisplay";

function getReasonLabel(reason: PointReason, otherName: string): string {
  switch (reason) {
    case "winner": return "Winner";
    case "opponent_unforced_error": return `Unforced error by ${otherName}`;
    case "forced_error": return "Forced error (opponent forced into error)";
    case "service_error": return `Service error by ${otherName}`;
    case "lucky": return "Lucky shot (net cord, etc.)";
    default: return reason;
  }
}

function normalizeHistory(raw: unknown): PointEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) =>
    typeof entry === "string"
      ? { side: entry as PointSide, reason: "winner" as PointReason }
      : { side: entry.side, reason: entry.reason ?? "winner" }
  );
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
  location_id?: string | null;
  challenger_id?: string;
  opponent_id?: string;
  challenger?: unknown;
  opponent?: unknown;
  location?: { name: string }[];
};

const LAYOUT_KEY = "badminton-match-layout";

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
  const [pendingSide, setPendingSide] = useState<PointSide | null>(null);
  const [layout, setLayout] = useState<"vertical" | "horizontal">("vertical");
  const [reopenedJustNow, setReopenedJustNow] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [endReasonChoice, setEndReasonChoice] = useState<EndReason | null>(null);
  const [endWinnerSide, setEndWinnerSide] = useState<PointSide | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(LAYOUT_KEY) as "vertical" | "horizontal" | null;
    if (stored === "vertical" || stored === "horizontal") setLayout(stored);
  }, []);

  const setLayoutAndStore = (value: "vertical" | "horizontal") => {
    setLayout(value);
    if (typeof window !== "undefined") localStorage.setItem(LAYOUT_KEY, value);
  };

  const fetchMatch = useCallback(async () => {
    const { data, error } = await supabase
      .from("matches")
      .select("id, status, created_at, created_by, score_state, winner_side, verification_status, end_reason, location_id, challenger_id, opponent_id, challenger:players!challenger_id(display_name), opponent:players!opponent_id(display_name), location:locations!location_id(name)")
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

  const addPoint = async (side: PointSide, reason: PointReason) => {
    if (!match || match.status !== "in_progress" || saving) return;
    setPendingSide(null);
    const history = [...(match.score_state?.pointHistory ?? []), { side, reason }];
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

  const undo = async () => {
    if (!match || match.status !== "in_progress" || saving) return;
    setPendingSide(null);
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
    setPendingSide(null);
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

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <Link href="/matches" className="text-sm text-zinc-400 underline active:text-zinc-300">← Matches</Link>
        <span className="text-sm text-zinc-500">{challengerName} vs {opponentName}</span>
      </header>

      <div className="flex flex-1 flex-col">
        {match.created_at && (
          <p className="px-4 pt-2 text-center text-xs text-zinc-500">{formatMatchStart(match.created_at)}</p>
        )}
        <p className="px-4 text-center text-xs text-zinc-500">
          {matchLocationName ?? "No venue indicated"}
        </p>
        <div className="flex items-center justify-center gap-4 py-3 text-center">
          {derived.games.map((g, i) => (
            <span key={i} className="text-lg font-medium text-zinc-300">
              {g.left}-{g.right}
            </span>
          ))}
          {derived.games.length < 3 && (
            <span className="text-2xl font-semibold text-zinc-50">
              {derived.currentGame.left} – {derived.currentGame.right}
            </span>
          )}
        </div>

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
            <div className="flex items-center justify-center gap-2 py-2">
              <span className="text-xs text-zinc-500">Court</span>
              <button
                type="button"
                onClick={() => setLayoutAndStore("vertical")}
                className={`rounded px-2 py-1 text-xs font-medium ${layout === "vertical" ? "bg-zinc-600 text-zinc-50" : "text-zinc-500"}`}
              >
                Vertical
              </button>
              <button
                type="button"
                onClick={() => setLayoutAndStore("horizontal")}
                className={`rounded px-2 py-1 text-xs font-medium ${layout === "horizontal" ? "bg-zinc-600 text-zinc-50" : "text-zinc-500"}`}
              >
                Horizontal
              </button>
            </div>
            <div className={`mx-4 flex overflow-hidden rounded-xl border-2 border-zinc-700 ${layout === "vertical" ? "max-h-52 flex-1 flex-col" : "max-h-56 flex-1 flex-row"}`}>
              {layout === "vertical" ? (
                <>
                  <button
                    type="button"
                    onClick={() => !derived.matchOver && setPendingSide("left")}
                    disabled={saving || derived.matchOver}
                    className="flex flex-1 flex-col items-center justify-center border-b-2 border-zinc-700 bg-zinc-800/50 py-4 touch-manipulation active:bg-zinc-700 disabled:opacity-50"
                    aria-label={`Award point to ${challengerName}`}
                  >
                    <span className="text-base font-semibold text-zinc-50">{challengerName}</span>
                    <span className="mt-1 text-xs text-zinc-400">Tap to award point</span>
                  </button>
                  <div className="h-0.5 shrink-0 bg-zinc-600" aria-hidden />
                  <button
                    type="button"
                    onClick={() => !derived.matchOver && setPendingSide("right")}
                    disabled={saving || derived.matchOver}
                    className="flex flex-1 flex-col items-center justify-center bg-zinc-800 py-4 touch-manipulation active:bg-zinc-700 disabled:opacity-50"
                    aria-label={`Award point to ${opponentName}`}
                  >
                    <span className="text-base font-semibold text-zinc-50">{opponentName}</span>
                    <span className="mt-1 text-xs text-zinc-400">Tap to award point</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => !derived.matchOver && setPendingSide("left")}
                    disabled={saving || derived.matchOver}
                    className="flex flex-1 flex-col items-center justify-center border-r-2 border-zinc-700 bg-zinc-800/50 py-4 touch-manipulation active:bg-zinc-700 disabled:opacity-50"
                    aria-label={`Award point to ${challengerName}`}
                  >
                    <span className="text-base font-semibold text-zinc-50">{challengerName}</span>
                    <span className="mt-1 text-xs text-zinc-400">Tap to award point</span>
                  </button>
                  <div className="w-0.5 shrink-0 bg-zinc-600 self-stretch" aria-hidden />
                  <button
                    type="button"
                    onClick={() => !derived.matchOver && setPendingSide("right")}
                    disabled={saving || derived.matchOver}
                    className="flex flex-1 flex-col items-center justify-center bg-zinc-800 py-4 touch-manipulation active:bg-zinc-700 disabled:opacity-50"
                    aria-label={`Award point to ${opponentName}`}
                  >
                    <span className="text-base font-semibold text-zinc-50">{opponentName}</span>
                    <span className="mt-1 text-xs text-zinc-400">Tap to award point</span>
                  </button>
                </>
              )}
            </div>
            <p className="px-4 py-1 text-center text-xs text-zinc-500">
              Tap a name to award a point, then choose reason
            </p>

            {pendingSide !== null && (
              <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/60 p-4 pb-8" role="dialog" aria-modal="true" aria-label="Point reason">
                <div className="w-full max-w-sm rounded-t-2xl bg-zinc-900 p-4 shadow-lg">
                  <p className="mb-3 text-center text-sm font-medium text-zinc-50">
                    Award point to {pendingSide === "left" ? challengerName : opponentName}
                  </p>
                  <div className="grid gap-2">
                    {POINT_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => addPoint(pendingSide, reason)}
                        className="rounded-xl bg-zinc-800 py-3 text-left text-sm text-zinc-50 touch-manipulation active:bg-zinc-700"
                      >
                        {getReasonLabel(reason, pendingSide === "left" ? opponentName : challengerName)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPendingSide(null)}
                      className="rounded-xl border border-zinc-600 py-2.5 text-sm text-zinc-400 touch-manipulation"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-2 border-t border-zinc-800 p-4">
              <button
                type="button"
                onClick={undo}
                disabled={saving || history.length === 0}
                className="flex-1 rounded-lg border border-zinc-600 py-3 text-sm font-medium text-zinc-300 disabled:opacity-50 active:bg-zinc-800"
              >
                Undo
              </button>
              <button
                type="button"
                onClick={() => setShowEndModal(true)}
                disabled={saving}
                className="flex-1 rounded-lg bg-zinc-600 py-3 text-sm font-medium text-zinc-50 active:bg-zinc-500"
              >
                End match
              </button>
            </div>
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
