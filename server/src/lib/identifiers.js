import { badRequest, conflict } from "./appError.js";

/*
 * Keys are the stable identifiers used inside JSON record payloads and
 * JSON_EXTRACT paths. They are validated against this pattern instead of
 * being trusted because they influence query construction, even though the
 * resulting path is always bound as a SQL parameter.
 */
const KEY_PATTERN = /^[a-z][a-z0-9_]{1,62}$/;

const RESERVED_KEYS = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "deleted_at",
  "status",
  "table_id",
  "schema_version",
  "data",
]);

export function isValidKey(value) {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

export function isReservedKey(value) {
  return RESERVED_KEYS.has(String(value).toLowerCase());
}

export function slugifyKey(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 63);
}

export function assertValidKey(value, label = "key") {
  if (!isValidKey(value)) {
    throw badRequest(
      `Invalid ${label}. Use 2-63 lowercase letters, numbers or underscores, starting with a letter.`,
      { code: "INVALID_KEY" }
    );
  }

  return value;
}

export function assertKeyNotReserved(value, label = "key") {
  if (isReservedKey(value)) {
    throw conflict(`${label} "${value}" is reserved by the system.`, {
      code: "RESERVED_KEY",
    });
  }

  return value;
}

/*
 * Builds a MySQL JSON path for a validated record key.
 *
 * The key is quoted inside the path so that keys containing underscores or
 * digits cannot be reinterpreted, and the whole path is passed to the driver
 * as a bound parameter rather than concatenated into SQL text.
 */
export function recordJsonPath(key) {
  assertValidKey(key, "column key");

  return `$."${key}"`;
}
