import { useId } from "react";

import Checkbox from "./Checkbox.jsx";
import DateInput from "./DateInput.jsx";
import FormField from "./FormField.jsx";
import NumberInput from "./NumberInput.jsx";
import Select from "./Select.jsx";
import TextInput from "./TextInput.jsx";
import Textarea from "./Textarea.jsx";
import Toggle from "./Toggle.jsx";

/*
 * A stored pattern is authored by an administrator, not by a browser, so an
 * invalid expression is dropped here rather than handed to a native input where
 * it would throw at submit time. The server still enforces it.
 */
function safePattern(pattern) {
  if (!pattern) return undefined;

  try {
    new RegExp(pattern);

    return pattern;
  } catch {
    return undefined;
  }
}

function toNumber(text) {
  const trimmed = String(text).trim();

  if (trimmed === "") return "";

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : trimmed;
}

function ReferencePicker({ id, label, hint, error, required, disabled, options, multiple, value, onChange }) {
  if (!options) {
    return (
      <TextInput
        id={id}
        label={label}
        hint="Options for this relation could not be loaded."
        error={error}
        value=""
        disabled
      />
    );
  }

  if (!multiple) {
    return (
      <Select
        id={id}
        label={label}
        hint={hint}
        error={error}
        required={required}
        disabled={disabled}
        placeholder="Select a record…"
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        options={options}
      />
    );
  }

  const selected = Array.isArray(value) ? value.map((entry) => Number(entry)) : [];

  return (
    <FormField id={id} label={label} hint={hint} error={error} required={required}>
      <ul
        id={id}
        className="max-h-48 space-y-0.5 overflow-y-auto rounded-control border border-line-strong bg-surface p-1.5"
      >
        {options.length === 0 ? (
          <li className="px-2 py-3 text-xs text-ink-muted">No records to choose from.</li>
        ) : null}

        {options.map((option, index) => {
          const optionValue = Number(option.value);
          const optionId = `${id}-opt-${index}`;

          return (
            <li key={optionId}>
              <label
                htmlFor={optionId}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-ink hover:bg-surface-sunken"
              >
                <input
                  id={optionId}
                  type="checkbox"
                  disabled={disabled}
                  className="h-4 w-4 shrink-0 rounded border-line-strong accent-brand"
                  checked={selected.includes(optionValue)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...selected, optionValue]
                        : selected.filter((entry) => entry !== optionValue)
                    )
                  }
                />

                <span className="truncate">{option.label ?? option.value}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </FormField>
  );
}

/*
 * Renders one dynamic field definition through the shared input primitives.
 *
 * The value contract is the storage type the server expects: strings for
 * text/date/dropdown, numbers, booleans, and record ids (or an array of them).
 * A number field emits the in-progress text while it is not yet parseable so
 * typing is never blocked; submission re-validates on the server.
 */
export default function FieldRenderer({
  field,
  value,
  onChange,
  error,
  id,
  disabled = false,
  options = null,
  recordOptions = null,
  className = "",
}) {
  const generated = useId();
  const fieldId = id ?? `${generated}-${field.key}`;
  const config = field.config ?? {};
  const required = Boolean(field.isRequired);
  const hint = field.helpText ?? undefined;
  const emit = (next) => onChange(field.key, next);

  const shared = {
    id: fieldId,
    label: field.label,
    hint,
    error,
    required,
    disabled,
    className,
  };

  switch (field.dataType) {
    case "text":
    case "email":
      return (
        <TextInput
          {...shared}
          type={field.dataType === "email" ? "email" : "text"}
          value={value ?? ""}
          onChange={(event) => emit(event.target.value)}
          placeholder={config.placeholder}
          minLength={config.minLength}
          maxLength={config.maxLength}
          pattern={safePattern(config.pattern)}
        />
      );

    case "textarea":
      return (
        <Textarea
          {...shared}
          rows={config.rows}
          value={value ?? ""}
          onChange={(event) => emit(event.target.value)}
          placeholder={config.placeholder}
          minLength={config.minLength}
          maxLength={config.maxLength}
        />
      );

    case "number":
      return (
        <NumberInput
          {...shared}
          value={value ?? ""}
          onChange={(event) => emit(toNumber(event.target.value))}
          placeholder={config.placeholder}
          min={config.min}
          max={config.max}
          step={config.decimalPlaces > 0 ? `1e-${config.decimalPlaces}` : 1}
        />
      );

    case "date":
      return (
        <DateInput
          {...shared}
          value={value ?? ""}
          onChange={(event) => emit(event.target.value)}
          min={config.minDate}
          max={config.maxDate}
        />
      );

    case "dropdown":
      return (
        <Select
          {...shared}
          value={value ?? ""}
          onChange={(event) => emit(event.target.value)}
          placeholder={options ? "Select an option…" : "Loading options…"}
          disabled={disabled || !options}
          options={options ?? []}
        />
      );

    case "checkbox":
      return (
        <Checkbox
          id={fieldId}
          label={field.label}
          hint={hint}
          error={error}
          disabled={disabled}
          className={className}
          checked={Boolean(value)}
          onChange={(event) => emit(event.target.checked)}
        />
      );

    case "toggle":
      return (
        <Toggle
          id={fieldId}
          label={field.label}
          hint={hint}
          error={error}
          disabled={disabled}
          className={className}
          trueLabel={config.trueLabel}
          falseLabel={config.falseLabel}
          checked={Boolean(value)}
          onChange={(event) => emit(event.target.checked)}
        />
      );

    case "record_reference":
    case "entity_reference":
    case "user_reference":
      return (
        <ReferencePicker
          id={fieldId}
          label={field.label}
          hint={hint}
          error={error}
          required={required}
          disabled={disabled}
          options={recordOptions || options}
          placeholder={
            field.dataType === "user_reference"
              ? "Select a user…"
              : field.dataType === "entity_reference"
                ? "Select an entity…"
                : "Select a record…"
          }
          multiple={Boolean(config.allowMultiple)}
          value={value}
          onChange={emit}
        />
      );

    default:
      return (
        <FormField id={fieldId} label={field.label} hint={hint} className={className}>
          <p className="rounded-control border border-dashed border-line-strong bg-surface-sunken px-3 py-2 text-xs text-ink-soft">
            Fields of type “{field.dataType}” cannot be entered here yet.
          </p>
        </FormField>
      );
  }
}
