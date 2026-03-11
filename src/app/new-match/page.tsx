"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Player = { id: string; display_name: string };
type LocationRow = { id: string; name: string };

export const MATCH_FORMATS = [
  { value: "mens_singles", label: "Men's Singles" },
  { value: "womens_singles", label: "Women's Singles" },
  { value: "mens_doubles", label: "Men's Doubles" },
  { value: "womens_doubles", label: "Women's Doubles" },
  { value: "mixed_doubles", label: "Mixed Doubles" },
] as const;
export type MatchFormat = (typeof MATCH_FORMATS)[number]["value"];

const isSingles = (f: MatchFormat) => f === "mens_singles" || f === "womens_singles";

export default function NewMatchPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [matchFormat, setMatchFormat] = useState<MatchFormat>("mens_singles");
  const [challengerId, setChallengerId] = useState("");
  const [challenger2Id, setChallenger2Id] = useState("");
  const [opponentId, setOpponentId] = useState("");
  const [opponent2Id, setOpponent2Id] = useState("");
  const [locationId, setLocationId] = useState("");
  const [matchType, setMatchType] = useState<"recreational" | "tournament">("recreational");
  const [tournamentName, setTournamentName] = useState("");
  const [newChallengerName, setNewChallengerName] = useState("");
  const [newChallenger2Name, setNewChallenger2Name] = useState("");
  const [newOpponentName, setNewOpponentName] = useState("");
  const [newOpponent2Name, setNewOpponent2Name] = useState("");
  const [useNewChallenger, setUseNewChallenger] = useState(false);
  const [useNewChallenger2, setUseNewChallenger2] = useState(false);
  const [useNewOpponent, setUseNewOpponent] = useState(false);
  const [useNewOpponent2, setUseNewOpponent2] = useState(false);
  const [useNewLocation, setUseNewLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationAddress, setNewLocationAddress] = useState("");
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
    Promise.all([
      supabase.from("players").select("id, display_name").order("display_name"),
      supabase.from("locations").select("id, name").order("name"),
    ]).then(([playersRes, locationsRes]) => {
      setPlayers((playersRes.data as Player[]) ?? []);
      setLocations((locationsRes.data as LocationRow[]) ?? []);
    });
  }, [checking]);

  const createPlayerIfNew = async (
    useNew: boolean,
    name: string,
    userId: string
  ): Promise<string | null> => {
    if (!useNew || !name.trim()) return null;
    const { data, error: insertErr } = await supabase
      .from("players")
      .insert({ display_name: name.trim(), created_by: userId })
      .select("id")
      .single();
    if (insertErr) throw new Error(insertErr.message);
    return data!.id;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let cId = useNewChallenger ? await createPlayerIfNew(true, newChallengerName, user.id) : challengerId;
      let c2Id: string | null = null;
      let oId = useNewOpponent ? await createPlayerIfNew(true, newOpponentName, user.id) : opponentId;
      let o2Id: string | null = null;

      if (!cId) cId = challengerId;
      if (!oId) oId = opponentId;

      if (isSingles(matchFormat)) {
        if (!cId || !oId) {
          setError("Select or enter both players");
          setLoading(false);
          return;
        }
        if (cId === oId) {
          setError("The two players must be different");
          setLoading(false);
          return;
        }
      } else {
        c2Id = useNewChallenger2 ? await createPlayerIfNew(true, newChallenger2Name, user.id) : challenger2Id;
        o2Id = useNewOpponent2 ? await createPlayerIfNew(true, newOpponent2Name, user.id) : opponent2Id;
        if (!c2Id) c2Id = challenger2Id;
        if (!o2Id) o2Id = opponent2Id;
        if (!cId || !c2Id || !oId || !o2Id) {
          setError("Select or enter all four players");
          setLoading(false);
          return;
        }
        if (cId === c2Id) {
          setError("Team A must have two different players");
          setLoading(false);
          return;
        }
        if (oId === o2Id) {
          setError("Team B must have two different players");
          setLoading(false);
          return;
        }
      }

      let locId: string | null = locationId || null;
      if (useNewLocation && newLocationName.trim()) {
        const { data: newLoc, error: locErr } = await supabase
          .from("locations")
          .insert({ name: newLocationName.trim(), address: newLocationAddress.trim() || null, created_by: user.id })
          .select("id")
          .single();
        if (locErr) {
          setError(locErr.message);
          setLoading(false);
          return;
        }
        locId = newLoc!.id;
      }

      const insertPayload: Record<string, unknown> = {
        created_by: user.id,
        challenger_id: cId,
        opponent_id: oId,
        location_id: locId,
        match_type: matchType,
        tournament_name: matchType === "tournament" ? (tournamentName.trim() || null) : null,
        status: "in_progress",
        score_state: { pointHistory: [] },
        match_format: matchFormat,
      };
      if (!isSingles(matchFormat)) {
        insertPayload.challenger_2_id = c2Id;
        insertPayload.opponent_2_id = o2Id;
      }

      const { data, error: insertError } = await supabase
        .from("matches")
        .insert(insertPayload)
        .select("id")
        .single();

      if (insertError) {
        setError(insertError.message);
        setLoading(false);
        return;
      }
      if (data?.id) router.replace(`/match/${data.id}`);
      else setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-zinc-400">Loading…</p>
      </div>
    );
  }

  const singles = isSingles(matchFormat);

  const PlayerSlot = ({
    label,
    value,
    onChange,
    useNew,
    setUseNew,
    newName,
    setNewName,
    placeholder,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    useNew: boolean;
    setUseNew: (v: boolean) => void;
    newName: string;
    setNewName: (v: string) => void;
    placeholder: string;
  }) => (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-zinc-500">{label}</label>
      {!useNew ? (
        <>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50"
          >
            <option value="">Select player</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
          <button type="button" onClick={() => setUseNew(true)} className="text-xs text-zinc-500 underline">
            Or add new player
          </button>
        </>
      ) : (
        <>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder-zinc-500"
          />
          <button type="button" onClick={() => setUseNew(false)} className="text-xs text-zinc-500 underline">
            Choose existing
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6">
      <div className="mx-auto max-w-sm">
        <h1 className="mb-6 text-xl font-semibold text-zinc-50">New match</h1>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-400">Match format</label>
            <select
              value={matchFormat}
              onChange={(e) => setMatchFormat(e.target.value as MatchFormat)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50"
            >
              {MATCH_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Team A (left)</p>
            <PlayerSlot
              label={singles ? "Player" : "Player 1"}
              value={challengerId}
              onChange={setChallengerId}
              useNew={useNewChallenger}
              setUseNew={setUseNewChallenger}
              newName={newChallengerName}
              setNewName={setNewChallengerName}
              placeholder="New player name"
            />
            {!singles && (
              <PlayerSlot
                label={matchFormat === "mixed_doubles" ? "Partner 2" : "Player 2"}
                value={challenger2Id}
                onChange={setChallenger2Id}
                useNew={useNewChallenger2}
                setUseNew={setUseNewChallenger2}
                newName={newChallenger2Name}
                setNewName={setNewChallenger2Name}
                placeholder="New player name"
              />
            )}
          </div>

          <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Team B (right)</p>
            <PlayerSlot
              label={singles ? "Player" : "Player 1"}
              value={opponentId}
              onChange={setOpponentId}
              useNew={useNewOpponent}
              setUseNew={setUseNewOpponent}
              newName={newOpponentName}
              setNewName={setNewOpponentName}
              placeholder="New player name"
            />
            {!singles && (
              <PlayerSlot
                label={matchFormat === "mixed_doubles" ? "Partner 2" : "Player 2"}
                value={opponent2Id}
                onChange={setOpponent2Id}
                useNew={useNewOpponent2}
                setUseNew={setUseNewOpponent2}
                newName={newOpponent2Name}
                setNewName={setNewOpponent2Name}
                placeholder="New player name"
              />
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-400">Match type</label>
            <select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as "recreational" | "tournament")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50"
            >
              <option value="recreational">Recreational</option>
              <option value="tournament">Tournament</option>
            </select>
          </div>
          {matchType === "tournament" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-400">Tournament name</label>
              <input
                type="text"
                value={tournamentName}
                onChange={(e) => setTournamentName(e.target.value)}
                placeholder="e.g. OC Open"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50 placeholder-zinc-500"
              />
            </div>
          )}
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-400">Location (optional)</label>
            {!useNewLocation ? (
              <div className="space-y-2">
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50"
                >
                  <option value="">No location</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setUseNewLocation(true)} className="text-xs text-zinc-500 underline">
                  Add new location
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  placeholder="Venue name"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50 placeholder-zinc-500"
                />
                <input
                  type="text"
                  value={newLocationAddress}
                  onChange={(e) => setNewLocationAddress(e.target.value)}
                  placeholder="Address (optional)"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50 placeholder-zinc-500"
                />
                <button type="button" onClick={() => { setUseNewLocation(false); setNewLocationName(""); setNewLocationAddress(""); }} className="text-xs text-zinc-500 underline">
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
