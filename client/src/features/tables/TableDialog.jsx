import { useState } from "react";

import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import Select from "../../components/ui/Select.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
import Textarea from "../../components/ui/Textarea.jsx";

import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import { tables as tablesApi } from "../../services/resources.js";

const FORM_ID = "table-dialog-form";

const EMPTY = {
  label: "",
  key: "",
  description: "",
  displayColumnKey: "",
};

function fromTable(table) {
  return {
    label: table.label ?? "",
    key: table.key ?? "",
    description: table.description ?? "",
    displayColumnKey: table.displayColumnKey ?? "",
  };
}

/*
 * `columns` is optional: the list screen does not load them, so the display
 * column picker only appears where the caller already has them.
 */
export default function TableDialog({ table, columns = null, onClose, onSaved }) {
  const isEdit = Boolean(table);

  const [draft, setDraft] = useState(() => (isEdit ? fromTable(table) : EMPTY));
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  const displayOptions = (columns ?? [])
    .filter((column) => column.status === "active" && column.isVisible)
    .map((column) => ({ value: column.key, label: column.label }));

  function patch(changes) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function buildPayload() {
    const payload = {
      label: draft.label.trim(),
      description: draft.description.trim() || null,
    };

    if (!isEdit) {
      if (draft.key.trim()) payload.key = draft.key.trim();
      return payload;
    }

    if (displayOptions.length > 0 || draft.displayColumnKey) {
      payload.displayColumnKey = draft.displayColumnKey || null;
    }

    return payload;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});

    const outcome = await run(() =>
      isEdit ? tablesApi.update(table.id, buildPayload()) : tablesApi.create(buildPayload())
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
      title={isEdit ? `Edit “${table.label}”` : "New table"}
      description={
        isEdit
          ? "A table holds the records your forms write to. Its key cannot be changed."
          : "A table holds records. Columns can be added once the table exists."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form={FORM_ID} loading={pending}>
            {isEdit ? "Save table" : "Create table"}
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
            {errorMessage(error, "The table could not be saved.")}
          </p>
        ) : null}

        <TextInput
          id="table-label"
          label="Name"
          required
          autoFocus
          data-autofocus
          value={draft.label}
          onChange={(event) => patch({ label: event.target.value })}
          error={errors.label}
          maxLength={160}
          placeholder="Employee documents"
        />

        {isEdit ? (
          <div>
            <p className="text-sm font-medium text-ink">Key</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-ink">
                {draft.key}
              </code>{" "}
              identifies this table in mappings and cannot be changed.
            </p>
          </div>
        ) : (
          <TextInput
            id="table-key"
            label="Key"
            hint="Lowercase letters, numbers and underscores. Leave blank to generate it from the name."
            value={draft.key}
            onChange={(event) => patch({ key: event.target.value })}
            error={errors.key}
            maxLength={63}
            placeholder="employee_documents"
          />
        )}

        {isEdit && displayOptions.length > 0 ? (
          <Select
            id="table-display-column"
            label="Display column"
            hint="Used wherever a record from this table is named, such as in relation pickers."
            placeholder="Not set"
            value={draft.displayColumnKey}
            onChange={(event) => patch({ displayColumnKey: event.target.value })}
            error={errors.displayColumnKey}
            options={displayOptions}
          />
        ) : null}

        <Textarea
          id="table-description"
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
