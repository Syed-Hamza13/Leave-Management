import { useState } from "react";
import { Link } from "react-router-dom";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import SearchInput from "../../components/ui/SearchInput.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import { errorMessage } from "../../services/errors.js";
import { organization as organizationApi } from "../../services/resources.js";

import { usePermissions } from "../permissions/PermissionsContext.js";
import { useMetadata } from "../metadata/MetadataContext.js";

import EntityTypeDialog from "./EntityTypeDialog.jsx";

export default function OrganizationPage() {
  const { can } = usePermissions();
  const { refresh: refreshMetadata } = useMetadata();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);

  const canManage = can(PERMISSIONS.ORGANIZATION_MANAGE);

  const { data, loading, error, reload } = useAsyncData(
    "entity-types:all:active",
    () => organizationApi.listEntityTypes({ pageSize: 100, status: "active" })
  );

  const rows = data?.data ?? [];
  const filteredRows = rows.filter((row) =>
    search ? row.label.toLowerCase().includes(search.toLowerCase()) : true
  );

  const { run: runArchive, pending: archiving } = useMutation();

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

    toast.error(errorMessage(outcome.error, "The entity type could not be archived."));
  }

  if (loading) return <LoadingState label="Loading organization…" />;

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-danger">
          {errorMessage(error, "Organization could not be loaded.")}
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
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <SearchInput
            className="w-full sm:max-w-xs"
            value={search}
            onChange={(next) => setSearch(next)}
            label="Search entities"
            placeholder="Search entities by name…"
          />
        </div>

        {canManage ? (
          <Button onClick={() => setDialog({ mode: "create" })}>Define Entity</Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No entities defined yet"
          description="Start by defining an entity type like Department, Branch, or Team."
          action={
            canManage ? (
              <Button onClick={() => setDialog({ mode: "create" })}>Define Entity</Button>
            ) : null
          }
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          title="No entities match your search"
          description={`No entities found matching "${search}". Try a different name, or clear the search.`}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRows.map((row) => (
            <li
              key={row.id}
              className="group flex flex-col justify-between rounded-card border border-line bg-surface p-4 shadow-sm transition-all hover:border-brand/40 hover:shadow-md"
            >
              <div className="mb-3">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to={`/organization/${row.id}`}
                    className="text-base font-semibold text-ink transition-colors group-hover:text-brand"
                  >
                    {row.label}
                  </Link>

                  <Badge tone={row.configurationCount > 0 ? "success" : "warning"}>
                    {row.configurationCount}{" "}
                    {row.configurationCount === 1 ? "config" : "configs"}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 border-t border-line/80 pt-3">
                <Link to={`/organization/${row.id}`}>
                  <Button variant="secondary" size="sm">
                    Open
                  </Button>
                </Link>

                <Link to={`/organization/${row.id}/configure`}>
                  <Button variant="ghost" size="sm">
                    Configure
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

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setArchiveTarget(row)}
                    >
                      Archive
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

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
        title="Archive entity type"
        message={`Archive "${archiveTarget?.label ?? ""}"?`}
        detail="Existing records are never deleted by archiving. The type can be reactivated later."
        confirmLabel="Archive"
        loading={archiving}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
      />
    </div>
  );
}
