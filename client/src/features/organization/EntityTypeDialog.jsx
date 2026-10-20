import { useState } from "react";

import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import TextInput from "../../components/ui/TextInput.jsx";

import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import { organization as organizationApi } from "../../services/resources.js";

const FORM_ID = "entity-type-dialog-form";

export default function EntityTypeDialog({ entityType, onClose, onSaved }) {
  const isEdit = Boolean(entityType);

  const [label, setLabel] = useState(entityType?.label ?? "");
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  function buildPayload() {
    return { label: label.trim(), description: null, parentTypeId: null };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});

    const outcome = await run(() =>
      isEdit
        ? organizationApi.updateEntityType(entityType.id, buildPayload())
        : organizationApi.createEntityType(buildPayload())
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
      title={isEdit ? `Edit "${entityType.label}"` : "Define Entity"}
      description={
        isEdit
          ? "Rename this entity type."
          : "Create a new kind of entity for your organization."
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form={FORM_ID} loading={pending}>
            {isEdit ? "Save" : "Submit"}
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
            {errorMessage(error, "The entity type could not be saved.")}
          </p>
        ) : null}

        <TextInput
          id="entity-type-label"
          label="Name of Entity"
          required
          autoFocus
          data-autofocus
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          error={errors.label}
          maxLength={160}
          placeholder="e.g. Department, Branch, Team"
        />
      </form>
    </Modal>
  );
}
