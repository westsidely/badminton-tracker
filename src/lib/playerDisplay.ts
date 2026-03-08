type PlayerJoined = {
  display_name?: unknown;
  represented_as?: unknown;
  club_affiliation?: unknown;
  school_affiliation?: unknown;
  corporate_affiliation?: unknown;
  city?: unknown;
  country?: unknown;
};

function first(obj: PlayerJoined | undefined, keys: (keyof PlayerJoined)[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const key of keys) {
    const v = obj[key];
    if (v != null && typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function one(joined: unknown): PlayerJoined | undefined {
  if (Array.isArray(joined) && joined.length > 0 && joined[0] && typeof joined[0] === "object") return joined[0] as PlayerJoined;
  if (joined && typeof joined === "object") return joined as PlayerJoined;
  return undefined;
}

/** Priority: represented_as > club > school > corporate > city/country */
export function getPlayerRepresentationLabel(joined: unknown): string | null {
  const obj = one(joined);
  const label =
    first(obj, ["represented_as", "club_affiliation", "school_affiliation", "corporate_affiliation"]) ??
    (() => {
      const c = first(obj, ["city"]);
      const co = first(obj, ["country"]);
      if (c && co) return `${c}, ${co}`;
      return c ?? co ?? null;
    })();
  return label;
}

/**
 * Normalize Supabase join result (object or array) and return a display label.
 * Fallback order: display_name -> short player id -> "Unknown player".
 */
export function getPlayerDisplayName(
  joined: unknown,
  playerId: string | undefined
): string {
  const obj = one(joined);
  const name = obj && obj.display_name != null ? String(obj.display_name).trim() : undefined;
  if (name) return name;
  if (playerId) return playerId.slice(0, 8);
  return "Unknown player";
}
