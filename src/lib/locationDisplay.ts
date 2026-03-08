/**
 * Safely get location name from Supabase join (object or array shape).
 * Use this for all location rendering; do not access location[0].name directly.
 */
export function getLocationName(
  location: undefined | null | { name?: unknown } | { name?: unknown }[]
): string | null {
  try {
    if (location == null) return null;
    if (Array.isArray(location)) {
      const first = location[0];
      if (first != null && typeof first === "object" && "name" in first) {
        const name = (first as { name: unknown }).name;
        return typeof name === "string" ? name : null;
      }
      return null;
    }
    if (typeof location === "object" && "name" in location) {
      const name = (location as { name: unknown }).name;
      return typeof name === "string" ? name : null;
    }
    return null;
  } catch {
    return null;
  }
}
