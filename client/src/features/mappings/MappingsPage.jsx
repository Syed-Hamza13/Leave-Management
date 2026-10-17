import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

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
import { mappings as mappingsApi } from "../../services/resources.js";

import { usePermissions } from "../permissions/PermissionsContext.js";

import MappingPickerDialog from "./MappingPickerDialog.jsx";
import { mappingEditorPath } from "./mappingPaths.js";

const PAGE_SIZE = 25;

export default function MappingsPage() {
  const { can } = usePermissions();
  const toast = useToast();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);

  const canManage = can(PERMISSIONS.MAPPINGS_MANAGE);

  const { data, loading, error, reload } = useAsyncData(
    `mappings:${page}:${search}:${status}`,
    () => mappingsApi.list({ page, pageSize: PAGE_SIZE, search, status })
  );

  const rows = data?.data ?? [];
  const meta = data?.meta ?? null;

  const { run: runArchive, pending: archiving } = useMutation();

  const columns = useMemo(
    () => [
      {
        key: "label",
        header: "Mapping",
        render: (row) => (
          <Link
            to={mappingEditorPath(row.formId, row.tableId)}
            className="font-medium text-ink hover:text-brand hover:underline"
          >
            {row.label}
          </Link>
        ),
      },
      {
        key: "form",
        header: "Form",
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate text-ink-soft">{row.form?.label ?? "—"}</p>
            <code className="font-mono text-xs text-ink-muted">{row.form?.key}</code>
          </div>
        ),
      },
      {
        key: "table",
        header: "Table",
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate text-ink-soft">{row.table?.label ?? "—"}</p>
            <code className="font-mono text-xs text-ink-muted">{row.table?.key}</code>
          </div>
        ),
      },
      {
        key: "entryCount",
        header: "Connections",
        align: "right",
        render: (row) => <span className="text-ink-soft">{row.entryCount}</span>,
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

    const outcome = await runArchive(() => mappingsApi.archive(target.id));

    setArchiveTarget(null);

    if (outcome.ok) {
      toast.success(`“${target.label}” was archived.`);
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, "The mapping could not be archived."));
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
            label="Search mappings"
            placeholder="Search by label, form or table…"
          />

          <Select
            id="mappings-status"
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

        {canManage ? <Button onClick={() => setPickerOpen(true)}>New mapping</Button> : null}
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
            title={search ? "No mappings match your search" : "No mappings yet"}
            description={
              search
                ? "Try a different label, or clear the search."
                : "A mapping connects a form's fields to a table's columns, which is what lets a submission become a record."
            }
            action={
              canManage && !search ? (
                <Button onClick={() => setPickerOpen(true)}>New mapping</Button>
              ) : null
            }
          />
        }
        actions={(row) => (
          <>
            <Link to={mappingEditorPath(row.formId, row.tableId)}>
              <Button variant="ghost" size="sm">
                Open
              </Button>
            </Link>

            {canManage && row.status === "active" ? (
              <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(row)}>
                Archive
              </Button>
            ) : null}
          </>
        )}
      />

      {pickerOpen ? (
        <MappingPickerDialog
          onClose={() => setPickerOpen(false)}
          onPick={({ formId, tableId }) => {
            setPickerOpen(false);
            navigate(mappingEditorPath(formId, tableId));
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive mapping"
        message={`Archive “${archiveTarget?.label ?? ""}”?`}
        detail="The form stops writing to this table. Records already stored are untouched."
        confirmLabel="Archive mapping"
        loading={archiving}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
      />
    </div>
  );
}
