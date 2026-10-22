import { useMemo, useState } from "react";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Checkbox from "../../components/ui/Checkbox.jsx";
import Modal from "../../components/ui/Modal.jsx";
import Select from "../../components/ui/Select.jsx";
import TextInput from "../../components/ui/TextInput.jsx";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import {
  mappings as mappingsApi,
  metadata as metadataApi,
  organization as organizationApi,
} from "../../services/resources.js";

import { useMetadata } from "../metadata/MetadataContext.js";

const FORM_ID = "configuration-dialog-form";

function toNumberOrNull(text) {
  const trimmed = String(text).trim();

  if (trimmed === "") return null;

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}

export default function ConfigurationDialog({
  entityTypeId,
  entityType = null,
  configuration = null,
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(configuration);
  const { lookups } = useMetadata();

  const { data: lookupsData } = useAsyncData("configuration-dialog-lookups", () =>
    metadataApi.lookups()
  );

  const [draft, setDraft] = useState(() => ({
    label: configuration?.label ?? "",
    formId: configuration ? String(configuration.form.id) : "",
    tableId: configuration ? String(configuration.table.id) : "",
    sortOrder: configuration?.sortOrder != null ? String(configuration.sortOrder) : "",
    isActive: configuration ? Boolean(configuration.isActive) : true,
  }));
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useMutation();

  const allForms = lookupsData?.data?.forms ?? lookups.forms ?? [];
  const allTables = (lookupsData?.data?.tables ?? lookups.tables ?? []).filter(
    (table) => table.storageKind === "managed"
  );

  const formOptions = useMemo(() => {
    const list = [...allForms];
    if (configuration?.form && !list.some((f) => String(f.id) === String(configuration.form.id))) {
      list.unshift(configuration.form);
    }
    return list.map((form) => ({
      value: String(form.id),
      label: form.fieldCount !== undefined ? `${form.label} (${form.fieldCount} fields)` : form.label,
    }));
  }, [allForms, configuration]);

  const tableOptions = useMemo(() => {
    const list = [...allTables];
    if (configuration?.table && !list.some((t) => String(t.id) === String(configuration.table.id))) {
      list.unshift(configuration.table);
    }
    return list.map((table) => ({
      value: String(table.id),
      label: table.columnCount !== undefined ? `${table.label} (${table.columnCount} columns)` : table.label,
    }));
  }, [allTables, configuration]);

  /*
   * A configuration points at a mapping, never at loose columns, so the mapping
   * is resolved from the chosen pair and shown here as the thing being selected.
   */
  const pair =
    draft.formId && draft.tableId ? { formId: Number(draft.formId), tableId: Number(draft.tableId) } : null;

  const samePairAsCurrent = Boolean(
    configuration &&
    pair &&
    Number(pair.formId) === Number(configuration.form?.id) &&
    Number(pair.tableId) === Number(configuration.table?.id)
  );

  const { data: compatibilityData, loading: compatibilityLoading } = useAsyncData(
    `configuration-pair:${pair?.formId ?? "none"}:${pair?.tableId ?? "none"}`,
    () =>
      pair
        ? mappingsApi.compatibility(pair.formId, pair.tableId)
        : Promise.resolve(null),
    {
      initialData: samePairAsCurrent && configuration?.mapping?.id
        ? { data: { mappingId: configuration.mapping.id, entries: [] } }
        : null,
    }
  );

  const compatibility =
    compatibilityData?.data ??
    (samePairAsCurrent && configuration?.mapping?.id
      ? { mappingId: configuration.mapping.id, entries: [] }
      : null);

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
      const hasProfile = (entityType?.configurations ?? []).some((c) => c.scope === "profile");
      payload.scope = hasProfile ? "section" : "profile";
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

        <TextInput
          id="configuration-label"
          label="Label"
          required
          data-autofocus
          value={draft.label}
          onChange={(event) => patch({ label: event.target.value })}
          error={errors.label}
          maxLength={160}
          placeholder="e.g. Details, Department Info, or Records"
        />

        <Select
          id="configuration-form"
          label="Form"
          required
          placeholder="Choose a form…"
          value={draft.formId}
          onChange={(event) => patch({ formId: event.target.value })}
          error={errors.formId}
          options={formOptions}
        />

        <Select
          id="configuration-table"
          label="Table"
          required
          placeholder="Choose a table…"
          value={draft.tableId}
          onChange={(event) => patch({ tableId: event.target.value })}
          error={errors.tableId}
          options={tableOptions}
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
