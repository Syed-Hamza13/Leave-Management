import { useState } from "react";
import FormField from "./FormField.jsx";
import { controlClass, describeId } from "./controlStyles.js";

export default function TextInput({
  id,
  label,
  hint,
  error,
  required = false,
  type = "text",
  className = "",
  inputClassName = "",
  showToggle = true,
  ...rest
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const hasToggle = isPassword && showToggle;
  const effectiveType = isPassword ? (showPassword ? "text" : "password") : type;

  const inputNode = (
    <input
      id={id}
      type={effectiveType}
      required={required}
      aria-invalid={error ? true : undefined}
      aria-describedby={describeId(id, hint, error)}
      className={controlClass({
        error,
        className: `h-10 ${hasToggle ? "pr-10" : ""} ${inputClassName}`,
      })}
      {...rest}
    />
  );

  return (
    <FormField
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      {hasToggle ? (
        <div className="relative">
          {inputNode}
          <button
            type="button"
            disabled={rest.disabled}
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            title={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:bg-surface-sunken hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-50 transition-colors"
          >
            {showPassword ? (
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      ) : (
        inputNode
      )}
    </FormField>
  );
}
