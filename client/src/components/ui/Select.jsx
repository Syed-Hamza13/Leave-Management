import FormField from "./FormField.jsx";
import { controlClass, describeId } from "./controlStyles.js";

export default function Select({
  id,
  label,
  hint,
  error,
  required = false,
  options,
  placeholder,
  className = "",
  children,
  ...rest
}) {
  return (
    <FormField
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describeId(id, hint, error)}
        className={controlClass({ error, className: "h-10 pr-8" })}
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}

        {options
          ? options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          : children}
      </select>
    </FormField>
  );
}
