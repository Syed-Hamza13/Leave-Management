/*
 * `PATCH /admin/forms/:id` replaces the whole ordered field list, so every save
 * has to send back the fields that are not changing too.
 *
 * Only the stored overrides are sent, never the resolved label/required value:
 * sending a resolved value would freeze it into an override and stop future
 * edits to the shared field definition from reaching this form.
 */
export function toFormEntry(formField) {
  const overrides = formField.overrides ?? {};
  const entry = { fieldId: formField.fieldId };

  if (overrides.label !== null && overrides.label !== undefined) {
    entry.label = overrides.label;
  }

  if (overrides.helpText !== null && overrides.helpText !== undefined) {
    entry.helpText = overrides.helpText;
  }

  if (overrides.isRequired !== null && overrides.isRequired !== undefined) {
    entry.isRequired = overrides.isRequired;
  }

  if (overrides.config) {
    entry.config = overrides.config;
  }

  return entry;
}

export function toFieldsPayload(formFields = []) {
  return formFields.map(toFormEntry);
}
