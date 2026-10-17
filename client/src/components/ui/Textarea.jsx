import FormField from "./FormField.jsx";
import { controlClass, describeId } from "./controlStyles.js";

export default function Textarea({
  id,
  label,
  hint,
  error,
  required = false,
  rows = 4,
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
      <textarea
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describeId(id, hint, error)}
        className={controlClass({ error, className: "py-2" })}
        {...rest}
      />
    </FormField>
  );
}
