/**
 * Dynamic Rule Condition Matcher & Action Evaluator
 * 
 * Evaluates configurable conditions against submitted leave request data
 * and applicant profile attributes to determine routing and notification actions.
 */

function normalizeVal(val) {
  if (val === null || val === undefined) return "";
  return String(val).trim().toLowerCase();
}

function matchesText(a, b) {
  const normA = normalizeVal(a);
  const normB = normalizeVal(b);
  if (normA === normB) return true;
  // Treat underscores and spaces as equivalent (e.g. "programme_staff" <=> "Programme Staff")
  return normA.replace(/_/g, " ") === normB.replace(/_/g, " ");
}

export function evaluateCondition(condition, { requestData = {}, applicant = {} }) {
  const { source = "request", field, operator, value: expected } = condition;

  let actual;
  if (source === "user") {
    // Check applicant user attributes or user custom profile values
    actual = applicant.values?.[field] ?? applicant[field];
    // Support staff_category and staff_type aliases interchangeably
    if (actual === undefined && (field === "staff_category" || field === "staff_type")) {
      actual = applicant.values?.staff_type ?? applicant.values?.staff_category;
    }
  } else {
    // Check request data
    actual = requestData[field];
  }

  // Normalize comparisons
  if (actual === undefined || actual === null) {
    if (operator === "empty" || operator === "is_null") return true;
    if (operator === "not_empty" || operator === "not_null") return false;
    if (expected === null || expected === undefined) return operator === "eq";
    return false;
  }

  const numActual = Number(actual);
  const numExpected = Number(expected);
  const isNumeric = !isNaN(numActual) && !isNaN(numExpected);

  switch (operator) {
    case "eq":
    case "equals":
      if (Array.isArray(actual)) {
        return actual.some((a) => matchesText(a, expected));
      }
      return matchesText(actual, expected);

    case "neq":
    case "not_equals":
      if (Array.isArray(actual)) {
        return !actual.some((a) => matchesText(a, expected));
      }
      return !matchesText(actual, expected);

    case "gt":
    case "greater_than":
      return isNumeric ? numActual > numExpected : actual > expected;

    case "gte":
    case "greater_than_or_equal":
      return isNumeric ? numActual >= numExpected : actual >= expected;

    case "lt":
    case "less_than":
      return isNumeric ? numActual < numExpected : actual < expected;

    case "lte":
    case "less_than_or_equal":
      return isNumeric ? numActual <= numExpected : actual <= expected;

    case "between": {
      let min, max;
      if (Array.isArray(expected)) {
        [min, max] = expected;
      } else if (typeof expected === "object" && expected !== null) {
        min = expected.min;
        max = expected.max;
      } else if (typeof expected === "string" && expected.includes(",")) {
        const parts = expected.split(",").map(Number);
        min = parts[0];
        max = parts[1];
      }
      const val = isNumeric ? numActual : actual;
      return val >= min && val <= max;
    }

    case "in":
      if (Array.isArray(expected)) {
        return expected.some((item) =>
          Array.isArray(actual)
            ? actual.some((a) => matchesText(item, a))
            : matchesText(item, actual)
        );
      }
      if (typeof expected === "string") {
        const parts = expected.split(",").map((p) => p.trim());
        return parts.some((item) =>
          Array.isArray(actual)
            ? actual.some((a) => matchesText(item, a))
            : matchesText(item, actual)
        );
      }
      return false;

    case "not_in":
      if (Array.isArray(expected)) {
        return !expected.some((item) =>
          Array.isArray(actual)
            ? actual.some((a) => matchesText(item, a))
            : matchesText(item, actual)
        );
      }
      return true;

    case "contains":
      return normalizeVal(actual).includes(normalizeVal(expected));

    default:
      return false;
  }
}

/**
 * Evaluates whether all/any conditions of a rule match.
 */
export function matchRule(rule, { requestData = {}, applicant = {} }) {
  if (!rule || rule.status === "inactive") return false;

  const conditions = rule.conditions || [];
  if (conditions.length === 0) return true; // Default fallback rule

  const combinator = (rule.combinator || "AND").toUpperCase();

  if (combinator === "OR") {
    return conditions.some((cond) => evaluateCondition(cond, { requestData, applicant }));
  }

  // Default is AND
  return conditions.every((cond) => evaluateCondition(cond, { requestData, applicant }));
}

/**
 * Finds the highest-priority matching rule from a list of rules.
 */
export function findMatchingRule(rules = [], { requestData = {}, applicant = {} }) {
  const sorted = [...rules].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));

  for (const rule of sorted) {
    if (matchRule(rule, { requestData, applicant })) {
      return rule;
    }
  }

  return null;
}

