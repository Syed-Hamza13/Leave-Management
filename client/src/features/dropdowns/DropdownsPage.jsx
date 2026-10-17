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
import { dropdowns as dropdownsApi } from "../../services/resources.js";

import { usePermissions } from "../permissions/PermissionsContext.js";

import DropdownDialog from "./DropdownDialog.jsx";

const PAGE_SIZE = 25;

export default function DropdownsPage() {
  const { can } = usePermissions();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);

  const [dialog, setDialog] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);

  const canManage = can(PERMISSIONS.DROPDOWNS_MANAGE);

  const { data, loading, error, reload } = useAsyncData(
    `dropdowns:${page}:${search}:${status}`,
    () => dropdownsApi.list({ page, pageSize: PAGE_SIZE, search, status })
  );

  const rows = data?.data ?? [];
  const meta = data?.meta ?? null;

  const { run: runArchive, pending: archiving } = useMutation();

  const columns = useMemo(
    () => [
      {
        key: "label",
        header: "Option set",
        render: (row) => (
          <div className="min-w-0">
            <Link
              to={`/admin/dropdowns/${row.id}`}
              className="truncate font-medium text-ink hover:text-brand hover:underline"
            >
              {row.label}
            </Link>
            <code className="font-mono text-xs text-ink-muted">{row.key}</code>
          </div>
        ),
      },
      {
        key: "optionCount",
        header: "Options",
        align: "right",
        render: (row) => <span className="text-ink-soft">{row.optionCount}</span>,
      },
      {
        key: "fieldCount",
        header: "Used by",
        align: "right",
        render: (row) => (
          <span className="text-ink-soft">
            {row.fieldCount} {row.fieldCount === 1 ? "field" : "fields"}
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
    []
  );

  async function confirmArchive() {
    const target = archiveTarget;

    const outcome = await runArchive(() => dropdownsApi.archive(target.id));

    setArchiveTarget(null);

    if (outcome.ok) {
      toast.success(`“${target.label}” was archived.`);
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, "The option set could not be archived."));
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
            label="Search option sets"
            placeholder="Search by label or key…"
          />

          <Select
            id="dropdowns-status"
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
          <Button onClick={() => setDialog({ mode: "create" })}>New option set</Button>
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
            title={search ? "No option sets match your search" : "No option sets yet"}
            description={
              search
                ? "Try a different label or key, or clear the search."
                : "Option sets hold the choices behind every dropdown field."
            }
            action={
              canManage && !search ? (
                <Button onClick={() => setDialog({ mode: "create" })}>New option set</Button>
              ) : null
            }
          />
        }
        actions={
          canManage
            ? (row) => (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setDialog({ mode: "edit", dropdown: row })}>
                    Edit
                  </Button>

                  {row.status === "active" ? (
                    <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(row)}>
                      Archive
                    </Button>
                  ) : null}
                </>
              )
            : (row) => (
                <Link to={`/admin/dropdowns/${row.id}`}>
                  <Button variant="ghost" size="sm">
                    Options
                  </Button>
                </Link>
              )
        }
      />

      {dialog ? (
        <DropdownDialog
          dropdown={dialog.dropdown ?? null}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            toast.success(
              dialog.mode === "create"
                ? `“${saved?.label ?? "Option set"}” was created.`
                : `“${saved?.label ?? "Option set"}” was saved.`
            );
            reload();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive option set"
        message={`Archive “${archiveTarget?.label ?? ""}”?`}
        detail={
          archiveTarget?.fieldCount > 0
            ? `${archiveTarget.fieldCount} ${
                archiveTarget.fieldCount === 1 ? "field uses" : "fields use"
              } this option set. Archiving is refused while it is still referenced.`
            : "Archived option sets can no longer be selected by new fields."
        }
        confirmLabel="Archive option set"
        loading={archiving}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
      />
    </div>
  );
}
