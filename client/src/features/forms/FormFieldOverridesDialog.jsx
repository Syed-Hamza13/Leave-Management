import { useState } from "react";

import Button from "../../components/ui/Button.jsx";
import Checkbox from "../../components/ui/Checkbox.jsx";
import Modal from "../../components/ui/Modal.jsx";
import TextInput from "../../components/ui/TextInput.jsx";

import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import { forms as formsApi } from "../../services/resources.js";

import { toFieldsPayload } from "./formFields.js";

const FORM_ID = "form-field-overrides-form";

/*
 * Overrides are opt-in per setting. Leaving one off keeps the form following
 * the shared field definition, so a later edit to that definition still reaches
 * this form.
 */
export default function FormFieldOverridesDialog({ form, formField, onClose, onSaved }) {
  const overrides = formField.overrides ?? {};

  const [useLabel, setUseLabel] = useState(overrides.label != null);
  const [label, setLabel] = useState(overrides.label ?? "");

  const [useHelpText, setUseHelpText] = useState(overrides.helpText != null);
  const [helpText, setHelpText] = useState(overrides.helpText ?? "");

  const [useRequired, setUseRequired] = useState(overrides.isRequired != null);
  const [isRequired, setIsRequired] = useState(Boolean(overrides.isRequired));

  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});

    const targetId = Number(formField.fieldId);

    const fields = toFieldsPayload(form.fields).map((entry) => {
      if (Number(entry.fieldId) !== targetId) return entry;

      const next = { fieldId: entry.fieldId };

      if (entry.config) next.config = entry.config;

      if (useLabel && label.trim()) next.label = label.trim();

      if (useHelpText && helpText.trim()) next.helpText = helpText.trim();

      if (useRequired) next.isRequired = isRequired;

      return next;
    });

    const outcome = await run(() => formsApi.update(form.id, { fields }));

    if (outcome.ok) {
      onSaved(outcome.result?.data);
      return;
    }

    setErrors(fieldErrors(outcome.error));
  }

  return (
    <Modal
      open
      onClose={pending ? () => {} : onClose}
      title={`Settings for “${formField.label}” on this form`}
      description="These apply to this form only. The shared field definition is unchanged."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form={FORM_ID} loading={pending}>
            Save settings
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error ? (
          <p
            role="alert"
            className="rounded-control border border-danger bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
          >
            {errorMessage(error, "The settings could not be saved.")}
          </p>
        ) : null}

        <div className="space-y-2 rounded-control border border-line bg-surface-sunken p-3">
          <Checkbox
            id="override-label"
            label="Use a different label on this form"
            checked={useLabel}
            onChange={(event) => setUseLabel(event.target.checked)}
          />

          {useLabel ? (
            <TextInput
              id="override-label-value"
              label="Label"
              data-autofocus
              hint={`The field definition uses “${formField.label}”.`}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              error={errors.fields}
              maxLength={160}
            />
          ) : null}
        </div>

        <div className="space-y-2 rounded-control border border-line bg-surface-sunken p-3">
          <Checkbox
            id="override-help-text"
            label="Use different help text on this form"
            checked={useHelpText}
            onChange={(event) => setUseHelpText(event.target.checked)}
          />

          {useHelpText ? (
            <TextInput
              id="override-help-text-value"
              label="Help text"
              value={helpText}
              onChange={(event) => setHelpText(event.target.value)}
              maxLength={500}
            />
          ) : null}
        </div>

        <div className="space-y-2 rounded-control border border-line bg-surface-sunken p-3">
          <Checkbox
            id="override-required"
            label="Decide whether this field is required on this form"
            checked={useRequired}
            onChange={(event) => setUseRequired(event.target.checked)}
          />

          {useRequired ? (
            <Checkbox
              id="override-required-value"
              label="Must be filled in"
              checked={isRequired}
              onChange={(event) => setIsRequired(event.target.checked)}
            />
          ) : null}
        </div>
      </form>
    </Modal>
  );
}
