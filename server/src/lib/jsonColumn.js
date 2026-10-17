/*
 * MySQL JSON columns arrive as strings or already-parsed objects depending on
 * the driver path, so every read goes through one tolerant parser.
 */
export function parseJsonColumn(raw, fallback = null) {
  if (raw === null || raw === undefined) return fallback;

  if (typeof raw === "object") return raw;

  if (typeof raw !== "string") return fallback;

  const text = raw.trim();

  if (!text) return fallback;

  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function stringifyJsonColumn(value) {
  if (value === undefined) return null;

  return JSON.stringify(value ?? null);
}
