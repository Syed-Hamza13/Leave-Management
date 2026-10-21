import { useState } from "react";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Checkbox from "../../components/ui/Checkbox.jsx";
import Modal from "../../components/ui/Modal.jsx";
import Select from "../../components/ui/Select.jsx";
import TextInput from "../../components/ui/TextInput.jsx";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import { mappings as mappingsApi, organization as organizationApi } from "../../services/resources.js";

import { useMetadata } from "../metadata/MetadataContext.js";

const FORM_ID = "configuration-dialog-form";

export default function ConfigurationDialog({
  entityTypeId,
  entityType = null,
  configuration = null,
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(configuration);
  const { lookups } = useMetadata();

  const [draft, setDraft] = useState(() => ({
    label: configuration?.label ?? (entityType?.label ? `${entityType.label} Form` : "Entity Form"),
    formId: configuration ? String(configuration.form.id) : "",
    tableId: configuration ? String(configuration.table.id) : "",
    isActive: configuration ? Boolean(configuration.isActive) : true,
  }));
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  const pair =
    draft.formId && draft.tableId ? { formId: Number(draft.formId), tableId: Number(draft.tableId) } : null;

  const { data: compatibilityData, loading: compatibilityLoading } = useAsyncData(
    `configuration-pair:${pair?.formId ?? "none"}:${pair?.tableId ?? "none"}`,
    () =>
      pair
        ? mappingsApi.compatibility(pair.formId, pair.tableId)
        : Promise.resolve(null)
  );

  const compatibility = compatibilityData?.data ?? null;

  const managedTables = (lookups.tables ?? []).filter((table) => table.storageKind === "managed");

  function patch(changes) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function buildPayload() {
    const payload = {
      label: draft.label.trim() || (entityType?.label ? `${entityType.label} Form` : "Entity Form"),
      formId: Number(draft.formId),
      tableId: Number(draft.tableId),
      mappingId: compatibility.mappingId,
    };

    if (isEdit) {
      payload.isActive = draft.isActive;
    } else {
      payload.scope = configuration?.scope ?? "profile";
    }

    return payload;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});

    if (!compatibility?.mappingId) {
      setErrors({
        tableId: "Choose a form and table that have an active mapping between them.",
      });

      return;
    }

    const outcome = await run(() =>
      isEdit
        ? organizationApi.updateConfiguration(configuration.id, buildPayload())
        : organizationApi.createConfiguration(entityTypeId, buildPayload())
    );

    if (outcome.ok) {
      onSaved(outcome.result?.data);
      return;
    }

    setErrors(fieldErrors(outcome.error));
  }

  const mappingState = !pair
    ? { tone: "neutral", text: "Choose a form and a table." }
    : compatibilityLoading
      ? { tone: "neutral", text: "Checking for a mapping…" }
      : compatibility?.mappingId
        ? {
            tone: "success",
            text: `Mapped with ${compatibility.entries?.length ?? 0} connection(s).`,
          }
        : { tone: "danger", text: "This form is not mapped to this table." };

  const title = entityType?.label
    ? `Configure "${entityType.label}"`
    : isEdit
      ? `Edit "${configuration.label}"`
      : "Configure entity";

  return (
    <Modal
      open
      onClose={pending ? () => {} : onClose}
      title={title}
      description="Connect a form and table to capture and display entries for this entity."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form={FORM_ID} loading={pending}>
            {isEdit ? "Save configuration" : "Save configuration"}
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
            {errorMessage(error, "The configuration could not be saved.")}
          </p>
        ) : null}

        <Select
          id="configuration-form"
          label="Form"
          required
          autoFocus
          data-autofocus
          placeholder="Choose a form…"
          value={draft.formId}
          onChange={(event) => patch({ formId: event.target.value })}
          error={errors.formId}
          options={(lookups.forms ?? []).map((form) => ({
            value: form.id,
            label: `${form.label} (${form.fieldCount} fields)`,
          }))}
        />

        <Select
          id="configuration-table"
          label="Table"
          required
          placeholder="Choose a table…"
          value={draft.tableId}
          onChange={(event) => patch({ tableId: event.target.value })}
          error={errors.tableId}
          options={managedTables.map((table) => ({
            value: table.id,
            label: `${table.label} (${table.columnCount} columns)`,
          }))}
        />

        <p className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          <Badge tone={mappingState.tone}>{mappingState.text}</Badge>

          {pair && !compatibilityLoading && !compatibility?.mappingId ? (
            <span>Create the mapping between these two in Form mappings first.</span>
          ) : null}
        </p>

        <TextInput
          id="configuration-label"
          label="Configuration Name"
          value={draft.label}
          onChange={(event) => patch({ label: event.target.value })}
          error={errors.label}
          maxLength={160}
          placeholder="e.g. Team Form"
        />

        {isEdit ? (
          <Checkbox
            id="configuration-is-active"
            label="Available for entry"
            checked={draft.isActive}
            onChange={(event) => patch({ isActive: event.target.checked })}
          />
        ) : null}
      </form>
    </Modal>
  );
}
