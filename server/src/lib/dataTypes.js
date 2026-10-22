import { z } from "zod";

import { badRequest } from "./appError.js";

/*
 * Single source of truth for every supported dynamic data type.
 *
 * Field definitions, column definitions, record validation and mapping
 * compatibility all resolve through this registry, so adding a new type is
 * a change in one place. The registry is also published to the client so
 * builder UIs never hard-code the type list.
 */

const STORAGE = {
  STRING: "string",
  NUMBER: "number",
  BOOLEAN: "boolean",
  DATE: "date",
  REFERENCE: "reference",
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const BOOLEAN_STRINGS = new Set([
  "true",
  "1",
  "yes",
  "on",
  "false",
  "0",
  "no",
  "off",
]);

function isEmptyValue(value) {
  return value === undefined || value === null || value === "";
}

function typeError(message) {
  return { ok: false, message };
}

const textConfigSchema = z.object({
  minLength: z.number().int().min(0).max(2000).optional(),
  maxLength: z.number().int().min(1).max(2000).optional(),
  pattern: z.string().min(1).max(200).optional(),
  placeholder: z.string().max(120).optional(),
});

const textareaConfigSchema = z.object({
  minLength: z.number().int().min(0).max(20000).optional(),
  maxLength: z.number().int().min(1).max(20000).optional(),
  rows: z.number().int().min(2).max(24).optional(),
  placeholder: z.string().max(120).optional(),
});

const numberConfigSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  decimalPlaces: z.number().int().min(0).max(6).optional(),
  placeholder: z.string().max(120).optional(),
});

const dateConfigSchema = z.object({
  minDate: z.string().regex(DATE_PATTERN).optional(),
  maxDate: z.string().regex(DATE_PATTERN).optional(),
});

const emailConfigSchema = z.object({
  maxLength: z.number().int().min(5).max(255).optional(),
  placeholder: z.string().max(120).optional(),
});

const phoneConfigSchema = z.object({
  minLength: z.number().int().min(1).max(20).optional(),
  maxLength: z.number().int().min(1).max(20).optional(),
  placeholder: z.string().max(120).optional(),
});

const dropdownConfigSchema = z.object({
  dropdownId: z.number().int().positive(),
});

const booleanConfigSchema = z.object({
  trueLabel: z.string().max(60).optional(),
  falseLabel: z.string().max(60).optional(),
});

const referenceConfigSchema = z.object({
  targetTableId: z.number().int().positive(),
  targetDisplayColumnKey: z.string().max(63).optional(),
  allowMultiple: z.boolean().optional(),
});

const entityReferenceConfigSchema = z.object({
  entityTypeId: z.number().int().positive().optional(),
  allowMultiple: z.boolean().optional(),
});

const userReferenceConfigSchema = z.object({
  allowMultiple: z.boolean().optional(),
});

function coerceString(value, config, label) {
  const text = typeof value === "number" ? String(value) : value;

  if (typeof text !== "string") {
    return typeError(`${label} must be text.`);
  }

  const trimmed = text.trim();

  if (config?.minLength && trimmed.length < config.minLength) {
    return typeError(`${label} must be at least ${config.minLength} characters.`);
  }

  if (config?.maxLength && trimmed.length > config.maxLength) {
    return typeError(`${label} must be at most ${config.maxLength} characters.`);
  }

  if (config?.pattern) {
    let expression;

    try {
      expression = new RegExp(config.pattern);
    } catch {
      return typeError(`${label} has an invalid validation pattern configured.`);
    }

    if (!expression.test(trimmed)) {
      return typeError(`${label} does not match the required format.`);
    }
  }

  return { ok: true, value: trimmed };
}

function coerceNumber(value, config, label) {
  const numeric = typeof value === "string" ? Number(value.trim()) : value;

  if (typeof numeric !== "number" || !Number.isFinite(numeric)) {
    return typeError(`${label} must be a number.`);
  }

  if (config?.min !== undefined && numeric < config.min) {
    return typeError(`${label} must be ${config.min} or greater.`);
  }

  if (config?.max !== undefined && numeric > config.max) {
    return typeError(`${label} must be ${config.max} or less.`);
  }

  const places = config?.decimalPlaces ?? 0;

  if (places === 0 && !Number.isInteger(numeric)) {
    return typeError(`${label} must be a whole number.`);
  }

  const factor = 10 ** places;
  const rounded = Math.round(numeric * factor) / factor;

  return { ok: true, value: rounded };
}

function coerceDate(value, config, label) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value.trim())) {
    return typeError(`${label} must be a date in YYYY-MM-DD format.`);
  }

  const normalized = value.trim();
  const parsed = new Date(`${normalized}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return typeError(`${label} is not a valid calendar date.`);
  }

  if (parsed.toISOString().slice(0, 10) !== normalized) {
    return typeError(`${label} is not a valid calendar date.`);
  }

  if (config?.minDate && normalized < config.minDate) {
    return typeError(`${label} cannot be earlier than ${config.minDate}.`);
  }

  if (config?.maxDate && normalized > config.maxDate) {
    return typeError(`${label} cannot be later than ${config.maxDate}.`);
  }

  return { ok: true, value: normalized };
}

function coerceEmail(value, config, label) {
  const result = coerceString(value, { maxLength: config?.maxLength ?? 255 }, label);

  if (!result.ok) return result;

  if (result.value && !z.string().email().safeParse(result.value).success) {
    return typeError(`${label} must be a valid email address.`);
  }

  return result;
}

function coercePhone(value, config, label) {
  const text = typeof value === "number" ? String(value) : value;

  if (typeof text !== "string") {
    return typeError(`${label} must be a valid phone number.`);
  }

  const trimmed = text.trim();

  if (!/^\d+$/.test(trimmed)) {
    return typeError(`${label} must contain only numbers.`);
  }

  const min = config?.minLength ?? 7;
  const max = config?.maxLength ?? 15;

  if (trimmed.length < min) {
    return typeError(`${label} must be at least ${min} digits.`);
  }

  if (trimmed.length > max) {
    return typeError(`${label} must be at most ${max} digits.`);
  }

  return { ok: true, value: trimmed };
}

function coerceBoolean(value, config, label) {
  if (typeof value === "boolean") {
    return { ok: true, value };
  }

  if (typeof value === "number" && (value === 0 || value === 1)) {
    return { ok: true, value: value === 1 };
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (BOOLEAN_STRINGS.has(normalized)) {
      return { ok: true, value: ["true", "1", "yes", "on"].includes(normalized) };
    }
  }

  return typeError(`${label} must be true or false.`);
}

function coerceDropdown(value, config, label) {
  if (typeof value !== "string" || !value.trim()) {
    return typeError(`${label} must select an option.`);
  }

  const option = value.trim();

  if (option.length > 190) {
    return typeError(`${label} option value is too long.`);
  }

  return { ok: true, value: option, requiresMembershipCheck: true };
}

function coerceReference(value, config, label) {
  const allowMultiple = Boolean(config?.allowMultiple);

  const normalizeId = (entry) => {
    const numeric = typeof entry === "string" ? Number(entry.trim()) : entry;

    if (typeof numeric !== "number" || !Number.isInteger(numeric) || numeric <= 0) {
      return null;
    }

    return numeric;
  };

  if (allowMultiple) {
    if (!Array.isArray(value)) {
      return typeError(`${label} must be a list of selected records.`);
    }

    if (value.length > 500) {
      return typeError(`${label} allows a maximum of 500 selections.`);
    }

    const ids = [];

    for (const entry of value) {
      const id = normalizeId(entry);

      if (id === null) {
        return typeError(`${label} contains an invalid record reference.`);
      }

      if (!ids.includes(id)) ids.push(id);
    }

    return { ok: true, value: ids, requiresReferenceCheck: true };
  }

  const id = normalizeId(value);

  if (id === null) {
    return typeError(`${label} must reference an existing record.`);
  }

  return { ok: true, value: id, requiresReferenceCheck: true };
}

export const DATA_TYPES = [
  {
    key: "text",
    label: "Short text",
    description: "Single line text such as names, codes or titles.",
    storage: STORAGE.STRING,
    input: "text",
    configSchema: textConfigSchema,
    configFields: [
      { key: "minLength", label: "Minimum length", type: "number", min: 0, max: 2000 },
      { key: "maxLength", label: "Maximum length", type: "number", min: 1, max: 2000 },
      { key: "pattern", label: "Regex pattern", type: "text", hint: "Optional regular expression" },
      { key: "placeholder", label: "Placeholder", type: "text" },
    ],
    coerce: coerceString,
    defaultConfig: { maxLength: 255 },
  },
  {
    key: "textarea",
    label: "Multiline text",
    description: "Paragraph length text such as reasons or comments.",
    storage: STORAGE.STRING,
    input: "textarea",
    configSchema: textareaConfigSchema,
    configFields: [
      { key: "minLength", label: "Minimum length", type: "number", min: 0, max: 20000 },
      { key: "maxLength", label: "Maximum length", type: "number", min: 1, max: 20000 },
      { key: "rows", label: "Visible rows", type: "number", min: 2, max: 24 },
      { key: "placeholder", label: "Placeholder", type: "text" },
    ],
    coerce: coerceString,
    defaultConfig: { maxLength: 5000, rows: 4 },
  },
  {
    key: "number",
    label: "Number",
    description: "Integer or decimal numeric values with optional bounds.",
    storage: STORAGE.NUMBER,
    input: "number",
    configSchema: numberConfigSchema,
    configFields: [
      { key: "min", label: "Minimum value", type: "number" },
      { key: "max", label: "Maximum value", type: "number" },
      { key: "decimalPlaces", label: "Decimal places", type: "number", min: 0, max: 6 },
      { key: "placeholder", label: "Placeholder", type: "text" },
    ],
    coerce: coerceNumber,
    defaultConfig: { decimalPlaces: 0 },
  },
  {
    key: "date",
    label: "Date",
    description: "Calendar date stored as YYYY-MM-DD.",
    storage: STORAGE.DATE,
    input: "date",
    configSchema: dateConfigSchema,
    configFields: [
      { key: "minDate", label: "Earliest date", type: "date" },
      { key: "maxDate", label: "Latest date", type: "date" },
    ],
    coerce: coerceDate,
    defaultConfig: {},
  },
  {
    key: "email",
    label: "Email",
    description: "Email address with format validation.",
    storage: STORAGE.STRING,
    input: "email",
    configSchema: emailConfigSchema,
    configFields: [
      { key: "maxLength", label: "Maximum length", type: "number", min: 5, max: 255 },
      { key: "placeholder", label: "Placeholder", type: "text" },
    ],
    coerce: coerceEmail,
    defaultConfig: { maxLength: 255 },
  },
  {
    key: "phone",
    label: "Mobile number",
    description: "Phone or mobile number containing only numeric digits.",
    storage: STORAGE.STRING,
    input: "tel",
    configSchema: phoneConfigSchema,
    configFields: [
      { key: "minLength", label: "Minimum digits", type: "number", min: 1, max: 20 },
      { key: "maxLength", label: "Maximum digits", type: "number", min: 1, max: 20 },
      { key: "placeholder", label: "Placeholder", type: "text" },
    ],
    coerce: coercePhone,
    defaultConfig: { minLength: 7, maxLength: 15, placeholder: "e.g. 9876543210" },
  },
  {
    key: "dropdown",
    label: "Dropdown",
    description: "Single choice from a managed option set.",
    storage: STORAGE.STRING,
    input: "select",
    configSchema: dropdownConfigSchema,
    configFields: [{ key: "dropdownId", label: "Option set", type: "dropdown-ref" }],
    coerce: coerceDropdown,
    defaultConfig: {},
  },
  {
    key: "checkbox",
    label: "Checkbox",
    description: "True/false value shown as a checkbox.",
    storage: STORAGE.BOOLEAN,
    input: "checkbox",
    configSchema: booleanConfigSchema,
    configFields: [
      { key: "trueLabel", label: "Checked label", type: "text" },
      { key: "falseLabel", label: "Unchecked label", type: "text" },
    ],
    coerce: coerceBoolean,
    defaultConfig: {},
  },
  {
    key: "toggle",
    label: "Toggle",
    description: "True/false value shown as a switch.",
    storage: STORAGE.BOOLEAN,
    input: "toggle",
    configSchema: booleanConfigSchema,
    configFields: [
      { key: "trueLabel", label: "On label", type: "text" },
      { key: "falseLabel", label: "Off label", type: "text" },
    ],
    coerce: coerceBoolean,
    defaultConfig: {},
  },
  {
    key: "record_reference",
    label: "Record reference",
    description: "Relation to a record in another logical table.",
    storage: STORAGE.REFERENCE,
    input: "record-picker",
    configSchema: referenceConfigSchema,
    configFields: [
      { key: "targetTableId", label: "Target table", type: "table-ref" },
      { key: "targetDisplayColumnKey", label: "Display column key", type: "text" },
      { key: "allowMultiple", label: "Allow multiple selections", type: "toggle" },
    ],
    coerce: coerceReference,
    defaultConfig: { allowMultiple: false },
  },
  {
    key: "entity_reference",
    label: "Organization entity",
    description: "Relation to an organization entity (e.g. Department, Team, Council).",
    storage: STORAGE.REFERENCE,
    input: "entity-picker",
    configSchema: entityReferenceConfigSchema,
    configFields: [
      { key: "entityTypeId", label: "Entity type", type: "entity-type-ref" },
      { key: "allowMultiple", label: "Allow multiple selections", type: "toggle" },
    ],
    coerce: coerceReference,
    defaultConfig: { allowMultiple: false },
  },
  {
    key: "user_reference",
    label: "User reference",
    description: "Relation to an employee or administrator account.",
    storage: STORAGE.REFERENCE,
    input: "user-picker",
    configSchema: userReferenceConfigSchema,
    configFields: [
      { key: "allowMultiple", label: "Allow multiple selections", type: "toggle" },
    ],
    coerce: coerceReference,
    defaultConfig: { allowMultiple: false },
  },
];

const DATA_TYPE_MAP = new Map(DATA_TYPES.map((type) => [type.key, type]));

export const DATA_TYPE_KEYS = DATA_TYPES.map((type) => type.key);

export const STORAGE_FAMILIES = STORAGE;

export function getDataType(key) {
  return DATA_TYPE_MAP.get(key) || null;
}

export function assertDataType(key, label = "data type") {
  const type = getDataType(key);

  if (!type) {
    throw badRequest(`Unsupported ${label} "${key}".`, { code: "UNSUPPORTED_DATA_TYPE" });
  }

  return type;
}

/*
 * Type-specific configuration is validated and defaults-merged here so a
 * stored definition always carries a complete, safe configuration object.
 */
export function normalizeTypeConfig(key, config) {
  const type = assertDataType(key);

  const merged = { ...(type.defaultConfig || {}), ...(config || {}) };

  const parsed = type.configSchema.safeParse(merged);

  if (!parsed.success) {
    throw badRequest(`Invalid configuration for ${type.label}.`, {
      code: "INVALID_TYPE_CONFIG",
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  /*
   * Empty optionals are dropped so persisted JSON stays small and
   * comparisons between saved and submitted configuration are stable.
   */
  const cleaned = {};

  for (const [entryKey, value] of Object.entries(parsed.data)) {
    if (value === undefined || value === "") continue;

    cleaned[entryKey] = value;
  }

  return cleaned;
}

/*
 * Validates and normalizes one submitted value.
 *
 * Returns the stored representation plus flags telling the caller which
 * asynchronous integrity checks are still required (dropdown option
 * membership and relation target existence). Shape and range rules are
 * enforced here; referential rules need database access and stay in the
 * record service.
 */
export function coerceValue({ typeKey, config, value, required, label }) {
  const type = assertDataType(typeKey);
  const displayLabel = label || type.label;

  if (isEmptyValue(value) || (Array.isArray(value) && value.length === 0)) {
    if (required) {
      return { ok: false, message: `${displayLabel} is required.` };
    }

    return { ok: true, value: null };
  }

  if (type.storage === STORAGE.BOOLEAN && !required && value === false) {
    return { ok: true, value: false };
  }

  const result = type.coerce(value, config || {}, displayLabel);

  if (!result.ok) return result;

  return {
    ok: true,
    value: result.value,
    requiresMembershipCheck: Boolean(result.requiresMembershipCheck),
    requiresReferenceCheck: Boolean(result.requiresReferenceCheck),
  };
}

/*
 * Mapping compatibility is decided by storage family plus, for dropdowns and
 * relations, by the referenced definition. This keeps a form field from being
 * mapped onto a column that cannot store it.
 */
export function isMappingCompatible(source, target) {
  const sourceType = getDataType(source?.type);
  const targetType = getDataType(target?.type);

  if (!sourceType || !targetType) return { compatible: false, reason: "Unknown data type." };

  if (sourceType.storage !== targetType.storage) {
    return {
      compatible: false,
      reason: `${sourceType.label} values cannot be stored in a ${targetType.label} column.`,
    };
  }

  if (sourceType.key === "dropdown" || targetType.key === "dropdown") {
    if (sourceType.key !== targetType.key) {
      return {
        compatible: false,
        reason: "A dropdown can only map to a dropdown using the same option set.",
      };
    }

    if (source.config?.dropdownId !== target.config?.dropdownId) {
      return {
        compatible: false,
        reason: "Both dropdowns must use the same option set.",
      };
    }
  }

  if (sourceType.storage === STORAGE.REFERENCE) {
    if (sourceType.key !== targetType.key) {
      return {
        compatible: false,
        reason: `${sourceType.label} cannot be mapped to a ${targetType.label}.`,
      };
    }

    if (sourceType.key === "record_reference") {
      if (source.config?.targetTableId !== target.config?.targetTableId) {
        return {
          compatible: false,
          reason: "Both sides must reference the same table.",
        };
      }
    }

    if (sourceType.key === "entity_reference") {
      if (
        source.config?.entityTypeId &&
        target.config?.entityTypeId &&
        source.config.entityTypeId !== target.config.entityTypeId
      ) {
        return {
          compatible: false,
          reason: "Both sides must reference the same entity type.",
        };
      }
    }

    if (Boolean(source.config?.allowMultiple) !== Boolean(target.config?.allowMultiple)) {
      return {
        compatible: false,
        reason: "Single and multiple selection references cannot be mixed.",
      };
    }
  }

  if (sourceType.storage === STORAGE.STRING) {
    const targetMax = target.config?.maxLength;
    const sourceMax = source.config?.maxLength;

    if (targetMax && sourceMax && sourceMax > targetMax) {
      return {
        compatible: false,
        reason: `Source allows ${sourceMax} characters but the column allows ${targetMax}.`,
      };
    }
  }

  return { compatible: true, reason: null };
}

/*
 * Serialized for the client so builder UIs render type pickers, configuration
 * forms and filter operators from server-owned metadata.
 */
export function describeDataTypes() {
  return DATA_TYPES.map((type) => ({
    key: type.key,
    label: type.label,
    description: type.description,
    storage: type.storage,
    input: type.input,
    configFields: type.configFields,
    defaultConfig: type.defaultConfig || {},
    filterOperators: FILTER_OPERATORS[type.storage],
  }));
}

export const FILTER_OPERATORS = {
  [STORAGE.STRING]: [
    { key: "contains", label: "Contains", arity: 1 },
    { key: "equals", label: "Equals", arity: 1 },
    { key: "notEquals", label: "Does not equal", arity: 1 },
    { key: "startsWith", label: "Starts with", arity: 1 },
    { key: "endsWith", label: "Ends with", arity: 1 },
    { key: "in", label: "Is one of", arity: "many" },
    { key: "isEmpty", label: "Is empty", arity: 0 },
    { key: "isNotEmpty", label: "Is not empty", arity: 0 },
  ],
  [STORAGE.NUMBER]: [
    { key: "equals", label: "Equals", arity: 1 },
    { key: "notEquals", label: "Does not equal", arity: 1 },
    { key: "gt", label: "Greater than", arity: 1 },
    { key: "gte", label: "Greater than or equal", arity: 1 },
    { key: "lt", label: "Less than", arity: 1 },
    { key: "lte", label: "Less than or equal", arity: 1 },
    { key: "between", label: "Between", arity: 2 },
    { key: "isEmpty", label: "Is empty", arity: 0 },
    { key: "isNotEmpty", label: "Is not empty", arity: 0 },
  ],
  [STORAGE.DATE]: [
    { key: "equals", label: "On date", arity: 1 },
    { key: "before", label: "Before", arity: 1 },
    { key: "after", label: "After", arity: 1 },
    { key: "between", label: "Between", arity: 2 },
    { key: "isEmpty", label: "Is empty", arity: 0 },
    { key: "isNotEmpty", label: "Is not empty", arity: 0 },
  ],
  [STORAGE.BOOLEAN]: [
    { key: "isTrue", label: "Is true", arity: 0 },
    { key: "isFalse", label: "Is false", arity: 0 },
    { key: "isEmpty", label: "Is empty", arity: 0 },
  ],
  [STORAGE.REFERENCE]: [
    { key: "in", label: "Is one of", arity: "many" },
    { key: "isEmpty", label: "Is empty", arity: 0 },
    { key: "isNotEmpty", label: "Is not empty", arity: 0 },
  ],
};

export function getFilterOperators(storage) {
  return FILTER_OPERATORS[storage] || [];
}

export function isSupportedOperator(storage, operator) {
  return getFilterOperators(storage).some((entry) => entry.key === operator);
}
