import { useMemo, useState } from "react";
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
import { tables as tablesApi } from "../../services/resources.js";

import { useMetadata } from "../metadata/MetadataContext.js";
import { usePermissions } from "../permissions/PermissionsContext.js";

import ColumnDialog from "./ColumnDialog.jsx";
import TableDialog from "./TableDialog.jsx";

export default function TableDetailPage() {
  const { tableId } = useParams();
  const { can } = usePermissions();
  const { getDataType, lookups } = useMetadata();
  const toast = useToast();

  const canManage = can(PERMISSIONS.TABLES_MANAGE);

  const { data, loading, error, reload } = useAsyncData(`table:${tableId}`, () =>
    tablesApi.get(tableId)
  );

  const { data: usageData, reload: reloadUsage } = useAsyncData(`table-usage:${tableId}`, () =>
    tablesApi.usage(tableId)
  );

  const table = data?.data ?? null;
  const usage = usageData?.data ?? null;

  const allColumns = useMemo(() => data?.data?.columns ?? [], [data]);

  const [dragIndex, setDragIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [archiveTableOpen, setArchiveTableOpen] = useState(false);

  const { run, pending } = useMutation();

  const tableNames = useMemo(() => {
    const names = new Map();

    for (const entry of lookups.tables ?? []) {
      names.set(Number(entry.id), entry.label);
    }

    return names;
  }, [lookups.tables]);

  /*
   * System columns keep the position their migration gave them and cannot be
   * edited, so reordering only ever concerns the user-managed active set —
   * which is exactly what the server demands.
   */
  const manageable = useMemo(
    () => allColumns.filter((column) => !column.isSystem && column.status === "active"),
    [allColumns]
  );

  const archivedColumns = useMemo(
    () => allColumns.filter((column) => !column.isSystem && column.status === "archived"),
    [allColumns]
  );

  const systemColumns = useMemo(
    () => allColumns.filter((column) => column.isSystem),
    [allColumns]
  );

  function refresh() {
    reload();
    reloadUsage();
  }

  async function saveOrder(nextColumns) {
    const outcome = await run(() =>
      tablesApi.reorderColumns(
        tableId,
        nextColumns.map((column) => column.id)
      )
    );

    if (outcome.ok) {
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, "The new order could not be saved."));
  }

  function reorder(from, to) {
    if (from === to || from < 0 || to < 0 || from >= manageable.length || to >= manageable.length) {
      return;
    }

    const next = [...manageable];

    const [moved] = next.splice(from, 1);

    next.splice(to, 0, moved);

    return saveOrder(next);
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

    const outcome = await run(() => tablesApi.deleteColumn(tableId, target.id));

    setRemoveTarget(null);

    if (outcome.ok) {
      toast.success(`“${target.label}” was archived.`);
      refresh();
      return;
    }

    toast.error(errorMessage(outcome.error, "The column could not be archived."));
  }

  async function confirmArchiveTable() {
    const outcome = await run(() => tablesApi.archive(tableId));

    setArchiveTableOpen(false);

    if (outcome.ok) {
      toast.success(`“${table.label}” was archived.`);
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, "The table could not be archived."));
  }

  if (loading) return <LoadingState label="Loading table…" />;

  if (error || !table) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-danger">
          {errorMessage(error, "This table could not be loaded.")}
        </p>

        <Button variant="secondary" size="sm" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  /*
   * A system table's columns belong to the service that owns them — the accounts
   * table among them — so nothing on it is editable, archive included.
   */
  const editable = canManage && !table.isSystem && table.status === "active";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{table.label}</p>

          <code className="font-mono text-xs text-ink-muted">{table.key}</code>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={table.status === "active" ? "success" : "neutral"}>{table.status}</Badge>

          {table.isSystem ? <Badge tone="warning">System</Badge> : null}

          <Badge tone="neutral">
            v{table.schemaVersion} · {allColumns.length}{" "}
            {allColumns.length === 1 ? "column" : "columns"}
          </Badge>

          {canManage ? (
            <Button size="sm" variant="secondary" onClick={() => setDialog({ mode: "table" })}>
              Edit table
            </Button>
          ) : null}

          {canManage && !table.isSystem && table.status === "active" ? (
            <Button size="sm" variant="danger" onClick={() => setArchiveTableOpen(true)}>
              Archive
            </Button>
          ) : null}
        </div>
      </div>

      {table.description ? <p className="text-sm text-ink-soft">{table.description}</p> : null}

      {usage ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-card border border-line bg-surface px-4 py-3 text-sm">
          {[
            ["Records", usage.recordCount],
            ["Mappings", usage.mappingCount],
            ["Used as a relation", usage.relationCount],
            ["Organization sections", usage.entityConfigCount],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-ink-muted">{label}</dt>
              <dd className="font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Columns</h2>

          {editable ? (
            <Button size="sm" onClick={() => setDialog({ mode: "column" })}>
              Add column
            </Button>
          ) : null}
        </div>

        {manageable.length === 0 ? (
          <EmptyState
            title="No columns yet"
            description="Add the values this table should store. System columns are listed below."
            action={
              editable ? <Button onClick={() => setDialog({ mode: "column" })}>Add column</Button> : null
            }
          />
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <p className="border-b border-line bg-surface-sunken px-4 py-2 text-xs text-ink-soft">
              {editable
                ? "Drag a row to reorder it, or use the arrow buttons. Order decides how records are displayed."
                : "Columns are shown in the order records display them."}
            </p>

            <ol className="divide-y divide-line">
              {manageable.map((column, index) => {
                const isDragging = dragIndex === index;
                const isDropTarget =
                  dropIndex === index && dragIndex !== null && dragIndex !== index;

                return (
                  <li
                    key={column.id}
                    draggable={editable}
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
                    {editable ? (
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
                      <p className="truncate text-sm font-medium text-ink">{column.label}</p>

                      <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                        <code className="font-mono">{column.key}</code>

                        <span>{getDataType(column.dataType)?.label ?? column.dataType}</span>

                        {column.dataType === "record_reference" ? (
                          <span>
                            → {tableNames.get(Number(column.relationTableId)) ?? "another table"}
                            {column.relationPolicy === "multiple" ? " (many)" : ""}
                          </span>
                        ) : null}
                      </p>
                    </div>

                    {column.isRequired ? <Badge tone="brand">Required</Badge> : null}

                    {!column.isVisible ? <Badge tone="neutral">Hidden</Badge> : null}

                    <span className="sr-only">
                      Position {index + 1} of {manageable.length}
                    </span>

                    {editable ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="quiet"
                          size="sm"
                          onClick={() => reorder(index, index - 1)}
                          disabled={pending || index === 0}
                          aria-label={`Move ${column.label} up`}
                        >
                          <span aria-hidden="true">↑</span>
                        </Button>

                        <Button
                          variant="quiet"
                          size="sm"
                          onClick={() => reorder(index, index + 1)}
                          disabled={pending || index === manageable.length - 1}
                          aria-label={`Move ${column.label} down`}
                        >
                          <span aria-hidden="true">↓</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDialog({ mode: "column", column })}
                        >
                          Edit
                        </Button>

                        <Button variant="ghost" size="sm" onClick={() => setRemoveTarget(column)}>
                          Archive
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>

      {systemColumns.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">System columns</h2>

          <p className="text-xs text-ink-soft">
            These are maintained by the platform and cannot be edited or reordered.
          </p>

          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {systemColumns.map((column) => (
              <li key={column.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{column.label}</p>

                  <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <code className="font-mono">{column.key}</code>

                    <span>{getDataType(column.dataType)?.label ?? column.dataType}</span>
                  </p>
                </div>

                <Badge tone="warning">System</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {archivedColumns.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">Archived columns</h2>

          <p className="text-xs text-ink-soft">
            Values already stored under these columns stay in existing records.
          </p>

          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {archivedColumns.map((column) => (
              <li key={column.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-soft">{column.label}</p>

                  <code className="font-mono text-xs text-ink-muted">{column.key}</code>
                </div>

                <Badge tone="neutral">archived</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {dialog?.mode === "table" ? (
        <TableDialog
          table={table}
          columns={allColumns}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            toast.success(`“${saved?.label ?? "Table"}” was saved.`);
            refresh();
          }}
        />
      ) : null}

      {dialog?.mode === "column" ? (
        <ColumnDialog
          tableId={tableId}
          column={dialog.column ?? null}
          recordCount={usage?.recordCount ?? 0}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            const wasEdit = Boolean(dialog.column);

            setDialog(null);
            toast.success(
              wasEdit
                ? `“${saved?.label ?? "Column"}” was saved.`
                : `“${saved?.label ?? "Column"}” was added.`
            );
            refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Archive column"
        message={`Archive “${removeTarget?.label ?? ""}”?`}
        detail="Values already stored stay in existing records, but the column leaves the table and its mappings."
        confirmLabel="Archive column"
        loading={pending}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={confirmRemove}
      />

      <ConfirmDialog
        open={archiveTableOpen}
        title="Archive table"
        message={`Archive “${table.label}”?`}
        detail="A table is refused while it still holds records, is used by a mapping, or is the target of a relation column."
        confirmLabel="Archive table"
        loading={pending}
        onCancel={() => setArchiveTableOpen(false)}
        onConfirm={confirmArchiveTable}
      />
    </div>
  );
}
