import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ColumnVisibilityManager from "../../components/ui/ColumnVisibilityManager.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import SearchInput from "../../components/ui/SearchInput.jsx";
import Select from "../../components/ui/Select.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import useColumnPreferences from "../../hooks/useColumnPreferences.js";
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
  const { getDataType } = useMetadata();
  const toast = useToast();

  const canManage = can(PERMISSIONS.ORGANIZATION_MANAGE);
  const canViewRecords = can(PERMISSIONS.RECORDS_VIEW);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);

  const [configDialog, setConfigDialog] = useState(null);
  const [entityDialog, setEntityDialog] = useState(null);
  const [memberEntityTarget, setMemberEntityTarget] = useState(null);
  const [entityArchiveTarget, setEntityArchiveTarget] = useState(null);
  const [configDeleteTarget, setConfigDeleteTarget] = useState(null);

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
  const activeConfiguration = configurations[0] ?? null;
  const tableId = activeConfiguration?.table?.id ?? null;

  const { data: tableData, reload: reloadTable } = useAsyncData(
    `entity-type-table:${tableId ?? "none"}`,
    () => (tableId ? tablesApi.get(tableId) : Promise.resolve(null))
  );

  const configuredTable = tableData?.data ?? null;
  const tableColumns = useMemo(
    () => (configuredTable?.columns ?? []).filter((c) => !c.isSystem && c.isVisible),
    [configuredTable]
  );

  const { optionsFor } = useEntryOptions(tableColumns);

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

  const profileConfiguration = configurations.find((entry) => entry.scope === "profile") ?? configurations[0] ?? null;

  const rows = data?.data ?? [];
  const meta = data?.meta ?? null;

  const { run: runDelete, pending: deleting } = useMutation();

  const availableColumns = useMemo(() => {
    if (tableColumns.length > 0) {
      return [
        ...tableColumns.map((col, index) => ({
          key: col.key,
          label: col.label,
          alwaysVisible: index === 0,
        })),
        { key: "status", label: "Status" },
      ];
    }

    return [
      { key: "name", label: entityType?.label || "Entity", alwaysVisible: true },
      { key: "status", label: "Status" },
    ];
  }, [tableColumns, entityType]);

  const defaultVisibleKeys = useMemo(
    () => availableColumns.map((c) => c.key),
    [availableColumns]
  );

  const {
    orderedColumns,
    visibleKeys: visibleColumnKeys,
    setVisibleKeys: setVisibleColumnKeys,
    reorderColumns,
    resetPreferences,
  } = useColumnPreferences({
    storageKey: tableId
      ? `columns:entity-type-records:${entityTypeId}:${tableId}`
      : `columns:entity-type-records:${entityTypeId}`,
    columns: availableColumns,
    defaultVisibleKeys,
  });

  const columnDefinitionMap = useMemo(() => {
    const map = new Map();

    if (tableColumns.length > 0) {
      tableColumns.forEach((column, index) => {
        const type = getDataType(column.dataType);
        const isPrimary = index === 0;

        map.set(column.key, {
          key: column.key,
          header: column.label,
          alwaysVisible: isPrimary,
          render: (row) => {
            const raw = row.profile?.values?.[column.key] ?? row.values?.[column.key];
            const formatted =
              raw !== undefined && raw !== null && String(raw).trim() !== ""
                ? formatRecordValue(raw, {
                    storage: type?.storage ?? "string",
                    options: optionsFor(column),
                  })
                : isPrimary
                ? row.name
                : "—";

            if (isPrimary) {
              return (
                <Link
                  to={`/organization/entities/${row.id}`}
                  className="font-medium text-ink hover:text-brand hover:underline"
                >
                  {formatted || row.name || "—"}
                </Link>
              );
            }

            return <span className="text-ink-soft">{formatted}</span>;
          },
        });
      });
    } else {
      map.set("name", {
        key: "name",
        header: entityType?.label || "Entity",
        alwaysVisible: true,
        render: (row) => (
          <Link
            to={`/organization/entities/${row.id}`}
            className="font-medium text-ink hover:text-brand hover:underline"
          >
            {row.name}
          </Link>
        ),
      });
    }

    map.set("status", {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge tone={row.status === "active" ? "success" : "neutral"}>{row.status}</Badge>
      ),
    });

    return map;
  }, [tableColumns, entityType, getDataType, optionsFor]);

  const columns = useMemo(() => {
    return orderedColumns.map((col) => {
      const def = columnDefinitionMap.get(col.key) || {
        key: col.key,
        header: col.label || col.key,
        render: (row) => String(row[col.key] ?? "—"),
      };
      return {
        ...def,
        hidden: !visibleColumnKeys.includes(col.key),
      };
    });
  }, [orderedColumns, columnDefinitionMap, visibleColumnKeys]);

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

  async function confirmConfigurationDelete() {
    const target = configDeleteTarget;

    const outcome = await runDelete(() => organizationApi.deleteConfiguration(target.id));

    setConfigDeleteTarget(null);

    if (outcome.ok) {
      toast.success(`“${target.label}” was removed.`);
      reloadType();
      return;
    }

    toast.error(errorMessage(outcome.error, "The configuration could not be removed."));
  }

  if (typeLoading) return <LoadingState label="Loading entity type…" />;

  if (typeError || !entityType) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-danger">
          {errorMessage(typeError, "This entity type could not be loaded.")}
        </p>

        <Button variant="secondary" size="sm" onClick={reloadType}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Unified Entity Type Header - flush edge-to-edge with no outer margins */}
      <header className="-mx-4 -mt-6 mb-6 border-b border-line bg-surface px-4 py-4 md:-mx-6 md:px-6 md:py-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                <li>
                  <Link to="/organization" className="font-medium text-ink-muted hover:text-brand hover:underline">
                    Organization
                  </Link>
                </li>
                <li aria-hidden="true" className="text-ink-muted">/</li>
                <li>
                  <span aria-current="page" className="font-semibold text-ink-soft">
                    {entityType.label}
                  </span>
                </li>
              </ol>
            </nav>

            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-ink">{entityType.label}</h1>

              {entityType.key && entityType.key !== entityType.label?.toLowerCase() ? (
                <code className="rounded bg-surface-sunken px-2 py-0.5 font-mono text-xs font-medium text-ink-muted border border-line/60">
                  {entityType.key}
                </code>
              ) : null}

              <Badge tone={entityType.status === "active" ? "success" : "neutral"}>
                {entityType.status}
              </Badge>

              <Badge tone="neutral">
                {meta?.total ?? rows.length} {((meta?.total ?? rows.length) === 1) ? "entry" : "entries"}
              </Badge>
            </div>

            {entityType.description ? (
              <p className="max-w-2xl text-sm text-ink-soft">{entityType.description}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {canManage ? (
              configurations.length === 0 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfigDialog({ mode: "create" })}
                >
                  New configuration
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfigDialog({ mode: "edit", configuration: activeConfiguration })}
                >
                  Edit configuration
                </Button>
              )
            ) : null}

            {entityType.status === "active" ? (
              <Button
                size="sm"
                onClick={() => setEntityDialog({ mode: "create" })}
              >
                New {entityType.label.toLowerCase()}
              </Button>
            ) : null}
          </div>
        </div>

        {/* Integrated Configuration Strip */}
        {configurations.length > 0 ? (
          <div className="mt-4 border-t border-line/60 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink-muted uppercase tracking-wider text-[11px]">
                Configuration
              </span>

              <ul className="flex flex-wrap items-center gap-2">
                {configurations.map((configuration) => (
                  <li
                    key={configuration.id}
                    className="flex flex-wrap items-center gap-2 text-ink-soft"
                  >
                    <span className="font-semibold text-ink">{configuration.label}</span>
                    <span className="inline-flex items-center gap-1 rounded border border-line/60 bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink-soft">
                      <span className="text-ink-muted">Form:</span> {configuration.form?.label || "—"}
                    </span>
                    <span className="text-ink-muted">→</span>
                    <span className="inline-flex items-center gap-1 rounded border border-line/60 bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink-soft">
                      <span className="text-ink-muted">Table:</span> {configuration.table?.label || "—"}
                    </span>
                    {configuration.sortOrder != null ? (
                      <span className="text-[11px] text-ink-muted">
                        (order {configuration.sortOrder})
                      </span>
                    ) : null}
                    {!configuration.isActive ? (
                      <Badge tone="warning" size="sm">Inactive</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            {canManage && activeConfiguration ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfigDialog({ mode: "edit", configuration: activeConfiguration })}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfigDeleteTarget(activeConfiguration)}
                >
                  Remove
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          canManage && (
            <div className="mt-4 border-t border-line/60 pt-3 flex items-center justify-between gap-2 text-xs text-ink-muted">
              <span>No form and table linked yet. Click &ldquo;New configuration&rdquo; to link a form and table to this entity.</span>
            </div>
          )
        )}
      </header>

      {/* Main Records Table Section */}
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
              label="Search entities"
              placeholder="Search by name…"
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

          <div className="flex items-center gap-2">
            <ColumnVisibilityManager
              columns={orderedColumns}
              visibleKeys={visibleColumnKeys}
              onChangeVisibleKeys={setVisibleColumnKeys}
              onReorderColumns={reorderColumns}
              onReset={resetPreferences}
              storageKey={
                tableId
                  ? `columns:entity-type-records:${entityTypeId}:${tableId}`
                  : `columns:entity-type-records:${entityTypeId}`
              }
              defaultVisibleKeys={defaultVisibleKeys}
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          error={error}
          onRetry={reload}
          onReorderColumns={reorderColumns}
          pagination={meta}
          onPageChange={setPage}
          empty={
            <EmptyState
              title={search ? "No entities match your search" : "No entities yet"}
              description={
                search
                  ? "Try a different name, or clear the search."
                  : `Create the first ${entityType.label.toLowerCase()} record.`
              }
              action={
                canManage && !search && entityType.status === "active" ? (
                  <Button onClick={() => setEntityDialog({ mode: "create" })}>
                    New {entityType.label.toLowerCase()}
                  </Button>
                ) : null
              }
            />
          }
          actions={(row) => (
            <>
              <Link to={`/organization/entities/${row.id}`}>
                <Button variant="ghost" size="sm">
                  Open
                </Button>
              </Link>

              {canManage && row.status === "active" ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEntityDialog({ mode: "edit", entity: row })}
                  >
                    Edit
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMemberEntityTarget(row)}
                  >
                    Members
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEntityArchiveTarget(row)}
                  >
                    Archive
                  </Button>
                </>
              ) : null}
            </>
          )}
        />
      </section>

      {/* Overlay: Configuration Dialog */}
      {configDialog ? (
        <ConfigurationDialog
          entityTypeId={entityType.id}
          entityType={entityType}
          configuration={configDialog.configuration ?? null}
          onClose={() => setConfigDialog(null)}
          onSaved={(saved) => {
            setConfigDialog(null);
            toast.success(
              configDialog.mode === "create"
                ? `“${saved?.label ?? "Configuration"}” was created.`
                : `“${saved?.label ?? "Configuration"}” was saved.`
            );
            reloadType();
            reload();
            reloadTable();
          }}
        />
      ) : null}

      {/* Overlay: Form Record Dialog */}
      {entityDialog ? (
        <EntityDialog
          entityType={entityType}
          profileConfiguration={profileConfiguration}
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

      {/* Confirmation Dialog: Archive Entity */}
      <ConfirmDialog
        open={Boolean(entityArchiveTarget)}
        title="Archive entity"
        message={`Archive “${entityArchiveTarget?.name ?? ""}”?`}
        detail="Entities with children or with a profile record are refused until those are handled first."
        confirmLabel="Archive entity"
        loading={deleting}
        onCancel={() => setEntityArchiveTarget(null)}
        onConfirm={confirmEntityArchive}
      />

      {/* Confirmation Dialog: Remove Configuration */}
      <ConfirmDialog
        open={Boolean(configDeleteTarget)}
        title="Remove configuration"
        message={`Remove “${configDeleteTarget?.label ?? ""}”?`}
        detail="Only the configuration is removed. The table and its records stay, so nothing already entered is lost."
        confirmLabel="Remove configuration"
        loading={deleting}
        onCancel={() => setConfigDeleteTarget(null)}
        onConfirm={confirmConfigurationDelete}
      />
    </div>
  );
}
