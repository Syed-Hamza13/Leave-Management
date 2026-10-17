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
import { forms as formsApi } from "../../services/resources.js";

import { usePermissions } from "../permissions/PermissionsContext.js";

import FormDialog from "./FormDialog.jsx";

const PAGE_SIZE = 25;

export default function FormsPage() {
  const { can } = usePermissions();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);

  const [dialog, setDialog] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);

  const canManage = can(PERMISSIONS.FORMS_MANAGE);

  const { data, loading, error, reload } = useAsyncData(
    `forms:${page}:${search}:${status}`,
    () => formsApi.list({ page, pageSize: PAGE_SIZE, search, status })
  );

  const rows = data?.data ?? [];
  const meta = data?.meta ?? null;

  const { run: runArchive, pending: archiving } = useMutation();

  const columns = useMemo(
    () => [
      {
        key: "label",
        header: "Form",
        render: (row) => (
          <div className="min-w-0">
            <Link
              to={`/admin/forms/${row.id}`}
              className="truncate font-medium text-ink hover:text-brand hover:underline"
            >
              {row.label}
            </Link>
            <code className="font-mono text-xs text-ink-muted">{row.key}</code>
          </div>
        ),
      },
      {
        key: "fieldCount",
        header: "Fields",
        align: "right",
        render: (row) => <span className="text-ink-soft">{row.fieldCount}</span>,
      },
      {
        key: "mappingCount",
        header: "Mapped to",
        align: "right",
        render: (row) => (
          <span className="text-ink-soft">
            {row.mappingCount} {row.mappingCount === 1 ? "table" : "tables"}
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

    const outcome = await runArchive(() => formsApi.archive(target.id));

    setArchiveTarget(null);

    if (outcome.ok) {
      toast.success(`“${target.label}” was archived.`);
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, "The form could not be archived."));
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
            label="Search forms"
            placeholder="Search by name or key…"
          />

          <Select
            id="forms-status"
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

        {canManage ? <Button onClick={() => setDialog({ mode: "create" })}>New form</Button> : null}
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
            title={search ? "No forms match your search" : "No forms yet"}
            description={
              search
                ? "Try a different name or key, or clear the search."
                : "A form composes reusable fields into the shape people fill in."
            }
            action={
              canManage && !search ? (
                <Button onClick={() => setDialog({ mode: "create" })}>New form</Button>
              ) : null
            }
          />
        }
        actions={(row) => (
          <>
            <Link to={`/admin/forms/${row.id}`}>
              <Button variant="ghost" size="sm">
                Open
              </Button>
            </Link>

            {canManage ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setDialog({ mode: "edit", form: row })}>
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
        <FormDialog
          form={dialog.form ?? null}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            toast.success(
              dialog.mode === "create"
                ? `“${saved?.label ?? "Form"}” was created.`
                : `“${saved?.label ?? "Form"}” was saved.`
            );
            reload();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive form"
        message={`Archive “${archiveTarget?.label ?? ""}”?`}
        detail={
          archiveTarget?.mappingCount > 0
            ? `This form is mapped to ${archiveTarget.mappingCount} ${
                archiveTarget.mappingCount === 1 ? "table" : "tables"
              }. Archiving is refused while a mapping still depends on it.`
            : "Archived forms stop accepting new submissions."
        }
        confirmLabel="Archive form"
        loading={archiving}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
      />
    </div>
  );
}
