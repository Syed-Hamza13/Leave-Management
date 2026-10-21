import { useId } from "react";

import { useMetadata } from "../../features/metadata/MetadataContext.js";

import DateInput from "../ui/DateInput.jsx";
import NumberInput from "../ui/NumberInput.jsx";
import Select from "../ui/Select.jsx";
import TextInput from "../ui/TextInput.jsx";
import Toggle from "../ui/Toggle.jsx";

function toNumberOrNull(text) {
  const trimmed = String(text).trim();

  if (trimmed === "") return undefined;

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : undefined;
}

/*
 * Type-specific configuration is driven entirely by the `configFields` metadata
 * the server publishes, so adding a data type or a setting needs no client
 * change. Empty values are removed rather than sent as empty strings: the API
 * validates numbers and dates strictly.
 */
export default function TypeConfigEditor({
  dataTypeKey,
  config = {},
  onChange,
  errors = {},
  disabled = false,
  className = "",
}) {
  const { getDataType, lookups } = useMetadata();
  const idPrefix = useId();

  const type = getDataType(dataTypeKey);

  if (!type) {
    return (
      <p className={`text-xs text-ink-soft ${className}`}>
        Choose a data type to see its settings.
      </p>
    );
  }

  const entries = type.configFields ?? [];

  if (entries.length === 0) {
    return (
      <p className={`text-xs text-ink-soft ${className}`}>
        {type.label} needs no extra settings.
      </p>
    );
  }

  function write(key, value) {
    const next = { ...config };

    if (value === undefined || value === "") delete next[key];
    else next[key] = value;

    onChange(next);
  }

  function errorFor(key) {
    return errors[key] ?? errors[`config.${key}`];
  }

  const relationTables = (lookups.tables ?? []).filter((table) => !table.isSystem);

  return (
    <fieldset className={`space-y-3 ${className}`} disabled={disabled}>
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {type.label} settings
      </legend>

      {entries.map((entry) => {
        const id = `${idPrefix}-${entry.key}`;
        const value = config[entry.key];
        const error = errorFor(entry.key);

        if (entry.type === "toggle") {
          return (
            <Toggle
              key={entry.key}
              id={id}
              label={entry.label}
              hint={entry.hint}
              error={error}
              checked={Boolean(value)}
              onChange={(event) => write(entry.key, event.target.checked)}
            />
          );
        }

        if (entry.type === "dropdown-ref") {
          return (
            <Select
              key={entry.key}
              id={id}
              label={entry.label}
              hint={entry.hint}
              error={error}
              placeholder="Select an option set…"
              value={value === undefined || value === null ? "" : String(value)}
              onChange={(event) =>
                write(entry.key, event.target.value === "" ? undefined : Number(event.target.value))
              }
              options={(lookups.dropdowns ?? []).map((dropdown) => ({
                value: String(dropdown.id),
                label: `${dropdown.label} (${dropdown.optionCount} options)`,
              }))}
            />
          );
        }

        if (entry.type === "table-ref") {
          return (
            <Select
              key={entry.key}
              id={id}
              label={entry.label}
              hint={entry.hint}
              error={error}
              placeholder="Select a table…"
              value={value === undefined || value === null ? "" : String(value)}
              onChange={(event) =>
                write(entry.key, event.target.value === "" ? undefined : Number(event.target.value))
              }
              options={relationTables.map((table) => ({
                value: String(table.id),
                label: table.label,
              }))}
            />
          );
        }

        if (entry.type === "entity-type-ref") {
          return (
            <Select
              key={entry.key}
              id={id}
              label={entry.label}
              hint={entry.hint || "Optional. Leave blank to allow any organization entity."}
              error={error}
              placeholder="Any entity type…"
              value={value === undefined || value === null ? "" : String(value)}
              onChange={(event) =>
                write(entry.key, event.target.value === "" ? undefined : Number(event.target.value))
              }
              options={(lookups.entityTypes ?? []).map((entityType) => ({
                value: String(entityType.id),
                label: entityType.label,
              }))}
            />
          );
        }

        if (entry.type === "number") {
          return (
            <NumberInput
              key={entry.key}
              id={id}
              label={entry.label}
              hint={entry.hint}
              error={error}
              min={entry.min}
              max={entry.max}
              value={value ?? ""}
              onChange={(event) => write(entry.key, toNumberOrNull(event.target.value))}
            />
          );
        }

        if (entry.type === "date") {
          return (
            <DateInput
              key={entry.key}
              id={id}
              label={entry.label}
              hint={entry.hint}
              error={error}
              value={value ?? ""}
              onChange={(event) => write(entry.key, event.target.value)}
            />
          );
        }

        return (
          <TextInput
            key={entry.key}
            id={id}
            label={entry.label}
            hint={entry.hint}
            error={error}
            value={value ?? ""}
            onChange={(event) => write(entry.key, event.target.value)}
          />
        );
      })}
    </fieldset>
  );
}
