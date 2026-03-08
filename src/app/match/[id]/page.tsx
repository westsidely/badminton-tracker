"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { deriveScore, POINT_REASONS, type PointEntry, type PointReason, type PointSide } from "@/lib/scoreUtils";

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

type MatchRow = {
  id: string;
  status: string;
  created_at: string;
  score_state: { pointHistory: PointEntry[] };
  winner_side: string | null;
  verification_status?: VerificationStatus;
  challenger: { display_name: string }[];
  opponent: { display_name: string }[];
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingSide, setPendingSide] = useState<PointSide | null>(null);
  const [layout, setLayout] = useState<"vertical" | "horizontal">("vertical");

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
      .select("id, status, created_at, score_state, winner_side, verification_status, challenger:players!challenger_id(display_name), opponent:players!opponent_id(display_name)")
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
    fetchMatch();
  }, [fetchMatch]);

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

  const endMatch = async () => {
    if (!match || match.status !== "in_progress" || saving) return;
    setPendingSide(null);
    setSaving(true);
    const derived = deriveScore(match.score_state?.pointHistory ?? []);
    const { error } = await supabase
      .from("matches")
      .update({
        status: "completed",
        winner_side: derived.matchOver ? derived.winnerSide : null,
        verification_status: "unverified",
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
  const challengerName = match.challenger?.[0]?.display_name ?? "Challenger";
  const opponentName = match.opponent?.[0]?.display_name ?? "Opponent";

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <Link href="/matches" className="text-sm text-zinc-400 underline active:text-zinc-300">← Matches</Link>
        <span className="text-sm text-zinc-500">{challengerName} vs {opponentName}</span>
      </header>

      <div className="flex flex-1 flex-col">
        {inProgress && match.created_at && (
          <p className="px-4 pt-2 text-center text-xs text-zinc-500">{formatMatchStart(match.created_at)}</p>
        )}
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

        {derived.matchOver && (
          <p className="text-center text-emerald-400">
            Match over. {derived.winnerSide === "left" ? challengerName : opponentName} won.
          </p>
        )}

        {!inProgress && (
          <p className="text-center text-sm text-zinc-500">
            {(match.verification_status ?? "unverified") === "verified" && "✓ Verified"}
            {(match.verification_status ?? "unverified") === "pending" && "Pending verification"}
            {(match.verification_status ?? "unverified") === "unverified" && "Unverified"}
          </p>
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
                onClick={endMatch}
                disabled={saving}
                className="flex-1 rounded-lg bg-zinc-600 py-3 text-sm font-medium text-zinc-50 active:bg-zinc-500"
              >
                End match
              </button>
            </div>
          </>
        )}

        {!inProgress && (
          <div className="space-y-2 p-4">
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
      </div>
    </div>
  );
}
