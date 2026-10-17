import { useState } from "react";

import FieldRenderer from "../../components/ui/FieldRenderer.jsx";
import Button from "../../components/ui/Button.jsx";
import Checkbox from "../../components/ui/Checkbox.jsx";
import Modal from "../../components/ui/Modal.jsx";
import Select from "../../components/ui/Select.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
import Textarea from "../../components/ui/Textarea.jsx";
import TypeConfigEditor from "../../components/builders/TypeConfigEditor.jsx";

import useDropdownOptions from "../../hooks/useDropdownOptions.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import { fields as fieldsApi } from "../../services/resources.js";

import { useMetadata } from "../metadata/MetadataContext.js";

const FORM_ID = "field-dialog-form";

const EMPTY = {
  label: "",
  key: "",
  description: "",
  dataType: "text",
  config: {},
  isRequired: false,
  defaultValue: null,
  helpText: "",
};

function fromField(field) {
  return {
    label: field.label ?? "",
    key: field.key ?? "",
    description: field.description ?? "",
    dataType: field.dataType ?? "text",
    config: field.config ?? {},
    isRequired: Boolean(field.isRequired),
    defaultValue: field.defaultValue ?? null,
    helpText: field.helpText ?? "",
  };
}

export default function FieldDialog({ field, onClose, onSaved }) {
  const isEdit = Boolean(field);
  const { dataTypes, getDataType } = useMetadata();

  const [draft, setDraft] = useState(() => (isEdit ? fromField(field) : EMPTY));
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  const dropdownOptions = useDropdownOptions(
    draft.dataType === "dropdown" ? draft.config?.dropdownId ?? null : null
  );

  function patch(changes) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  /*
   * Configuration is type-specific, so switching type resets it to the new
   * type's defaults instead of carrying settings the server would reject.
   */
  function changeDataType(dataType) {
    const type = getDataType(dataType);

    patch({ dataType, config: { ...(type?.defaultConfig ?? {}) }, defaultValue: null });
  }

  function buildPayload() {
    const payload = {
      label: draft.label.trim(),
      description: draft.description.trim() || null,
      dataType: draft.dataType,
      config: draft.config,
      isRequired: draft.isRequired,
      defaultValue: draft.defaultValue,
      helpText: draft.helpText.trim() || null,
    };

    /*
     * The key is the stable identifier used inside record payloads, so it is
     * accepted on create only and never editable afterwards.
     */
    if (!isEdit && draft.key.trim()) payload.key = draft.key.trim();

    return payload;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});

    const payload = buildPayload();

    const outcome = await run(() =>
      isEdit ? fieldsApi.update(field.id, payload) : fieldsApi.create(payload)
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
      title={isEdit ? `Edit “${field.label}”` : "New field"}
      description={
        isEdit
          ? "Changes apply to every form that uses this field unless the form overrides them."
          : "A field definition is reusable: create it once and add it to as many forms as you need."
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form={FORM_ID} loading={pending}>
            {isEdit ? "Save field" : "Create field"}
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
            {errorMessage(error, "The field could not be saved.")}
          </p>
        ) : null}

        <TextInput
          id="field-label"
          label="Label"
          required
          autoFocus
          data-autofocus
          value={draft.label}
          onChange={(event) => patch({ label: event.target.value })}
          error={errors.label}
          maxLength={160}
          placeholder="Employee number"
        />

        {isEdit ? (
          <div>
            <p className="text-sm font-medium text-ink">Key</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-ink">
                {draft.key}
              </code>{" "}
              is the stable identifier stored with every record and cannot be changed.
            </p>
          </div>
        ) : (
          <TextInput
            id="field-key"
            label="Key"
            hint="Lowercase letters, numbers and underscores. Leave blank to generate it from the label."
            value={draft.key}
            onChange={(event) => patch({ key: event.target.value })}
            error={errors.key}
            maxLength={63}
            placeholder="employee_number"
          />
        )}

        <Select
          id="field-data-type"
          label="Data type"
          required
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

        <FieldRenderer
          field={{
            key: "defaultValue",
            label: "Default value",
            helpText: "Optional starting value used when a new record leaves this blank.",
            dataType: draft.dataType,
            config: draft.config,
            isRequired: false,
          }}
          value={draft.defaultValue}
          onChange={(_key, value) => patch({ defaultValue: value === "" ? null : value })}
          options={draft.dataType === "dropdown" ? dropdownOptions.data ?? [] : null}
          error={errors.defaultValue}
        />

        <Checkbox
          id="field-is-required"
          label="This field must be filled in"
          checked={draft.isRequired}
          onChange={(event) => patch({ isRequired: event.target.checked })}
        />

        <TextInput
          id="field-help-text"
          label="Help text"
          hint="Shown under the field when someone fills in a form."
          value={draft.helpText}
          onChange={(event) => patch({ helpText: event.target.value })}
          error={errors.helpText}
          maxLength={500}
        />

        <Textarea
          id="field-description"
          label="Description"
          hint="Internal note for other administrators. Not shown on forms."
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
