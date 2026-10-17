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

const SCOPES = [
  { value: "profile", label: "Profile — the entity's own details" },
  { value: "section", label: "Section — a list of records under the entity" },
];

function toNumberOrNull(text) {
  const trimmed = String(text).trim();

  if (trimmed === "") return null;

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}

export default function ConfigurationDialog({
  entityTypeId,
  configuration = null,
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(configuration);
  const { lookups } = useMetadata();

  const [draft, setDraft] = useState(() => ({
    scope: configuration?.scope ?? "section",
    label: configuration?.label ?? "",
    formId: configuration ? String(configuration.form.id) : "",
    tableId: configuration ? String(configuration.table.id) : "",
    sortOrder: configuration?.sortOrder != null ? String(configuration.sortOrder) : "",
    isActive: configuration ? Boolean(configuration.isActive) : true,
  }));
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  /*
   * A configuration points at a mapping, never at loose columns, so the mapping
   * is resolved from the chosen pair and shown here as the thing being selected.
   */
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
      label: draft.label.trim(),
      formId: Number(draft.formId),
      tableId: Number(draft.tableId),
      mappingId: compatibility.mappingId,
    };

    if (isEdit) {
      payload.isActive = draft.isActive;

      const order = toNumberOrNull(draft.sortOrder);

      if (order !== null) payload.sortOrder = order;
    } else {
      payload.scope = draft.scope;
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

  return (
    <Modal
      open
      onClose={pending ? () => {} : onClose}
      title={isEdit ? `Edit “${configuration.label}”` : "New configuration"}
      description="A configuration binds a kind of entity to the form, table and mapping it uses."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>

          <Button type="submit" form={FORM_ID} loading={pending}>
            {isEdit ? "Save configuration" : "Create configuration"}
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

        {isEdit ? (
          <div>
            <p className="text-sm font-medium text-ink">Scope</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {configuration.scope === "profile"
                ? "Profile — one record per entity."
                : "Section — a list of records under each entity."}{" "}
              The scope cannot change once the configuration exists.
            </p>
          </div>
        ) : (
          <Select
            id="configuration-scope"
            label="Scope"
            required
            value={draft.scope}
            onChange={(event) => patch({ scope: event.target.value })}
            error={errors.scope}
            options={SCOPES}
          />
        )}

        <TextInput
          id="configuration-label"
          label="Label"
          required
          data-autofocus
          value={draft.label}
          onChange={(event) => patch({ label: event.target.value })}
          error={errors.label}
          maxLength={160}
          placeholder={draft.scope === "profile" ? "Details" : "Members"}
        />

        <Select
          id="configuration-form"
          label="Form"
          required
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

        {isEdit ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput
                id="configuration-sort-order"
                label="Order"
                type="number"
                hint="Lower numbers are shown first."
                value={draft.sortOrder}
                onChange={(event) => patch({ sortOrder: event.target.value })}
                error={errors.sortOrder}
              />
            </div>

            <Checkbox
              id="configuration-is-active"
              label="Available for entry"
              checked={draft.isActive}
              onChange={(event) => patch({ isActive: event.target.checked })}
            />
          </>
        ) : null}
      </form>
    </Modal>
  );
}
