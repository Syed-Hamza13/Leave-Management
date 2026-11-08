import { useMemo, useState } from "react";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import SearchInput from "../../components/ui/SearchInput.jsx";
import Select from "../../components/ui/Select.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import { errorMessage } from "../../services/errors.js";
import { fields as fieldsApi } from "../../services/resources.js";

import { useMetadata } from "../metadata/MetadataContext.js";
import { usePermissions } from "../permissions/PermissionsContext.js";

import FieldDialog from "./FieldDialog.jsx";

const PAGE_SIZE = 25;

export default function FieldsPage() {
  const { can } = usePermissions();
  const { getDataType } = useMetadata();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);

  const [dialog, setDialog] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [connectedColumns, setConnectedColumns] = useState([]);
  const [archiveConnected, setArchiveConnected] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restoreConnectedColumns, setRestoreConnectedColumns] = useState([]);
  const [alsoRestoreColumn, setAlsoRestoreColumn] = useState(false);

  const canManage = can(PERMISSIONS.FIELDS_MANAGE);

  const requestKey = `fields:${page}:${search}:${status}`;

  const { data, loading, error, reload } = useAsyncData(requestKey, () =>
    fieldsApi.list({ page, pageSize: PAGE_SIZE, search, status })
  );

  const rows = data?.data ?? [];
  const meta = data?.meta ?? null;

  const { run: runArchive, pending: archiving } = useMutation();

  const columns = useMemo(
    () => [
      {
        key: "label",
        header: "Field",
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{row.label}</p>
            <code className="font-mono text-xs text-ink-muted">{row.key}</code>
          </div>
        ),
      },
      {
        key: "dataType",
        header: "Type",
        render: (row) => (
          <Badge tone="neutral">{getDataType(row.dataType)?.label ?? row.dataType}</Badge>
        ),
      },
      {
        key: "isRequired",
        header: "Entry",
        render: (row) =>
          row.isRequired ? (
            <Badge tone="brand">Required</Badge>
          ) : (
            <span className="text-xs text-ink-muted">Optional</span>
          ),
      },
      {
        key: "formCount",
        header: "Used in",
        align: "right",
        render: (row) => (
          <span className="text-ink-soft">
            {row.formCount} {row.formCount === 1 ? "form" : "forms"}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <Badge tone={row.status === "active" ? "success" : "neutral"}>{row.status}</Badge>
        ),
      },
    ],
    [getDataType]
  );

  async function handleOpenArchive(field) {
    setArchiveTarget(field);
    setArchiveConnected(false);
    setConnectedColumns([]);
    try {
      const res = await fieldsApi.connected(field.id);
      setConnectedColumns(res.data ?? []);
    } catch {
      setConnectedColumns([]);
    }
  }

  async function handleOpenRestore(field) {
    setRestoreTarget(field);
    setAlsoRestoreColumn(false);
    setRestoreConnectedColumns([]);
    try {
      const res = await fieldsApi.connected(field.id);
      setRestoreConnectedColumns(res.data ?? []);
    } catch {
      setRestoreConnectedColumns([]);
    }
  }

  async function confirmArchive() {
    const target = archiveTarget;

    const outcome = await runArchive(() =>
      fieldsApi.archive(target.id, {
        archiveConnectedColumns: archiveConnected,
      })
    );

    setArchiveTarget(null);
    setConnectedColumns([]);

    if (outcome.ok) {
      toast.success(
        archiveConnected
          ? `“${target.label}” and connected table columns were archived.`
          : `“${target.label}” was archived.`
      );
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, "The field could not be archived."));
  }

  async function confirmRestore() {
    const target = restoreTarget;

    const outcome = await runArchive(() =>
      fieldsApi.restore(target.id, {
        restoreConnectedColumns: alsoRestoreColumn,
      })
    );

    setRestoreTarget(null);
    setRestoreConnectedColumns([]);

    if (outcome.ok) {
      toast.success(
        alsoRestoreColumn
          ? `“${target.label}” and connected table columns were restored.`
          : `“${target.label}” was restored.`
      );
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, "The field could not be restored."));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-end gap-3">
          <SearchInput
            className="w-full sm:max-w-xs"
            value={search}
            onChange={(next) => {
              setSearch(next);
              setPage(1);
            }}
            label="Search fields"
            placeholder="Search by label, key or description…"
          />

          <Select
            id="fields-status"
            label="Status"
            className="w-40"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            options={[
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived" },
            ]}
          />
        </div>

        {canManage ? (
          <Button onClick={() => setDialog({ mode: "create" })}>New field</Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        pagination={meta}
        onPageChange={setPage}
        empty={
          <EmptyState
            title={search ? "No fields match your search" : "No fields yet"}
            description={
              search
                ? "Try a different label or key, or clear the search."
                : "Create the reusable field definitions your forms will be built from."
            }
            action={
              canManage && !search ? (
                <Button onClick={() => setDialog({ mode: "create" })}>New field</Button>
              ) : null
            }
          />
        }
        actions={
          canManage
            ? (row) => (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setDialog({ mode: "edit", field: row })}>
                    Edit
                  </Button>

                  {row.status === "active" ? (
                    <Button variant="ghost" size="sm" onClick={() => handleOpenArchive(row)}>
                      Archive
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => handleOpenRestore(row)}>
                      Restore
                    </Button>
                  )}
                </>
              )
            : null
        }
      />

      {dialog ? (
        <FieldDialog
          field={dialog.field ?? null}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            toast.success(
              dialog.mode === "create"
                ? `“${saved?.label ?? "Field"}” was created.`
                : `“${saved?.label ?? "Field"}” was saved.`
            );
            reload();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive field"
        message={`Archive “${archiveTarget?.label ?? ""}”?`}
        detail={
          <div className="space-y-3">
            <p>
              {archiveTarget?.formCount > 0
                ? `This field is used in ${archiveTarget.formCount} ${
                    archiveTarget.formCount === 1 ? "form" : "forms"
                  }. Archiving it removes it from new submissions but keeps it in existing records.`
                : "Archived fields stay in existing records but can no longer be added to forms."}
            </p>
            {connectedColumns.length > 0 ? (
              <div className="rounded-control border border-line bg-surface-sunken p-3 text-xs space-y-2">
                <p className="font-medium text-ink">
                  This field is mapped to {connectedColumns.length === 1 ? "a table column" : `${connectedColumns.length} table columns`}:
                </p>
                <ul className="list-disc list-inside text-ink-soft space-y-1">
                  {connectedColumns.map((c) => (
                    <li key={c.mappingId}>
                      <strong className="text-ink">{c.columnLabel}</strong> in table{" "}
                      <strong className="text-ink">{c.tableLabel}</strong> (via form{" "}
                      <strong className="text-ink">{c.formLabel}</strong>)
                      {c.columnStatus === "archived" ? " (already archived)" : ""}
                    </li>
                  ))}
                </ul>
                {connectedColumns.some((c) => c.columnStatus === "active") ? (
                  <label className="flex items-center gap-2 pt-1 font-medium text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={archiveConnected}
                      onChange={(e) => setArchiveConnected(e.target.checked)}
                      className="rounded border-line-strong text-brand focus:ring-brand"
                    />
                    <span>
                      Also archive connected table {connectedColumns.length === 1 ? "column" : "columns"}
                    </span>
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
        }
        confirmLabel="Archive field"
        loading={archiving}
        onCancel={() => {
          setArchiveTarget(null);
          setConnectedColumns([]);
        }}
        onConfirm={confirmArchive}
      />

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        title="Restore field"
        message={`Restore “${restoreTarget?.label ?? ""}”?`}
        tone="primary"
        detail={
          <div className="space-y-3">
            <p className="text-xs text-ink-soft">
              Restoring this field makes it available to active forms and mapping definitions again.
            </p>
            {restoreConnectedColumns.length > 0 ? (
              <div className="rounded-control border border-line bg-surface-sunken p-3 text-xs space-y-2">
                <p className="font-medium text-ink">Previous mapping connection:</p>
                <ul className="list-disc list-inside text-ink-soft space-y-1">
                  {restoreConnectedColumns.map((c) => (
                    <li key={c.mappingId}>
                      <strong className="text-ink">{c.columnLabel}</strong> in table{" "}
                      <strong className="text-ink">{c.tableLabel}</strong> (via form{" "}
                      <strong className="text-ink">{c.formLabel}</strong>)
                      {c.columnStatus === "archived"
                        ? " (currently archived)"
                        : " (currently active)"}
                    </li>
                  ))}
                </ul>
                {restoreConnectedColumns.some((c) => c.columnStatus === "archived") ? (
                  <label className="flex items-center gap-2 pt-1 font-medium text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={alsoRestoreColumn}
                      onChange={(e) => setAlsoRestoreColumn(e.target.checked)}
                      className="rounded border-line-strong text-brand focus:ring-brand"
                    />
                    <span>
                      Also restore connected table{" "}
                      {restoreConnectedColumns.length === 1 ? "column" : "columns"} and mapping
                    </span>
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
        }
        confirmLabel="Restore field"
        loading={archiving}
        onCancel={() => {
          setRestoreTarget(null);
          setRestoreConnectedColumns([]);
        }}
        onConfirm={confirmRestore}
      />
    </div>
  );
}
