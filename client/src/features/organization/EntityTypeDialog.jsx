import { useState } from "react";

import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
import Textarea from "../../components/ui/Textarea.jsx";

import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import { organization as organizationApi } from "../../services/resources.js";

const FORM_ID = "entity-type-dialog-form";

const EMPTY = { label: "", key: "", description: "" };

function fromEntityType(entityType) {
  return {
    label: entityType.label ?? "",
    key: entityType.key ?? "",
    description: entityType.description ?? "",
  };
}

export default function EntityTypeDialog({ entityType, onClose, onSaved }) {
  const isEdit = Boolean(entityType);

  const [draft, setDraft] = useState(() => (isEdit ? fromEntityType(entityType) : EMPTY));
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  function patch(changes) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function buildPayload() {
    const payload = {
      label: draft.label.trim(),
      description: draft.description.trim() || null,
      parentTypeId: null,
    };

    if (!isEdit && draft.key.trim()) payload.key = draft.key.trim();

    return payload;
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
      title={isEdit ? `Edit "${entityType.label}"` : "New entity"}
      description={
        isEdit
          ? "Update the details for this organization entity."
          : "Define an entity for your organization, such as Department, Council, or Team."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form={FORM_ID} loading={pending}>
            {isEdit ? "Save entity" : "Create entity"}
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
            {errorMessage(error, "The entity could not be saved.")}
          </p>
        ) : null}

        <TextInput
          id="entity-type-label"
          label="Name"
          required
          autoFocus
          data-autofocus
          value={draft.label}
          onChange={(event) => patch({ label: event.target.value })}
          error={errors.label}
          maxLength={160}
          placeholder="e.g. Department, Team, Council"
        />

        {isEdit ? (
          <div>
            <p className="text-sm font-medium text-ink">Key</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-ink">
                {draft.key}
              </code>{" "}
              identifies this entity and cannot be changed.
            </p>
          </div>
        ) : (
          <TextInput
            id="entity-type-key"
            label="Key"
            hint="Lowercase letters, numbers and underscores. Leave blank to generate automatically."
            value={draft.key}
            onChange={(event) => patch({ key: event.target.value })}
            error={errors.key}
            maxLength={63}
            placeholder="team"
          />
        )}

        <Textarea
          id="entity-type-description"
          label="Description"
          hint="Optional description or purpose of this entity."
          rows={3}
          value={draft.description}
          onChange={(event) => patch({ description: event.target.value })}
          error={errors.description}
          maxLength={500}
        />
      </form>
    </Modal>
  );
}
