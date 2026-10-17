import { describeId } from "./controlStyles.js";

/*
 * Checkbox keeps its own inline label because the text sits beside the control
 * rather than above it, which is the layout builders use for boolean flags.
 */
export default function Checkbox({
  id,
  label,
  hint,
  error,
  className = "",
  ...rest
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-start gap-2.5">
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={describeId(id, hint, error)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong text-brand accent-brand"
          {...rest}
        />

        {label ? (
          <label htmlFor={id} className="text-sm text-ink">
            {label}
          </label>
        ) : null}
      </div>

      {hint && !error ? (
        <p id={`${id}-hint`} className="pl-6 text-xs text-ink-soft">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={`${id}-error`} className="pl-6 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
