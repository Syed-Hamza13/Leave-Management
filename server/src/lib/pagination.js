import { badRequest } from "./appError.js";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;
export const MAX_SORT_COLUMNS = 3;
export const MAX_FILTERS = 12;

const SORT_DIRECTIONS = new Set(["asc", "desc"]);

function toInteger(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parsePagination(query = {}) {
  const page = Math.max(1, toInteger(query.page, 1));

  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, toInteger(query.pageSize, DEFAULT_PAGE_SIZE))
  );

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    limit: pageSize,
  };
}

export function buildPageMeta({ page, pageSize, total }) {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

/*
 * Sort requests are resolved against a caller-provided allow-list.
 *
 * The client only ever names a key; the caller maps that key onto a
 * server-owned SQL expression or JSON path, so no client string reaches
 * the query text.
 */
export function parseSort(query = {}, allowedKeys = [], fallback = []) {
  const raw = query.sort;

  if (!raw) {
    return normalizeSortTerms(fallback, allowedKeys);
  }

  const requested = Array.isArray(raw) ? raw : String(raw).split(",");

  if (requested.length > MAX_SORT_COLUMNS) {
    throw badRequest(`A maximum of ${MAX_SORT_COLUMNS} sort columns is allowed.`, {
      code: "SORT_LIMIT_EXCEEDED",
    });
  }

  const terms = [];

  for (const entry of requested) {
    const text = String(entry).trim();

    if (!text) continue;

    const [key, direction] = text.split(":");
    const normalizedKey = String(key || "").trim();
    const normalizedDirection = String(direction || "asc").trim().toLowerCase();

    if (!allowedKeys.includes(normalizedKey)) {
      throw badRequest(`Sorting on "${normalizedKey}" is not allowed.`, {
        code: "INVALID_SORT_KEY",
      });
    }

    if (!SORT_DIRECTIONS.has(normalizedDirection)) {
      throw badRequest(`Invalid sort direction "${normalizedDirection}".`, {
        code: "INVALID_SORT_DIRECTION",
      });
    }

    terms.push({ key: normalizedKey, direction: normalizedDirection });
  }

  return terms;
}

function normalizeSortTerms(terms, allowedKeys) {
  return (terms || [])
    .filter((term) => allowedKeys.includes(term.key))
    .map((term) => ({
      key: term.key,
      direction: SORT_DIRECTIONS.has(term.direction) ? term.direction : "asc",
    }));
}

export function parseSearch(query = {}) {
  const search = String(query.search ?? "").trim();

  if (!search) return null;

  if (search.length > 200) {
    throw badRequest("Search text is too long (maximum 200 characters).", {
      code: "SEARCH_TOO_LONG",
    });
  }

  return search;
}

/*
 * LIMIT/OFFSET are emitted as literal integers rather than placeholders.
 *
 * MySQL rejects bound parameters for LIMIT in some prepared-statement paths,
 * and both values are already clamped integers produced by parsePagination, so
 * there is no client-controlled text in the resulting SQL.
 */
export function limitClause(limit, offset) {
  const safeLimit = Number.isInteger(limit) ? limit : DEFAULT_PAGE_SIZE;
  const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;

  return `LIMIT ${Math.min(Math.max(safeLimit, 1), MAX_PAGE_SIZE)} OFFSET ${safeOffset}`;
}
