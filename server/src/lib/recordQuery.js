import { badRequest } from "./appError.js";
import { coerceValue, getFilterOperators } from "./dataTypes.js";
import { MAX_FILTERS } from "./pagination.js";

/*
 * Filter, search and sort SQL assembly.
 *
 * Safety model: the client only ever supplies opaque keys and values. A key is
 * resolved through a caller-owned descriptor whose SQL expression is built from
 * server-side definitions, and every dynamic piece (JSON paths, literals,
 * limits) is bound as a parameter. No client string is concatenated into SQL.
 *
 * A descriptor is:
 *   { key, storage, dataTypeKey, config, accessor(), literal(value) }
 * where accessor() returns { sql, params } for the comparable expression.
 */

const LIKE_ESCAPE_CHARACTER = "!";

export function escapeLikePattern(value) {
  return String(value)
    .replaceAll(LIKE_ESCAPE_CHARACTER, `${LIKE_ESCAPE_CHARACTER}${LIKE_ESCAPE_CHARACTER}`)
    .replaceAll("%", `${LIKE_ESCAPE_CHARACTER}%`)
    .replaceAll("_", `${LIKE_ESCAPE_CHARACTER}_`);
}

const LIKE_CLAUSE = `LIKE ? ESCAPE '${LIKE_ESCAPE_CHARACTER}'`;

function assertDescriptor(resolveColumn, key) {
  const descriptor = resolveColumn(key);

  if (!descriptor) {
    throw badRequest(`"${key}" cannot be used for filtering or sorting.`, {
      code: "INVALID_COLUMN",
    });
  }

  return descriptor;
}

function assertOperator(descriptor, operator) {
  const supported = getFilterOperators(descriptor.storage);
  const found = supported.find((entry) => entry.key === operator);

  if (!found) {
    throw badRequest(`Operator "${operator}" is not supported for ${descriptor.key}.`, {
      code: "INVALID_FILTER_OPERATOR",
    });
  }

  return found;
}

function coerceFilterValue(descriptor, value, label) {
  const result = coerceValue({
    typeKey: descriptor.dataTypeKey,
    config: descriptor.config,
    value,
    required: true,
    label,
  });

  if (!result.ok) {
    throw badRequest(result.message, { code: "INVALID_FILTER_VALUE" });
  }

  return result.value;
}

function normalizeValueList(rawValue, descriptor, expected, label) {
  const list = Array.isArray(rawValue) ? rawValue : [rawValue];

  if (expected !== "many" && list.length !== expected) {
    throw badRequest(`${label} expects exactly ${expected} value(s).`, {
      code: "INVALID_FILTER_VALUE",
    });
  }

  if (expected === "many") {
    if (!Array.isArray(rawValue) || rawValue.length === 0) {
      throw badRequest(`${label} expects a non-empty list of values.`, {
        code: "INVALID_FILTER_VALUE",
      });
    }

    if (rawValue.length > 100) {
      throw badRequest(`${label} accepts a maximum of 100 values.`, {
        code: "FILTER_VALUE_LIMIT",
      });
    }
  }

  return list.map((entry) => coerceFilterValue(descriptor, entry, label));
}

function isEmptyCondition(descriptor) {
  const { sql, params } = descriptor.accessor();

  return {
    sql: `(${sql} IS NULL OR ${sql} = '' OR CAST(${sql} AS CHAR) = 'null')`,
    params: [...params, ...params, ...params],
  };
}

function comparison(descriptor, operator, values) {
  const { sql, params } = descriptor.accessor();

  switch (operator) {
    case "equals": {
      const literal = descriptor.literal(values[0]);

      return { sql: `${sql} = ${literal.sql}`, params: [...params, ...literal.params] };
    }

    case "notEquals": {
      const literal = descriptor.literal(values[0]);

      return {
        sql: `(${sql} IS NULL OR ${sql} <> ${literal.sql})`,
        params: [...params, ...params, ...literal.params],
      };
    }

    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const symbols = { gt: ">", gte: ">=", lt: "<", lte: "<=" };
      const literal = descriptor.literal(values[0]);

      return {
        sql: `${sql} ${symbols[operator]} ${literal.sql}`,
        params: [...params, ...literal.params],
      };
    }

    case "before": {
      const literal = descriptor.literal(values[0]);

      return { sql: `${sql} < ${literal.sql}`, params: [...params, ...literal.params] };
    }

    case "after": {
      const literal = descriptor.literal(values[0]);

      return { sql: `${sql} > ${literal.sql}`, params: [...params, ...literal.params] };
    }

    case "between": {
      const lower = descriptor.literal(values[0]);
      const upper = descriptor.literal(values[1]);

      return {
        sql: `${sql} BETWEEN ${lower.sql} AND ${upper.sql}`,
        params: [...params, ...lower.params, ...upper.params],
      };
    }

    case "in": {
      const literals = values.map((entry) => descriptor.literal(entry));

      return {
        sql: `${sql} IN (${literals.map((entry) => entry.sql).join(", ")})`,
        params: [...params, ...literals.flatMap((entry) => entry.params)],
      };
    }

    default:
      throw badRequest(`Operator "${operator}" is not supported for ${descriptor.key}.`, {
        code: "INVALID_FILTER_OPERATOR",
      });
  }
}

function textCondition(descriptor, operator, value) {
  const { sql, params } = descriptor.accessor();

  const escaped = escapeLikePattern(value);
  const patterns = {
    contains: `%${escaped}%`,
    startsWith: `${escaped}%`,
    endsWith: `%${escaped}`,
    equals: value,
  };

  if (operator === "equals") {
    return {
      sql: `LOWER(CAST(${sql} AS CHAR)) = LOWER(?)`,
      params: [...params, value],
    };
  }

  return {
    sql: `LOWER(CAST(${sql} AS CHAR)) ${LIKE_CLAUSE}`,
    params: [...params, patterns[operator].toLowerCase()],
  };
}

function buildCondition(descriptor, operator, rawValue) {
  const label = descriptor.key;

  if (operator === "isEmpty" || operator === "isNotEmpty") {
    const empty = isEmptyCondition(descriptor);

    if (operator === "isEmpty") return empty;

    return { sql: `NOT ${empty.sql}`, params: empty.params };
  }

  if (descriptor.storage === "boolean") {
    if (operator === "isTrue") {
      const literal = descriptor.literal(true);
      const { sql, params } = descriptor.accessor();

      return { sql: `${sql} = ${literal.sql}`, params: [...params, ...literal.params] };
    }

    const literal = descriptor.literal(false);
    const { sql, params } = descriptor.accessor();

    return { sql: `${sql} = ${literal.sql}`, params: [...params, ...literal.params] };
  }

  if (operator === "contains" || operator === "startsWith" || operator === "endsWith") {
    if (descriptor.storage !== "string") {
      throw badRequest(`Text search operators are not supported for ${label}.`, {
        code: "INVALID_FILTER_OPERATOR",
      });
    }

    const [value] = normalizeValueList(rawValue, descriptor, 1, label);

    return textCondition(descriptor, operator, escapeLikePattern(value));
  }

  if (operator === "equals" && descriptor.storage === "string") {
    const [value] = normalizeValueList(rawValue, descriptor, 1, label);

    return textCondition(descriptor, "equals", value);
  }

  const expected = operator === "between" ? 2 : operator === "in" ? "many" : 1;
  const values = normalizeValueList(rawValue, descriptor, expected, label);

  return comparison(descriptor, operator, values);
}

export function buildFilterWhereClause({ filters = [], resolveColumn }) {
  if (!filters || filters.length === 0) {
    return { sql: "", params: [] };
  }

  if (filters.length > MAX_FILTERS) {
    throw badRequest(`A maximum of ${MAX_FILTERS} filters is allowed.`, {
      code: "FILTER_LIMIT_EXCEEDED",
    });
  }

  const clauses = [];
  const params = [];

  for (const filter of filters) {
    const descriptor = assertDescriptor(resolveColumn, filter.column);
    assertOperator(descriptor, filter.operator);

    const condition = buildCondition(descriptor, filter.operator, filter.value);

    clauses.push(condition.sql);
    params.push(...condition.params);
  }

  return {
    sql: clauses.join(" AND "),
    params,
  };
}

export function buildSearchClause({ search, descriptors = [] }) {
  if (!search) {
    return { sql: "", params: [] };
  }

  const searchable = descriptors.filter(
    (descriptor) =>
      descriptor.storage === "string" ||
      descriptor.storage === "date" ||
      descriptor.storage === "number"
  );

  if (searchable.length === 0) {
    return { sql: "", params: [] };
  }

  const pattern = `%${escapeLikePattern(search.toLowerCase())}%`;
  const clauses = [];
  const params = [];

  for (const descriptor of searchable) {
    const { sql, params: accessorParams } = descriptor.accessor();

    clauses.push(`LOWER(CAST(${sql} AS CHAR)) ${LIKE_CLAUSE}`);
    params.push(...accessorParams, pattern);
  }

  return {
    sql: `(${clauses.join(" OR ")})`,
    params,
  };
}

export function buildOrderByClause({ sortTerms = [], resolveColumn, fallbackSql = null }) {
  if (!sortTerms || sortTerms.length === 0) {
    return { sql: fallbackSql ? `ORDER BY ${fallbackSql}` : "", params: [] };
  }

  const parts = [];
  const params = [];

  for (const term of sortTerms) {
    const descriptor = assertDescriptor(resolveColumn, term.key);
    const { sql, params: accessorParams } = descriptor.accessor();

    parts.push(`${sql} ${term.direction === "desc" ? "DESC" : "ASC"}`);
    params.push(...accessorParams);
  }

  const trailing = fallbackSql ? `, ${fallbackSql}` : "";

  return { sql: `ORDER BY ${parts.join(", ")}${trailing}`, params };
}

/*
 * Combines a caller-owned base condition with filters and search.
 *
 * `base` is { sql, params } and its parameters are emitted first, matching the
 * order of the returned SQL. Callers append ORDER BY / LIMIT parameters after
 * the returned array.
 */
export function buildWhereClause({
  filters = [],
  search,
  descriptors = [],
  resolveColumn,
  base = { sql: "", params: [] },
}) {
  const filterClause = buildFilterWhereClause({ filters, resolveColumn });
  const searchClause = buildSearchClause({ search, descriptors });

  const parts = [];
  const params = [];

  if (base.sql) {
    parts.push(base.sql);
    params.push(...base.params);
  }

  if (filterClause.sql) {
    parts.push(filterClause.sql);
    params.push(...filterClause.params);
  }

  if (searchClause.sql) {
    parts.push(searchClause.sql);
    params.push(...searchClause.params);
  }

  return {
    sql: parts.length > 0 ? `WHERE ${parts.join(" AND ")}` : "",
    params,
  };
}
