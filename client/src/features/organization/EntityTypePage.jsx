import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import SearchInput from "../../components/ui/SearchInput.jsx";
import Select from "../../components/ui/Select.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import { errorMessage } from "../../services/errors.js";
import { organization as organizationApi, tables as tablesApi } from "../../services/resources.js";

import { useMetadata } from "../metadata/MetadataContext.js";
import { usePermissions } from "../permissions/PermissionsContext.js";
import { formatRecordValue } from "../records/recordValues.js";
import useEntryOptions from "../records/useEntryOptions.js";

import ConfigurationDialog from "./ConfigurationDialog.jsx";
import EntityDialog from "./EntityDialog.jsx";
import EntityMembersModal from "./EntityMembersModal.jsx";

const PAGE_SIZE = 25;

export default function EntityTypePage() {
  const { entityTypeId } = useParams();
  const { can } = usePermissions();
  const toast = useToast();

  const canManage = can(PERMISSIONS.ORGANIZATION_MANAGE);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);

  const [configOpen, setConfigOpen] = useState(false);
  const [entityDialog, setEntityDialog] = useState(null);
  const [memberEntityTarget, setMemberEntityTarget] = useState(null);
  const [entityArchiveTarget, setEntityArchiveTarget] = useState(null);

  const {
    data: typeData,
    loading: typeLoading,
    error: typeError,
    reload: reloadType,
  } = useAsyncData(`entity-type:${entityTypeId}`, () =>
    organizationApi.getEntityType(entityTypeId)
  );

  const entityType = typeData?.data ?? null;
  const configurations = useMemo(() => entityType?.configurations ?? [], [entityType]);

  const primaryConfiguration = useMemo(
    () => configurations.find((entry) => entry.scope === "profile") ?? configurations[0] ?? null,
    [configurations]
  );

  const { data: profileTableData } = useAsyncData(
    `profile-table-def:${primaryConfiguration?.table?.id ?? "none"}`,
    () =>
      primaryConfiguration?.table?.id
        ? tablesApi.get(primaryConfiguration.table.id)
        : Promise.resolve(null)
  );

  const profileTable = profileTableData?.data ?? null;

  const profileColumns = useMemo(() => {
    const active = (profileTable?.columns ?? []).filter(
      (col) => !col.isSystem && col.isVisible && col.status === "active"
    );

    const seenKeys = new Set();
    const seenLabels = new Set();

    return active.filter((col) => {
      const keyLower = col.key?.toLowerCase();
      const labelLower = col.label?.trim().toLowerCase();

      if (seenKeys.has(keyLower) || seenLabels.has(labelLower)) {
        return false;
      }

      seenKeys.add(keyLower);
      seenLabels.add(labelLower);
      return true;
    });
  }, [profileTable]);

  const { optionsFor } = useEntryOptions(profileColumns);
  const { getDataType } = useMetadata();

  const { data, loading, error, reload } = useAsyncData(
    `entities:${entityTypeId}:${page}:${search}:${status}`,
    () =>
      organizationApi.listEntities({
        entityTypeId,
        page,
        pageSize: PAGE_SIZE,
        search,
        status,
      })
  );

  const rows = data?.data ?? [];
  const meta = data?.meta ?? null;

  const { run: runDelete, pending: deleting } = useMutation();

  const columns = useMemo(() => {
    const list = [];

    if (profileColumns.length > 0) {
      // Use the actual columns defined in the configured table
      profileColumns.forEach((col, index) => {
        const type = getDataType(col.dataType);
        list.push({
          key: `col_${col.key}`,
          header: col.label,
          render: (row) => {
            const rawVal = row.profile?.values?.[col.key] ?? (index === 0 ? row.name : null);
            const formatted = formatRecordValue(rawVal, {
              storage: type?.storage ?? "string",
              options: optionsFor(col),
            });

            return index === 0 ? (
              <span className="font-semibold text-ink">{formatted}</span>
            ) : (
              <span className="text-ink-soft">{formatted}</span>
            );
          },
        });
      });
    } else {
      // Fallback only if no table or columns are configured
      list.push({
        key: "name",
        header: `${entityType?.label || "Entity"} Name`,
        render: (row) => <span className="font-semibold text-ink">{row.name}</span>,
      });
    }

    list.push({
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge tone={row.status === "active" ? "success" : "neutral"}>{row.status}</Badge>
      ),
    });

    return list;
  }, [profileColumns, optionsFor, getDataType, entityType]);

  async function confirmEntityArchive() {
    const target = entityArchiveTarget;

    const outcome = await runDelete(() => organizationApi.archiveEntity(target.id));

    setEntityArchiveTarget(null);

    if (outcome.ok) {
      toast.success(`“${target.name}” was archived.`);
      reload();
      reloadType();
      return;
    }

    toast.error(errorMessage(outcome.error, "The entity could not be archived."));
  }

  if (typeLoading) return <LoadingState label="Loading entity…" />;

  if (typeError || !entityType) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-danger">
          {errorMessage(typeError, "This entity could not be loaded.")}
        </p>

        <Button variant="secondary" size="sm" onClick={reloadType}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card - Direct, clean and professional */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-ink-muted">
              <Link to="/organization" className="hover:text-brand hover:underline">
                Organization
              </Link>
              <span aria-hidden="true">/</span>
              <span className="font-medium text-ink-soft">{entityType.label}</span>
            </nav>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-ink">{entityType.label}</h1>

              {entityType.key && entityType.key !== entityType.label?.toLowerCase() ? (
                <code className="rounded bg-surface-sunken px-2 py-0.5 font-mono text-xs text-ink-muted">
                  {entityType.key}
                </code>
              ) : null}

              <Badge tone={entityType.status === "active" ? "success" : "neutral"}>
                {entityType.status}
              </Badge>

              <Badge tone="neutral">
                {meta?.total ?? rows.length} {((meta?.total ?? rows.length) === 1) ? "entry" : "entries"}
              </Badge>

              {primaryConfiguration ? (
                <Badge tone="brand">
                  {primaryConfiguration.form.label} → {primaryConfiguration.table.label}
                </Badge>
              ) : (
                <Badge tone="warning">Not Configured</Badge>
              )}
            </div>

            {entityType.description ? (
              <p className="text-sm text-ink-soft">{entityType.description}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {canManage ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setConfigOpen(true)}
              >
                Configure
              </Button>
            ) : null}

            {entityType.status === "active" ? (
              <Button
                size="sm"
                onClick={() => {
                  if (!primaryConfiguration) {
                    toast.info("Please configure a form and table first.");
                    setConfigOpen(true);
                    return;
                  }
                  setEntityDialog({ mode: "create" });
                }}
              >
                + Add {entityType.label}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Main Records Table Section */}
      {!primaryConfiguration ? (
        <EmptyState
          title={`No Form & Table configured for "${entityType.label}"`}
          description={`To add and view entries, configure a form and table using the Configure button.`}
          action={
            canManage ? (
              <Button onClick={() => setConfigOpen(true)}>
                Configure Form & Table
              </Button>
            ) : null
          }
        />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-1 flex-wrap items-end gap-3">
              <SearchInput
                className="w-full sm:max-w-xs"
                value={search}
                onChange={(next) => {
                  setSearch(next);
                  setPage(1);
                }}
                label={`Search ${entityType.label.toLowerCase()} entries`}
                placeholder="Search entries…"
              />

              <Select
                id="entities-status"
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
                title={search ? "No entries match your search" : `No ${entityType.label.toLowerCase()} entries yet`}
                description={
                  search
                    ? "Try a different search term, or clear the search filter."
                    : `Click "+ Add ${entityType.label}" to record the first entry.`
                }
                action={
                  canManage && !search && entityType.status === "active" ? (
                    <Button onClick={() => setEntityDialog({ mode: "create" })}>
                      + Add {entityType.label}
                    </Button>
                  ) : null
                }
              />
            }
            actions={(row) => (
              <>
                {canManage && row.status === "active" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEntityDialog({ mode: "edit", entity: row })}
                  >
                    Edit
                  </Button>
                ) : null}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMemberEntityTarget(row)}
                >
                  Members
                </Button>

                {canManage && row.status === "active" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEntityArchiveTarget(row)}
                  >
                    Archive
                  </Button>
                ) : null}
              </>
            )}
          />
        </section>
      )}

      {/* Overlay: Configuration Dialog */}
      {configOpen ? (
        <ConfigurationDialog
          entityTypeId={entityType.id}
          entityType={entityType}
          configuration={primaryConfiguration}
          onClose={() => setConfigOpen(false)}
          onSaved={(saved) => {
            setConfigOpen(false);
            toast.success(`"${saved?.label ?? entityType.label}" configuration saved.`);
            reloadType();
            reload();
          }}
        />
      ) : null}

      {/* Overlay: Form Record Dialog */}
      {entityDialog ? (
        <EntityDialog
          entityType={entityType}
          profileConfiguration={primaryConfiguration}
          entity={entityDialog.entity ?? null}
          onClose={() => setEntityDialog(null)}
          onSaved={(saved) => {
            setEntityDialog(null);
            toast.success(
              entityDialog.mode === "create"
                ? `“${saved?.name ?? entityType.label}” was created.`
                : `“${saved?.name ?? entityType.label}” was saved.`
            );
            reload();
            reloadType();
          }}
        />
      ) : null}

      {/* Overlay: Entity Members Modal */}
      {memberEntityTarget ? (
        <EntityMembersModal
          entity={memberEntityTarget}
          canManage={canManage}
          onClose={() => setMemberEntityTarget(null)}
        />
      ) : null}

      {/* Confirmation Dialog: Archive */}
      <ConfirmDialog
        open={Boolean(entityArchiveTarget)}
        title="Archive record"
        message={`Archive “${entityArchiveTarget?.name ?? ""}”?`}
        detail="The record will be archived. You can restore it later if needed."
        confirmLabel="Archive"
        loading={deleting}
        onCancel={() => setEntityArchiveTarget(null)}
        onConfirm={confirmEntityArchive}
      />
    </div>
  );
}
