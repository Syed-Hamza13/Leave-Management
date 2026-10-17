import { useState } from "react";

import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
import Textarea from "../../components/ui/Textarea.jsx";

import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import { forms as formsApi } from "../../services/resources.js";

const FORM_ID = "form-dialog-form";

export default function FormDialog({ form, onClose, onSaved }) {
  const isEdit = Boolean(form);

  const [label, setLabel] = useState(form?.label ?? "");
  const [key, setKey] = useState(form?.key ?? "");
  const [description, setDescription] = useState(form?.description ?? "");
  const [submitLabel, setSubmitLabel] = useState(form?.submitLabel ?? "");
  const [cancelLabel, setCancelLabel] = useState(form?.cancelLabel ?? "");
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  function buildPayload() {
    const payload = {
      label: label.trim(),
      description: description.trim() || null,
    };

    if (submitLabel.trim()) payload.submitLabel = submitLabel.trim();

    if (cancelLabel.trim()) payload.cancelLabel = cancelLabel.trim();

    if (!isEdit && key.trim()) payload.key = key.trim();

    return payload;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});

    const payload = buildPayload();

    const outcome = await run(() =>
      isEdit ? formsApi.update(form.id, payload) : formsApi.create(payload)
    );

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
      title={isEdit ? `Edit “${form.label}”` : "New form"}
      description="Fields are added and ordered on the form page after it is created."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form={FORM_ID} loading={pending}>
            {isEdit ? "Save form" : "Create form"}
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
            {errorMessage(error, "The form could not be saved.")}
          </p>
        ) : null}

        <TextInput
          id="form-label"
          label="Form name"
          required
          data-autofocus
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          error={errors.label}
          maxLength={160}
          placeholder="Leave request"
        />

        {isEdit ? (
          <p className="text-xs text-ink-soft">
            Key{" "}
            <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-ink">
              {key}
            </code>{" "}
            is the stable identifier and cannot be changed.
          </p>
        ) : (
          <TextInput
            id="form-key"
            label="Key"
            hint="Lowercase letters, numbers and underscores. Leave blank to generate it from the name."
            value={key}
            onChange={(event) => setKey(event.target.value)}
            error={errors.key}
            maxLength={63}
            placeholder="leave_request"
          />
        )}

        <Textarea
          id="form-description"
          label="Description"
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
          maxLength={500}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput
            id="form-submit-label"
            label="Submit button label"
            hint="Defaults to “Submit”."
            value={submitLabel}
            onChange={(event) => setSubmitLabel(event.target.value)}
            error={errors.submitLabel}
            maxLength={60}
          />

          <TextInput
            id="form-cancel-label"
            label="Cancel button label"
            hint="Defaults to “Cancel”."
            value={cancelLabel}
            onChange={(event) => setCancelLabel(event.target.value)}
            error={errors.cancelLabel}
            maxLength={60}
          />
        </div>
      </form>
    </Modal>
  );
}
