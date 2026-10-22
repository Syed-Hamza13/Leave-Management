import { useState } from "react";

import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import Select from "../../components/ui/Select.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
import Textarea from "../../components/ui/Textarea.jsx";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import { organization as organizationApi } from "../../services/resources.js";

const FORM_ID = "entity-type-dialog-form";

const EMPTY = { label: "", key: "", description: "", parentTypeId: "" };

function fromEntityType(entityType) {
  return {
    label: entityType.label ?? "",
    key: entityType.key ?? "",
    description: entityType.description ?? "",
    parentTypeId: entityType.parentTypeId ? String(entityType.parentTypeId) : "",
  };
}

export default function EntityTypeDialog({ entityType, onClose, onSaved }) {
  const isEdit = Boolean(entityType);

  const [draft, setDraft] = useState(() => (isEdit ? fromEntityType(entityType) : EMPTY));
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  /*
   * Types nest, so the parent list excludes the type being edited — a type may
   * not become its own parent.
   */
  const { data } = useAsyncData("entity-types:parents", () =>
    organizationApi.listEntityTypes({ pageSize: 100, status: "active" })
  );

  const candidates = (data?.data ?? []).filter(
    (entry) => Number(entry.id) !== Number(entityType?.id ?? -1)
  );

  function patch(changes) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function buildPayload() {
    const payload = {
      label: draft.label.trim(),
      description: draft.description.trim() || null,
      parentTypeId: draft.parentTypeId ? Number(draft.parentTypeId) : null,
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
      title={isEdit ? `Edit "${entityType.label}"` : "New entity type"}
      description={
        isEdit
          ? "Renaming or re-parenting a type does not change the entities already filed under it."
          : "An entity type is a kind of thing in the organization, such as Department, Council or Team."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form={FORM_ID} loading={pending}>
            {isEdit ? "Save type" : "Create type"}
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
          label="Name"
          required
          autoFocus
          data-autofocus
          value={draft.label}
          onChange={(event) => patch({ label: event.target.value })}
          error={errors.label}
          maxLength={160}
          placeholder="Department"
        />

        {isEdit ? (
          <div>
            <p className="text-sm font-medium text-ink">Key</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-ink">
                {draft.key}
              </code>{" "}
              identifies this type and cannot be changed.
            </p>
          </div>
        ) : (
          <TextInput
            id="entity-type-key"
            label="Key"
            hint="Lowercase letters, numbers and underscores. Leave blank to generate it from the name."
            value={draft.key}
            onChange={(event) => patch({ key: event.target.value })}
            error={errors.key}
            maxLength={63}
            placeholder="department"
          />
        )}

        <Select
          id="entity-type-parent"
          label="Parent type"
          hint="Optional. Nesting a type describes how kinds of things relate, not individual records."
          placeholder="No parent"
          value={draft.parentTypeId}
          onChange={(event) => patch({ parentTypeId: event.target.value })}
          error={errors.parentTypeId}
          options={candidates.map((entry) => ({ value: entry.id, label: entry.label }))}
        />

        <Textarea
          id="entity-type-description"
          label="Description"
          hint="Internal note for other administrators."
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
