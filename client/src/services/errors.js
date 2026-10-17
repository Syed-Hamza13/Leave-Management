/*
 * The API reports failures as { success: false, code, message, errors? }.
 * `errors` is a Zod field-error map (arrays of messages) on definition
 * endpoints and a flat key-to-message map on record endpoints, so both shapes
 * are normalized to one string per key here.
 */
export function fieldErrors(error) {
  const raw = error?.data?.errors;

  if (!raw || typeof raw !== "object") return {};

  const normalized = {};

  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      const first = value.find((entry) => typeof entry === "string");

      if (first) normalized[key] = first;

      continue;
    }

    if (typeof value === "string" && value) normalized[key] = value;
  }

  return normalized;
}

export function errorMessage(error, fallback = "Something went wrong.") {
  if (!error) return fallback;

  const message = error.data?.message || error.message;

  return typeof message === "string" && message.trim() ? message : fallback;
}

/*
 * Warnings are advisory — an unmapped required column, for example — so they are
 * listed near the result rather than attached to a single input.
 */
export function warningMessages(payload) {
  const warnings = payload?.data?.warnings;

  return Array.isArray(warnings) ? warnings.filter((entry) => typeof entry === "string") : [];
}

/*
 * Endpoints that validate a whole collection (mapping entries, for instance)
 * report every problem at once under `details.errors` instead of per field.
 */
export function detailErrors(error) {
  const details = error?.data?.details?.errors;

  return Array.isArray(details) ? details.filter((entry) => typeof entry === "string") : [];
}
