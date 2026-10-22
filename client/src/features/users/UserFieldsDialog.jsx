import { useMemo, useState } from "react";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useMutation from "../../hooks/useMutation.js";
import { errorMessage } from "../../services/errors.js";
import { tables as tablesApi } from "../../services/resources.js";
import { useMetadata } from "../metadata/MetadataContext.js";
import ColumnDialog from "../tables/ColumnDialog.jsx";

export default function UserFieldsDialog({
  table,
  columns = [],
  onClose,
  onColumnsChanged,
}) {
  const toast = useToast();
  const { getDataType } = useMetadata();

  const [columnDialog, setColumnDialog] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const { run, pending } = useMutation();

  // Active custom columns that can be managed, reordered, and deleted
  // System columns (email, first_name, last_name, status, etc.) are strictly excluded
  const manageableColumns = useMemo(
    () => columns.filter((col) => !col.isSystem && col.status === "active"),
    [columns]
  );

  async function reorder(fromIndex, toIndex) {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= manageableColumns.length ||
      toIndex >= manageableColumns.length
    ) {
      return;
    }

    const next = [...manageableColumns];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    const outcome = await run(() =>
      tablesApi.reorderColumns(
        "users",
        next.map((col) => col.id)
      )
    );

    if (outcome.ok) {
      toast.success("Field order updated.");
      onColumnsChanged?.();
    } else {
      toast.error(errorMessage(outcome.error, "Could not update field order."));
    }
  }

  // Drag and drop handlers
  function handleDragStart(e, index) {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  }

  function handleDrop(e, targetIndex) {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      reorder(draggedIndex, targetIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target) return;

    const outcome = await run(() =>
      tablesApi.deleteColumn("users", target.id, { permanent: true })
    );
    setDeleteTarget(null);

    if (outcome.ok) {
      toast.success(`“${target.label}” field was permanently deleted.`);
      onColumnsChanged?.(target.key);
    } else {
      toast.error(errorMessage(outcome.error, "Could not delete custom field."));
    }
  }

  return (
    <>
      <Modal
        open
        onClose={pending ? () => {} : onClose}
        title="Customize User Form & Table Fields"
        description="Add custom profile fields (like Mobile No., Department, etc.), drag and drop to arrange their placement. Custom fields can be edited or deleted anytime."
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between">
            <Button
              variant="secondary"
              onClick={() => setColumnDialog({ mode: "create" })}
              disabled={pending}
            >
              + Add field
            </Button>

            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Done
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {manageableColumns.length === 0 ? (
            <EmptyState
              title="No custom fields yet"
              description="Click “+ Add field” to create custom fields like Mobile No., Employee ID, or Department for user accounts."
              action={
                <Button onClick={() => setColumnDialog({ mode: "create" })}>
                  + Add field
                </Button>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              <div className="border-b border-line bg-surface-sunken px-4 py-2.5 flex items-center justify-between text-xs text-ink-soft">
                <span>Drag rows or use ↑ / ↓ buttons to change field placement in the form and table.</span>
                <span className="font-semibold">{manageableColumns.length} custom fields</span>
              </div>

              <ol className="divide-y divide-line">
                {manageableColumns.map((col, index) => {
                  const type = getDataType(col.dataType);
                  const isDragging = draggedIndex === index;
                  const isOver = dragOverIndex === index && draggedIndex !== index;

                  return (
                    <li
                      key={col.id}
                      draggable={!pending}
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`flex flex-wrap items-center gap-3 px-4 py-3 transition-colors ${
                        isDragging ? "opacity-30 bg-surface-sunken" : "hover:bg-surface-sunken/40"
                      } ${isOver ? "border-t-2 border-brand bg-brand/5" : ""}`}
                    >
                      <span
                        className="text-ink-muted/50 hover:text-ink cursor-grab active:cursor-grabbing p-1"
                        title="Drag to rearrange placement"
                        aria-hidden="true"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="h-4 w-4"
                        >
                          <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-12a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
                        </svg>
                      </span>

                      <span className="w-5 shrink-0 text-right text-xs font-mono font-medium text-ink-muted">
                        {index + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-ink">{col.label}</p>
                          <code className="font-mono text-xs text-ink-muted">({col.key})</code>
                        </div>

                        <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted mt-0.5">
                          <span>{type?.label ?? col.dataType}</span>
                          {col.isRequired ? <Badge tone="brand">Required</Badge> : null}
                          {!col.isVisible ? <Badge tone="neutral">Hidden in list</Badge> : null}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="quiet"
                          size="sm"
                          onClick={() => reorder(index, index - 1)}
                          disabled={pending || index === 0}
                          aria-label={`Move ${col.label} up`}
                          title="Move up in placement"
                        >
                          <span aria-hidden="true" className="font-bold">↑</span>
                        </Button>

                        <Button
                          variant="quiet"
                          size="sm"
                          onClick={() => reorder(index, index + 1)}
                          disabled={pending || index === manageableColumns.length - 1}
                          aria-label={`Move ${col.label} down`}
                          title="Move down in placement"
                        >
                          <span aria-hidden="true" className="font-bold">↓</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setColumnDialog({ mode: "edit", column: col })}
                        >
                          Edit
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:bg-danger/10 hover:text-danger font-medium"
                          onClick={() => setDeleteTarget(col)}
                          title="Permanently delete this custom column"
                        >
                          Delete
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          <div className="rounded-control bg-surface-sunken p-3 text-xs text-ink-soft">
            <span className="font-medium text-ink">Built-in fields: </span>
            <span>
              Standard account fields (Email, First Name, Last Name, Password, Roles) are permanent system fields and cannot be deleted. Custom fields you create can be rearranged or deleted freely.
            </span>
          </div>
        </div>
      </Modal>

      {columnDialog ? (
        <ColumnDialog
          tableId="users"
          column={columnDialog.column ?? null}
          recordCount={0}
          onClose={() => setColumnDialog(null)}
          onSaved={(saved) => {
            const wasEdit = Boolean(columnDialog.column);
            setColumnDialog(null);
            toast.success(
              wasEdit
                ? `“${saved?.label ?? "Field"}” was updated.`
                : `“${saved?.label ?? "Field"}” was added.`
            );
            onColumnsChanged?.();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete custom field"
        message={`Permanently delete “${deleteTarget?.label ?? ""}”?`}
        detail="This will remove this custom field from the user form and table, and permanently erase all saved profile values for this field across all users. This cannot be undone."
        confirmLabel="Delete field"
        confirmTone="danger"
        loading={pending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
