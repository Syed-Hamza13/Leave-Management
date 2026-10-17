/*
 * Records store typed values in a JSON payload, so a cell is rendered from the
 * value's storage family rather than from a per-type component tree.
 */
export function isEmptyValue(value) {
  if (value === null || value === undefined || value === "") return true;

  return Array.isArray(value) && value.length === 0;
}

function referenceLabel(value, options) {
  const match = options?.find((option) => Number(option.value) === Number(value));

  return match?.label ?? `#${value}`;
}

export function formatRecordValue(value, { storage = "string", options = null } = {}) {
  if (isEmptyValue(value)) return "—";

  if (storage === "boolean") return value ? "Yes" : "No";

  if (storage === "reference") {
    if (Array.isArray(value)) {
      return value.map((entry) => referenceLabel(entry, options)).join(", ");
    }

    return referenceLabel(value, options);
  }

  if (Array.isArray(value)) return value.join(", ");

  return String(value);
}

/*
 * A mapped submission is keyed by form field key, while a stored record is keyed
 * by column key, so both directions of that translation live in one place.
 */
export function initialValuesFromFields(fields, entries, storedValues) {
  const columnKeyByFieldKey = new Map(
    (entries ?? []).map((entry) => [entry.field.key, entry.column.key])
  );

  const values = {};

  for (const field of fields) {
    if (storedValues) {
      const columnKey = columnKeyByFieldKey.get(field.key);

      values[field.key] = columnKey ? storedValues[columnKey] ?? null : null;
      continue;
    }

    values[field.key] = field.defaultValue ?? null;
  }

  return values;
}

/*
 * A relation picker names records by their table's display column, falling back
 * to the first visible column an administrator would recognise.
 */
export function pickDisplayKey(table) {
  if (table?.displayColumnKey) return table.displayColumnKey;

  const preferred = (table?.columns ?? []).find(
    (column) => !column.isSystem && column.isVisible && column.status === "active"
  );

  return preferred?.key ?? null;
}
