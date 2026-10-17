import { describeId } from "./controlStyles.js";

/*
 * A switch is still a checkbox semantically: role, checked state and keyboard
 * operation come free from the underlying input, which stays visible to
 * assistive technology and hidden visually.
 */
export default function Toggle({
  id,
  label,
  hint,
  error,
  trueLabel = "Yes",
  falseLabel = "No",
  checked = false,
  className = "",
  ...rest
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center gap-3">
        <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
          <input
            id={id}
            type="checkbox"
            className="peer h-6 w-11 cursor-pointer appearance-none rounded-full border border-line-strong bg-surface-sunken transition-colors checked:border-brand checked:bg-brand disabled:cursor-not-allowed disabled:opacity-60"
            checked={checked}
            aria-invalid={error ? true : undefined}
            aria-describedby={describeId(id, hint, error)}
            {...rest}
          />

          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0.5 h-[18px] w-[18px] rounded-full bg-surface shadow transition-transform peer-checked:translate-x-5"
          />
        </span>

        {label ? (
          <label htmlFor={id} className="text-sm text-ink">
            {label}
          </label>
        ) : null}

        <span className="text-xs text-ink-muted">
          {checked ? trueLabel : falseLabel}
        </span>
      </div>

      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-ink-soft">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
