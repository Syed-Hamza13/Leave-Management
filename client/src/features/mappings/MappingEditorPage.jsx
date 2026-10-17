import { useId, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import Select from "../../components/ui/Select.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import { detailErrors, errorMessage, warningMessages } from "../../services/errors.js";
import { mappings as mappingsApi } from "../../services/resources.js";

import { useMetadata } from "../metadata/MetadataContext.js";
import { usePermissions } from "../permissions/PermissionsContext.js";

export default function MappingEditorPage() {
  const [searchParams] = useSearchParams();

  const formId = searchParams.get("formId");
  const tableId = searchParams.get("tableId");

  if (!formId || !tableId) {
    return (
      <EmptyState
        title="Choose a form and a table"
        description="A mapping always connects one form to one table. Pick the pair from the mappings list to begin."
        action={
          <Link to="/admin/mappings">
            <Button>Back to mappings</Button>
          </Link>
        }
      />
    );
  }

  return <MappingEditor formId={formId} tableId={tableId} />;
}

function MappingEditor({ formId, tableId }) {
  const { can } = usePermissions();
  const { getDataType } = useMetadata();
  const toast = useToast();
  const idPrefix = useId();

  const canManage = can(PERMISSIONS.MAPPINGS_MANAGE);

  const { data, loading, error, reload } = useAsyncData(
    `mapping-compatibility:${formId}:${tableId}`,
    () => mappingsApi.compatibility(formId, tableId)
  );

  const compat = data?.data ?? null;

  /*
   * `draft` stays null until the administrator changes something, so the
   * connections shown are always the saved ones until an edit exists. Deriving
   * it this way avoids writing state from an effect when the fetch settles.
   */
  const [draft, setDraft] = useState(null);
  const [label, setLabel] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);

  const { run, pending } = useMutation();

  const saved = useMemo(() => {
    const map = new Map();

    for (const entry of compat?.entries ?? []) {
      map.set(Number(entry.formFieldId), Number(entry.columnId));
    }

    return map;
  }, [compat]);

  const connections = draft ?? saved;

  /* One column can only receive from one field, so taken columns are refused. */
  const takenBy = useMemo(() => {
    const map = new Map();

    for (const [formFieldId, columnId] of connections) {
      map.set(Number(columnId), Number(formFieldId));
    }

    return map;
  }, [connections]);

  const formFields = compat?.formFields ?? [];

  const mappedCount = connections.size;

  const unsourcedRequired = useMemo(
    () =>
      (compat?.columns ?? []).filter(
        (column) => column.mappable && column.isRequired && !takenBy.has(Number(column.id))
      ),
    [compat, takenBy]
  );

  function setConnection(formFieldId, columnId) {
    const next = new Map(connections);

    if (columnId === "") {
      next.delete(Number(formFieldId));
    } else {
      next.set(Number(formFieldId), Number(columnId));
    }

    setDraft(next);
  }

  function clearAll() {
    setDraft(new Map());
  }

  function resetDraft() {
    setDraft(null);
    setLabel("");
  }

  async function handleSave() {
    const payload = {
      formId: Number(formId),
      tableId: Number(tableId),
      entries: [...connections].map(([formFieldId, columnId]) => ({ formFieldId, columnId })),
    };

    if (label.trim()) payload.label = label.trim();

    const outcome = await run(() => mappingsApi.save(payload));

    if (!outcome.ok) {
      const details = detailErrors(outcome.error);

      if (details.length > 0) {
        toast.error(details[0]);

        for (const extra of details.slice(1, 4)) {
          toast.warning(extra);
        }

        return;
      }

      toast.error(errorMessage(outcome.error, "The mapping could not be saved."));
      return;
    }

    const warnings = warningMessages(outcome.result);

    setDraft(null);
    setLabel("");
    reload();

    if (warnings.length === 0) {
      toast.success("The mapping was saved.");
      return;
    }

    toast.success("The mapping was saved with warnings.");

    for (const warning of warnings.slice(0, 3)) {
      toast.warning(warning);
    }
  }

  async function confirmArchive() {
    const outcome = await run(() => mappingsApi.archive(compat.mappingId));

    setArchiveOpen(false);

    if (outcome.ok) {
      toast.success("The mapping was archived.");
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, "The mapping could not be archived."));
  }

  if (loading) return <LoadingState label="Loading mapping…" />;

  if (error || !compat) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-danger">
          {errorMessage(error, "This mapping could not be loaded.")}
        </p>

        <Button variant="secondary" size="sm" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  const dirty = draft !== null || label.trim() !== "";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink-muted">
            <Link to="/admin/mappings" className="hover:text-brand hover:underline">
              Form mappings
            </Link>
          </p>

          <p className="mt-0.5 text-sm text-ink-soft">
            <span className="font-medium text-ink">{compat.form.label}</span>
            <span aria-hidden="true"> → </span>
            <span className="font-medium text-ink">{compat.table.label}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={compat.mappingId ? "success" : "neutral"}>
            {compat.mappingId ? "Saved mapping" : "Not saved yet"}
          </Badge>

          <Badge tone="neutral">
            {mappedCount} of {formFields.length} mapped
          </Badge>

          {canManage && compat.mappingId ? (
            <Button size="sm" variant="danger" onClick={() => setArchiveOpen(true)}>
              Archive
            </Button>
          ) : null}
        </div>
      </div>

      {formFields.length === 0 ? (
        <EmptyState
          title="This form has no fields"
          description="Add fields to the form first — there is nothing to connect yet."
          action={
            <Link to={`/admin/forms/${compat.form.id}`}>
              <Button>Open the form</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <p className="border-b border-line bg-surface-sunken px-4 py-2 text-xs text-ink-soft">
              Choose the column each form field writes to. Choices the server would refuse are
              disabled and say why.
            </p>

            <ul className="divide-y divide-line">
              {compat.compatibility.map((entry) => {
                const verdicts = new Map(
                  entry.columns.map((verdict) => [Number(verdict.columnId), verdict])
                );

                const selectId = `${idPrefix}-field-${entry.formFieldId}`;
                const value = connections.get(Number(entry.formFieldId)) ?? "";

                return (
                  <li
                    key={entry.formFieldId}
                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <label htmlFor={selectId} className="block truncate text-sm font-medium text-ink">
                        {entry.label}
                      </label>

                      <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                        <code className="font-mono">{entry.key}</code>

                        <span>{getDataType(entry.dataType)?.label ?? entry.dataType}</span>

                        {entry.isRequired ? <Badge tone="brand">Required</Badge> : null}
                      </p>
                    </div>

                    <Select
                      id={selectId}
                      className="w-full sm:w-72"
                      value={value}
                      disabled={!canManage}
                      onChange={(event) => setConnection(entry.formFieldId, event.target.value)}
                      placeholder="Not mapped"
                    >
                      {(compat.columns ?? [])
                        .filter((column) => column.mappable)
                        .map((column) => {
                          const verdict = verdicts.get(Number(column.id));
                          const owner = takenBy.get(Number(column.id));
                          const isOwn = owner === Number(entry.formFieldId);
                          const blockedByOther = owner !== undefined && !isOwn;

                          const reason = !verdict?.compatible
                            ? verdict?.reason ?? "These types cannot be connected."
                            : blockedByOther
                              ? "Already receives from another field"
                              : null;

                          return (
                            <option
                              key={column.id}
                              value={column.id}
                              disabled={Boolean(reason) && !isOwn}
                            >
                              {column.label}
                              {reason ? ` — ${reason}` : ""}
                            </option>
                          );
                        })}
                    </Select>
                  </li>
                );
              })}
            </ul>
          </div>

          {unsourcedRequired.length > 0 ? (
            <div className="rounded-card border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
              <p className="font-medium">
                {unsourcedRequired.length} required{" "}
                {unsourcedRequired.length === 1 ? "column has" : "columns have"} no source
              </p>

              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {unsourcedRequired.map((column) => (
                  <li key={column.id}>{column.label}</li>
                ))}
              </ul>

              <p className="mt-1 text-xs">
                Saving is still allowed — the value may be supplied elsewhere, such as by the
                organization section a record belongs to.
              </p>
            </div>
          ) : null}

          {compat.unmappableColumns?.length > 0 ? (
            <details className="rounded-card border border-line bg-surface px-4 py-3 text-sm">
              <summary className="cursor-pointer text-ink-soft">
                {compat.unmappableColumns.length}{" "}
                {compat.unmappableColumns.length === 1 ? "column" : "columns"} cannot receive form
                values
              </summary>

              <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                {compat.unmappableColumns.map((column) => (
                  <li key={column.columnId}>
                    <span className="font-medium text-ink-soft">{column.label}</span> —{" "}
                    {column.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {canManage ? (
            <div className="space-y-3 rounded-card border border-line bg-surface px-4 py-4">
              <TextInput
                id={`${idPrefix}-label`}
                label="Mapping label"
                hint={`Leave blank to use “${compat.form.label} → ${compat.table.label}”.`}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                maxLength={160}
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleSave} loading={pending}>
                  Save mapping
                </Button>

                <Button variant="secondary" onClick={clearAll} disabled={pending || mappedCount === 0}>
                  Clear all
                </Button>

                <Button variant="ghost" onClick={resetDraft} disabled={pending || !dirty}>
                  Undo changes
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={archiveOpen}
        title="Archive mapping"
        message={`Archive “${compat.form.label} → ${compat.table.label}”?`}
        detail="The form stops writing to this table. Records already stored are untouched."
        confirmLabel="Archive mapping"
        loading={pending}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={confirmArchive}
      />
    </div>
  );
}
