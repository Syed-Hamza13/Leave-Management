import { useEffect, useRef } from "react";
import { describeId } from "./controlStyles.js";

/*
 * Checkbox component supporting standard labels, hints, error messages,
 * as well as standalone checkbox usage with auto indeterminate state.
 */
export default function Checkbox({
  id,
  label,
  hint,
  error,
  indeterminate,
  className = "",
  ...rest
}) {
  const localRef = useRef(null);

  useEffect(() => {
    if (localRef.current) {
      localRef.current.indeterminate = Boolean(indeterminate);
    }
  }, [indeterminate]);

  const inputEl = (
    <input
      ref={localRef}
      id={id}
      type="checkbox"
      aria-invalid={error ? true : undefined}
      aria-describedby={describeId(id, hint, error)}
      className={`h-4 w-4 shrink-0 rounded border-line text-brand accent-brand cursor-pointer focus:ring-brand ${
        !label && !hint && !error ? className : "mt-0.5"
      }`}
      {...rest}
    />
  );

  if (!label && !hint && !error) {
    return inputEl;
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-start gap-2.5">
        {inputEl}

        {label ? (
          <label htmlFor={id} className="text-sm text-ink cursor-pointer select-none">
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
