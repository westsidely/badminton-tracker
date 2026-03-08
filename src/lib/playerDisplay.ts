/**
 * Normalize Supabase join result (object or array) and return a display label.
 * Fallback order: display_name -> short player id -> "Unknown player".
 */
export function getPlayerDisplayName(
  joined: unknown,
  playerId: string | undefined
): string {
  let name: string | undefined;
  if (Array.isArray(joined) && joined.length > 0 && joined[0]?.display_name != null) {
    name = String(joined[0].display_name).trim();
  } else if (
    joined &&
    typeof joined === "object" &&
    "display_name" in joined &&
    (joined as { display_name: unknown }).display_name != null
  ) {
    name = String((joined as { display_name: string }).display_name).trim();
  }
  if (name) return name;
  if (playerId) return playerId.slice(0, 8);
  return "Unknown player";
}
