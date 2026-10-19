import { db } from "../../config/database.js";
import { insertAuditEvent, findAuditEvents, countAuditEvents } from "./audit.repository.js";

/*
 * Summary keys that must never reach the audit table.
 *
 * Administrators configure fields freely, so a definition change can easily
 * carry a password, token or secret value. Redaction happens here once for
 * every caller instead of relying on each call site remembering.
 */
const SENSITIVE_KEY_PATTERN = /password|secret|token|hash|credential|apikey|api_key/i;

function redactSummary(summary) {
  if (summary === null || summary === undefined) return null;

  if (typeof summary !== "object") return summary;

  if (Array.isArray(summary)) {
    return summary.slice(0, 50).map((entry) => redactSummary(entry));
  }

  const redacted = {};

  for (const [key, value] of Object.entries(summary)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      redacted[key] = "[redacted]";
      continue;
    }

    if (value !== null && typeof value === "object") {
      redacted[key] = redactSummary(value);
      continue;
    }

    if (typeof value === "string" && value.length > 500) {
      redacted[key] = `${value.slice(0, 500)}…`;
      continue;
    }

    redacted[key] = value;
  }

  return redacted;
}

/*
 * Writes an audit event.
 *
 * Pass `connection` to include the event in the caller's transaction (used for
 * record writes). Without a connection the write is best effort: an audit
 * failure must not turn a successful administrative change into a 500, but it
 * is logged so the gap is visible.
 */
export async function recordAudit(event) {
  const payload = {
    ...event,
    summary: redactSummary(event.summary ?? null),
    userAgent: event.userAgent ? String(event.userAgent).slice(0, 255) : null,
  };

  if (event.connection) {
    return insertAuditEvent(event.connection, payload);
  }

  try {
    return await insertAuditEvent(db, payload);
  } catch (error) {
    console.error("Audit event could not be recorded:", error.message);

    return null;
  }
}

export async function listAuditEvents(query) {
  const [events, total] = await Promise.all([
    findAuditEvents(query),
    countAuditEvents(query),
  ]);

  return { events, total };
}
