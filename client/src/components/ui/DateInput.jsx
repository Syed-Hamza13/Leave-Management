import FormField from "./FormField.jsx";
import { controlClass, describeId } from "./controlStyles.js";

export default function DateInput({
  id,
  label,
  hint,
  error,
  required = false,
  className = "",
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
      <input
        id={id}
        type="date"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describeId(id, hint, error)}
        className={controlClass({ error, className: "h-10" })}
        {...rest}
      />
    </FormField>
  );
}
