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
import { organization as organizationApi } from "../../services/resources.js";

import { usePermissions } from "../permissions/PermissionsContext.js";
import { useMetadata } from "../metadata/MetadataContext.js";

import EntityTypeDialog from "./EntityTypeDialog.jsx";

const PAGE_SIZE = 25;

export default function OrganizationPage() {
  const { can } = usePermissions();
  const { refresh: refreshMetadata } = useMetadata();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);

  const [dialog, setDialog] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);

  const canManage = can(PERMISSIONS.ORGANIZATION_MANAGE);

  const { data, loading, error, reload } = useAsyncData(
    `entity-types:${page}:${search}:${status}`,
    () => organizationApi.listEntityTypes({ page, pageSize: PAGE_SIZE, search, status })
  );

  const rows = data?.data ?? [];
  const meta = data?.meta ?? null;

  const { run: runArchive, pending: archiving } = useMutation();

  const columns = useMemo(
    () => [
      {
        key: "label",
        header: "Entity",
        render: (row) => (
          <div className="min-w-0">
            <Link
              to={`/organization/${row.id}`}
              className="truncate font-medium text-ink hover:text-brand hover:underline"
            >
              {row.label}
            </Link>
            <code className="ml-2 font-mono text-xs text-ink-muted">{row.key}</code>
          </div>
        ),
      },
      {
        key: "description",
        header: "Description",
        render: (row) => (
          <span className="truncate max-w-xs block text-sm text-ink-soft">
            {row.description || "—"}
          </span>
        ),
      },
      {
        key: "entityCount",
        header: "Entries",
        align: "right",
        render: (row) => <span className="font-medium text-ink-soft">{row.entityCount}</span>,
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

    const outcome = await runArchive(() => organizationApi.archiveEntityType(target.id));

    setArchiveTarget(null);

    if (outcome.ok) {
      toast.success(`"${target.label}" was archived.`);
      reload();
      refreshMetadata();
      return;
    }

    toast.error(errorMessage(outcome.error, "The entity could not be archived."));
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
            label="Search entities"
            placeholder="Search by name or key…"
          />

          <Select
            id="entity-types-status"
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
          <Button onClick={() => setDialog({ mode: "create" })}>+ New entity</Button>
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
            title={search ? "No entities match your search" : "No entities defined yet"}
            description={
              search
                ? "Try a different name or key, or clear the search."
                : "Define entities such as Team, Department, or Council for your organization."
            }
            action={
              canManage && !search ? (
                <Button onClick={() => setDialog({ mode: "create" })}>+ New entity</Button>
              ) : null
            }
          />
        }
        actions={(row) => (
          <>
            <Link to={`/organization/${row.id}`}>
              <Button variant="ghost" size="sm">
                Open
              </Button>
            </Link>

            {canManage ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialog({ mode: "edit", entityType: row })}
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
        <EntityTypeDialog
          entityType={dialog.entityType ?? null}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            toast.success(
              dialog.mode === "create"
                ? `"${saved?.label ?? "Entity"}" was created.`
                : `"${saved?.label ?? "Entity"}" was saved.`
            );
            reload();
            refreshMetadata();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive entity"
        message={`Archive "${archiveTarget?.label ?? ""}"?`}
        detail="Existing records are preserved. You can restore this entity later if needed."
        confirmLabel="Archive entity"
        loading={archiving}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
      />
    </div>
  );
}
