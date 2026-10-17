import { useState } from "react";

import TypeConfigEditor from "../../components/builders/TypeConfigEditor.jsx";
import Button from "../../components/ui/Button.jsx";
import Checkbox from "../../components/ui/Checkbox.jsx";
import Modal from "../../components/ui/Modal.jsx";
import Select from "../../components/ui/Select.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
import Textarea from "../../components/ui/Textarea.jsx";

import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import { tables as tablesApi } from "../../services/resources.js";

import { useMetadata } from "../metadata/MetadataContext.js";

const FORM_ID = "column-dialog-form";

const EMPTY = {
  label: "",
  key: "",
  description: "",
  dataType: "text",
  config: {},
  isRequired: false,
  isSearchable: true,
  isFilterable: true,
  isVisible: true,
};

function fromColumn(column) {
  return {
    label: column.label ?? "",
    key: column.key ?? "",
    description: column.description ?? "",
    dataType: column.dataType ?? "text",
    config: column.config ?? {},
    isRequired: Boolean(column.isRequired),
    isSearchable: column.isSearchable !== false,
    isFilterable: column.isFilterable !== false,
    isVisible: column.isVisible !== false,
  };
}

export default function ColumnDialog({ tableId, column, recordCount = 0, onClose, onSaved }) {
  const isEdit = Boolean(column);
  const { dataTypes, getDataType } = useMetadata();

  const [draft, setDraft] = useState(() => (isEdit ? fromColumn(column) : EMPTY));
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  /*
   * Once records exist the stored value family is fixed, so the server refuses
   * a type change. Blocking it here says why, instead of failing on save.
   */
  const typeLocked = isEdit && recordCount > 0;

  function patch(changes) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function changeDataType(dataType) {
    const type = getDataType(dataType);

    patch({ dataType, config: { ...(type?.defaultConfig ?? {}) } });
  }

  function buildPayload() {
    const payload = {
      label: draft.label.trim(),
      description: draft.description.trim() || null,
      dataType: draft.dataType,
      config: draft.config,
      isRequired: draft.isRequired,
      isSearchable: draft.isSearchable,
      isFilterable: draft.isFilterable,
      isVisible: draft.isVisible,
    };

    if (!isEdit && draft.key.trim()) payload.key = draft.key.trim();

    return payload;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});

    const outcome = await run(() =>
      isEdit
        ? tablesApi.updateColumn(tableId, column.id, buildPayload())
        : tablesApi.createColumn(tableId, buildPayload())
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
      title={isEdit ? `Edit “${column.label}”` : "New column"}
      description={
        isEdit
          ? "Column settings apply to every record stored in this table."
          : "A column defines one value stored on every record in this table."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form={FORM_ID} loading={pending}>
            {isEdit ? "Save column" : "Create column"}
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
            {errorMessage(error, "The column could not be saved.")}
          </p>
        ) : null}

        <TextInput
          id="column-label"
          label="Name"
          required
          autoFocus
          data-autofocus
          value={draft.label}
          onChange={(event) => patch({ label: event.target.value })}
          error={errors.label}
          maxLength={160}
          placeholder="Document type"
        />

        {isEdit ? (
          <div>
            <p className="text-sm font-medium text-ink">Key</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-ink">
                {draft.key}
              </code>{" "}
              is where this value is stored on each record and cannot be changed.
            </p>
          </div>
        ) : (
          <TextInput
            id="column-key"
            label="Key"
            hint="Lowercase letters, numbers and underscores. Leave blank to generate it from the name."
            value={draft.key}
            onChange={(event) => patch({ key: event.target.value })}
            error={errors.key}
            maxLength={63}
            placeholder="document_type"
          />
        )}

        <Select
          id="column-data-type"
          label="Data type"
          required
          disabled={typeLocked}
          hint={
            typeLocked
              ? "This table already holds records, so the stored type is fixed."
              : undefined
          }
          value={draft.dataType}
          onChange={(event) => changeDataType(event.target.value)}
          error={errors.dataType}
          options={dataTypes.map((type) => ({ value: type.key, label: type.label }))}
        />

        {getDataType(draft.dataType)?.description ? (
          <p className="-mt-2 text-xs text-ink-soft">
            {getDataType(draft.dataType).description}
          </p>
        ) : null}

        <TypeConfigEditor
          dataTypeKey={draft.dataType}
          config={draft.config}
          onChange={(config) => patch({ config })}
          errors={errors}
        />

        <fieldset className="space-y-2 rounded-control border border-line p-3">
          <legend className="px-1 text-xs font-medium text-ink-soft">Behaviour</legend>

          <Checkbox
            id="column-is-required"
            label="A value must be entered"
            checked={draft.isRequired}
            onChange={(event) => patch({ isRequired: event.target.checked })}
          />

          <Checkbox
            id="column-is-searchable"
            label="Include in record search"
            checked={draft.isSearchable}
            onChange={(event) => patch({ isSearchable: event.target.checked })}
          />

          <Checkbox
            id="column-is-filterable"
            label="Allow filtering on this column"
            checked={draft.isFilterable}
            onChange={(event) => patch({ isFilterable: event.target.checked })}
          />

          <Checkbox
            id="column-is-visible"
            label="Show in record lists and pickers"
            checked={draft.isVisible}
            onChange={(event) => patch({ isVisible: event.target.checked })}
          />
        </fieldset>

        <Textarea
          id="column-description"
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
