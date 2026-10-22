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
import { organization as organizationApi } from "../../services/resources.js";

import { usePermissions } from "../permissions/PermissionsContext.js";

import ConfigurationDialog from "./ConfigurationDialog.jsx";
import EntityDialog from "./EntityDialog.jsx";
import EntityMembersModal from "./EntityMembersModal.jsx";

const PAGE_SIZE = 25;

const AVAILABLE_COLUMNS = [
  { key: "name", label: "Entity", alwaysVisible: true },
  { key: "parentEntity", label: "Parent" },
  { key: "childCount", label: "Children" },
  { key: "status", label: "Status" },
];

const DEFAULT_VISIBLE_KEYS = AVAILABLE_COLUMNS.map((c) => c.key);

export default function EntityTypePage() {
  const { entityTypeId } = useParams();
  const { can } = usePermissions();
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

  const entityType = typeData?.data ?? null;
  const configurations = useMemo(() => entityType?.configurations ?? [], [entityType]);

  const profileConfiguration = configurations.find((entry) => entry.scope === "profile") ?? null;

  const rows = data?.data ?? [];
  const meta = data?.meta ?? null;

  const { run: runDelete, pending: deleting } = useMutation();

  const {
    orderedColumns,
    visibleKeys: visibleColumnKeys,
    setVisibleKeys: setVisibleColumnKeys,
    reorderColumns,
    resetPreferences,
  } = useColumnPreferences({
    storageKey: `columns:entity-type-records:${entityTypeId}`,
    columns: AVAILABLE_COLUMNS,
    defaultVisibleKeys: DEFAULT_VISIBLE_KEYS,
  });

  const columnDefinitionMap = useMemo(() => {
    const map = new Map();

    map.set("name", {
      key: "name",
      header: "Entity",
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

    map.set("parentEntity", {
      key: "parentEntity",
      header: "Parent",
      render: (row) =>
        row.parentEntity ? (
          <span className="text-sm text-ink-soft">{row.parentEntity.name}</span>
        ) : (
          <span className="text-xs text-ink-muted">Top of the tree</span>
        ),
    });

    map.set("childCount", {
      key: "childCount",
      header: "Children",
      align: "right",
      render: (row) => <span className="text-ink-soft">{row.childCount}</span>,
    });

    map.set("status", {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge tone={row.status === "active" ? "success" : "neutral"}>{row.status}</Badge>
      ),
    });

    return map;
  }, []);

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
      {/* Top Header Card */}
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

              {entityType.parentType ? (
                <span className="text-xs text-ink-muted">
                  Under{" "}
                  <Link
                    to={`/organization/${entityType.parentType.id}`}
                    className="font-medium text-ink hover:text-brand hover:underline"
                  >
                    {entityType.parentType.label}
                  </Link>
                </span>
              ) : null}
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
                onClick={() => setConfigDialog({ mode: "create" })}
              >
                New configuration
              </Button>
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
      </div>

      {/* Configurations Section */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Configurations</h2>
            <p className="text-xs text-ink-soft">
              Forms and tables linked to {entityType.label.toLowerCase()} for profiles and section records.
            </p>
          </div>

          {canManage ? (
            <Button size="sm" onClick={() => setConfigDialog({ mode: "create" })}>
              New configuration
            </Button>
          ) : null}
        </div>

        {configurations.length === 0 ? (
          <EmptyState
            title="Nothing is configured yet"
            description="Give this type a profile configuration so entities can carry their own details."
            action={
              canManage ? (
                <Button onClick={() => setConfigDialog({ mode: "create" })}>
                  New configuration
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {configurations.map((configuration) => (
              <li key={configuration.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">
                      {configuration.label}
                    </span>

                    <Badge tone={configuration.scope === "profile" ? "brand" : "neutral"}>
                      {configuration.scope}
                    </Badge>

                    {!configuration.isActive ? <Badge tone="warning">Inactive</Badge> : null}
                  </p>

                  <p className="mt-0.5 text-xs text-ink-muted">
                    {configuration.form.label} → {configuration.table.label}
                    <span className="ml-2">order {configuration.sortOrder}</span>
                  </p>
                </div>

                {configuration.isActive &&
                entityType.status === "active" &&
                (configuration.scope === "profile" || canViewRecords) ? (
                  configuration.scope === "profile" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEntityDialog({ mode: "create" })}
                    >
                      New {entityType.label.toLowerCase()}
                    </Button>
                  ) : (
                    <Link to={`/records/${configuration.table.id}`}>
                      <Button variant="secondary" size="sm">Open records</Button>
                    </Link>
                  )
                ) : null}

                {canManage ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfigDialog({ mode: "edit", configuration })}
                    >
                      Edit
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfigDeleteTarget(configuration)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

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
              storageKey={`columns:entity-type-records:${entityTypeId}`}
              defaultVisibleKeys={DEFAULT_VISIBLE_KEYS}
            />

            {canManage && entityType.status === "active" ? (
              <Button size="sm" onClick={() => setEntityDialog({ mode: "create" })}>
                New {entityType.label.toLowerCase()}
              </Button>
            ) : null}
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
