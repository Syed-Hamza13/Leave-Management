import FormField from "./FormField.jsx";
import { controlClass, describeId } from "./controlStyles.js";

export default function TextInput({
  id,
  label,
  hint,
  error,
  required = false,
  className = "",
  inputClassName = "",
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
        type="text"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describeId(id, hint, error)}
        className={controlClass({ error, className: `h-10 ${inputClassName}` })}
        {...rest}
      />
    </FormField>
  );
}
