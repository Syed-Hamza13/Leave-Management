/**
 * Dynamic Rule Condition Matcher & Action Evaluator
 * 
 * Evaluates configurable conditions against submitted leave request data
 * and applicant profile attributes to determine routing and notification actions.
 */

export function evaluateCondition(condition, { requestData = {}, applicant = {} }) {
  const { source = "request", field, operator, value: expected } = condition;

  let actual;
  if (source === "user") {
    // Check applicant user attributes or user custom profile values
    actual = applicant.values?.[field] ?? applicant[field];
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
      return String(actual).trim().toLowerCase() === String(expected).trim().toLowerCase();

    case "neq":
    case "not_equals":
      return String(actual).trim().toLowerCase() !== String(expected).trim().toLowerCase();

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
      }
      const val = isNumeric ? numActual : actual;
      return val >= min && val <= max;
    }

    case "in":
      if (Array.isArray(expected)) {
        return expected.some(
          (item) => String(item).trim().toLowerCase() === String(actual).trim().toLowerCase()
        );
      }
      return false;

    case "not_in":
      if (Array.isArray(expected)) {
        return !expected.some(
          (item) => String(item).trim().toLowerCase() === String(actual).trim().toLowerCase()
        );
      }
      return true;

    case "contains":
      return String(actual).toLowerCase().includes(String(expected).toLowerCase());

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

