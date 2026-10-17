import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

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
import { tables as tablesApi } from "../../services/resources.js";

import { usePermissions } from "../permissions/PermissionsContext.js";

import TableDialog from "./TableDialog.jsx";

const PAGE_SIZE = 25;

export default function TablesPage() {
  const { can } = usePermissions();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [storageKind, setStorageKind] = useState("");
  const [page, setPage] = useState(1);

  const [dialog, setDialog] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);

  const canManage = can(PERMISSIONS.TABLES_MANAGE);

  const { data, loading, error, reload } = useAsyncData(
    `tables:${page}:${search}:${status}:${storageKind}`,
    () =>
      tablesApi.list({
        page,
        pageSize: PAGE_SIZE,
        search,
        status,
        storageKind: storageKind || undefined,
      })
  );

  const rows = data?.data ?? [];
  const meta = data?.meta ?? null;

  const { run: runArchive, pending: archiving } = useMutation();

  const columns = useMemo(
    () => [
      {
        key: "label",
        header: "Table",
        render: (row) => (
          <div className="min-w-0">
            <Link
              to={`/admin/tables/${row.id}`}
              className="truncate font-medium text-ink hover:text-brand hover:underline"
            >
              {row.label}
            </Link>
            <code className="font-mono text-xs text-ink-muted">{row.key}</code>
          </div>
        ),
      },
      {
        key: "storageKind",
        header: "Storage",
        render: (row) =>
          row.isSystem ? (
            <Badge tone="warning">System</Badge>
          ) : (
            <span className="text-xs text-ink-muted">Managed</span>
          ),
      },
      {
        key: "columnCount",
        header: "Columns",
        align: "right",
        render: (row) => <span className="text-ink-soft">{row.columnCount}</span>,
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <Badge tone={row.status === "active" ? "success" : "neutral"}>{row.status}</Badge>
        ),
      },
    ],
    []
  );

  async function confirmArchive() {
    const target = archiveTarget;

    const outcome = await runArchive(() => tablesApi.archive(target.id));

    setArchiveTarget(null);

    if (outcome.ok) {
      toast.success(`“${target.label}” was archived.`);
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, "The table could not be archived."));
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
            label="Search tables"
            placeholder="Search by name or key…"
          />

          <Select
            id="tables-status"
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

          <Select
            id="tables-storage"
            label="Storage"
            className="w-44"
            value={storageKind}
            onChange={(event) => {
              setStorageKind(event.target.value);
              setPage(1);
            }}
            placeholder="All tables"
            options={[
              { value: "managed", label: "Managed" },
              { value: "system_users", label: "System" },
            ]}
          />
        </div>

        {canManage ? <Button onClick={() => setDialog({ mode: "create" })}>New table</Button> : null}
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
            title={search ? "No tables match your search" : "No tables yet"}
            description={
              search
                ? "Try a different name or key, or clear the search."
                : "A table is where records are stored. Create one, add its columns, then map a form onto it."
            }
            action={
              canManage && !search ? (
                <Button onClick={() => setDialog({ mode: "create" })}>New table</Button>
              ) : null
            }
          />
        }
        actions={(row) => (
          <>
            <Link to={`/admin/tables/${row.id}`}>
              <Button variant="ghost" size="sm">
                Open
              </Button>
            </Link>

            {canManage && !row.isSystem ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialog({ mode: "edit", table: row })}
                >
                  Edit
                </Button>

                {row.status === "active" ? (
                  <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(row)}>
                    Archive
                  </Button>
                ) : null}
              </>
            ) : null}
          </>
        )}
      />

      {dialog ? (
        <TableDialog
          table={dialog.table ?? null}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            toast.success(
              dialog.mode === "create"
                ? `“${saved?.label ?? "Table"}” was created.`
                : `“${saved?.label ?? "Table"}” was saved.`
            );
            reload();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive table"
        message={`Archive “${archiveTarget?.label ?? ""}”?`}
        detail="A table is refused while it still holds records, is used by a mapping, or is the target of a relation column."
        confirmLabel="Archive table"
        loading={archiving}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
      />
    </div>
  );
}
