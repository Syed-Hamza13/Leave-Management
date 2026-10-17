/*
 * Label, hint, error and required marker around any control.
 *
 * The control itself is a child so the same wrapper serves native inputs,
 * selects, toggles and the dynamic FieldRenderer without each of them
 * re-implementing error placement.
 */
export default function FormField({
  id,
  label,
  hint,
  error,
  required = false,
  className = "",
  children,
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label ? (
        <label
          htmlFor={id}
          className="flex items-baseline gap-1 text-sm font-medium text-ink"
        >
          <span>{label}</span>
          {required ? (
            <span className="text-danger" aria-hidden="true">
              *
            </span>
          ) : null}
          {required ? <span className="sr-only">(required)</span> : null}
        </label>
      ) : null}

      {children}

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
