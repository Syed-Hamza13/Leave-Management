import { useState } from "react";
import { useParams } from "react-router-dom";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import { errorMessage } from "../../services/errors.js";
import { forms as formsApi } from "../../services/resources.js";

import { useMetadata } from "../metadata/MetadataContext.js";
import { usePermissions } from "../permissions/PermissionsContext.js";

import AddFieldsDialog from "./AddFieldsDialog.jsx";
import FormFieldOverridesDialog from "./FormFieldOverridesDialog.jsx";
import { toFieldsPayload } from "./formFields.js";

export default function FormDetailPage() {
  const { formId } = useParams();
  const { can } = usePermissions();
  const { getDataType } = useMetadata();
  const toast = useToast();

  const canManage = can(PERMISSIONS.FORMS_MANAGE);

  const { data, loading, error, reload } = useAsyncData(`form:${formId}`, () =>
    formsApi.get(formId)
  );

  const form = data?.data ?? null;
  const formFields = form?.fields ?? [];

  const [dragIndex, setDragIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);

  const { run, pending } = useMutation();

  async function saveOrder(nextFields, failureMessage) {
    const outcome = await run(() =>
      formsApi.reorderFields(
        formId,
        nextFields.map((entry) => entry.fieldId)
      )
    );

    if (outcome.ok) {
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, failureMessage));
  }

  function reorder(from, to) {
    if (from === to || from < 0 || to < 0 || from >= formFields.length || to >= formFields.length) {
      return;
    }

    const next = [...formFields];

    const [moved] = next.splice(from, 1);

    next.splice(to, 0, moved);

    return saveOrder(next, "The new order could not be saved.");
  }

  function handleDrop(target) {
    const source = dragIndex;

    setDragIndex(null);
    setDropIndex(null);

    if (source === null) return;

    reorder(source, target);
  }

  async function confirmRemove() {
    const target = removeTarget;

    const remaining = formFields.filter(
      (entry) => Number(entry.formFieldId) !== Number(target.formFieldId)
    );

    const outcome = await run(() =>
      formsApi.update(formId, { fields: toFieldsPayload(remaining) })
    );

    setRemoveTarget(null);

    if (outcome.ok) {
      toast.success(`“${target.label}” was removed from this form.`);
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, "The field could not be removed."));
  }

  if (loading) return <LoadingState label="Loading form…" />;

  if (error || !form) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-danger">
          {errorMessage(error, "This form could not be loaded.")}
        </p>

        <Button variant="secondary" size="sm" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{form.label}</p>

          <code className="font-mono text-xs text-ink-muted">{form.key}</code>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={form.status === "active" ? "success" : "neutral"}>{form.status}</Badge>

          <Badge tone="neutral">
            {formFields.length} {formFields.length === 1 ? "field" : "fields"}
          </Badge>

          {canManage && form.status === "active" ? (
            <Button size="sm" onClick={() => setDialog({ mode: "add" })}>
              Add fields
            </Button>
          ) : null}
        </div>
      </div>

      {form.description ? <p className="text-sm text-ink-soft">{form.description}</p> : null}

      {formFields.length === 0 ? (
        <EmptyState
          title="This form has no fields"
          description="Add the reusable field definitions this form should ask for."
          action={
            canManage ? <Button onClick={() => setDialog({ mode: "add" })}>Add fields</Button> : null
          }
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <p className="border-b border-line bg-surface-sunken px-4 py-2 text-xs text-ink-soft">
            {canManage
              ? "Drag a row to reorder it, or use the arrow buttons. Order is stored with the form."
              : "Fields are shown in the order this form asks for them."}
          </p>

          <ol className="divide-y divide-line">
            {formFields.map((entry, index) => {
              const isDragging = dragIndex === index;
              const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index;
              const overridden =
                entry.overrides?.label != null ||
                entry.overrides?.helpText != null ||
                entry.overrides?.isRequired != null ||
                entry.overrides?.config != null;

              return (
                <li
                  key={entry.formFieldId}
                  draggable={canManage}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", String(index));
                    setDragIndex(index);
                  }}
                  onDragEnter={() => setDropIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleDrop(index);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDropIndex(null);
                  }}
                  className={[
                    "flex flex-wrap items-center gap-3 px-4 py-3",
                    isDragging ? "bg-brand-soft opacity-60" : "hover:bg-surface-sunken",
                    isDropTarget ? "border-t-2 border-t-brand" : "",
                  ].join(" ")}
                >
                  {canManage ? (
                    <span
                      aria-hidden="true"
                      className="cursor-grab text-ink-muted active:cursor-grabbing"
                      title="Drag to reorder"
                    >
                      ⠿
                    </span>
                  ) : null}

                  <span className="w-6 shrink-0 text-right text-xs text-ink-muted">
                    {index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{entry.label}</p>

                    <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <code className="font-mono">{entry.key}</code>

                      <span>{getDataType(entry.dataType)?.label ?? entry.dataType}</span>

                      {overridden ? <Badge tone="warning">Customised here</Badge> : null}
                    </p>
                  </div>

                  {entry.isRequired ? <Badge tone="brand">Required</Badge> : null}

                  <span className="sr-only">
                    Position {index + 1} of {formFields.length}
                  </span>

                  {canManage ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="quiet"
                        size="sm"
                        onClick={() => reorder(index, index - 1)}
                        disabled={pending || index === 0}
                        aria-label={`Move ${entry.label} up`}
                      >
                        <span aria-hidden="true">↑</span>
                      </Button>

                      <Button
                        variant="quiet"
                        size="sm"
                        onClick={() => reorder(index, index + 1)}
                        disabled={pending || index === formFields.length - 1}
                        aria-label={`Move ${entry.label} down`}
                      >
                        <span aria-hidden="true">↓</span>
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDialog({ mode: "settings", entry })}
                      >
                        Settings
                      </Button>

                      <Button variant="ghost" size="sm" onClick={() => setRemoveTarget(entry)}>
                        Remove
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {dialog?.mode === "add" ? (
        <AddFieldsDialog
          form={form}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            toast.success("Fields were added to this form.");
            reload();
          }}
        />
      ) : null}

      {dialog?.mode === "settings" ? (
        <FormFieldOverridesDialog
          form={form}
          formField={dialog.entry}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            toast.success("Form settings saved.");
            reload();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove field from form"
        message={`Remove “${removeTarget?.label ?? ""}” from this form?`}
        detail="The field definition is kept and stays available to other forms. Only this form stops asking for it."
        confirmLabel="Remove from form"
        loading={pending}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
