/**
 * Safely get location name from Supabase join (object or array shape).
 */
export function getLocationName(
  location: undefined | null | { name?: string } | { name?: string }[]
): string | null {
  if (location == null) return null;
  if (Array.isArray(location)) {
    const first = location[0];
    return first != null && typeof first === "object" && typeof first.name === "string" ? first.name : null;
  }
  return typeof location.name === "string" ? location.name : null;
}
