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
import { organization as organizationApi } from "../../services/resources.js";

import { usePermissions } from "../permissions/PermissionsContext.js";

import ConfigurationDialog from "./ConfigurationDialog.jsx";
import EntityDialog from "./EntityDialog.jsx";

const PAGE_SIZE = 25;

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

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Entity",
        render: (row) => (
          <Link
            to={`/organization/entities/${row.id}`}
            className="font-medium text-ink hover:text-brand hover:underline"
          >
            {row.name}
          </Link>
        ),
      },
      {
        key: "parentEntity",
        header: "Parent",
        render: (row) =>
          row.parentEntity ? (
            <span className="text-sm text-ink-soft">{row.parentEntity.name}</span>
          ) : (
            <span className="text-xs text-ink-muted">Top of the tree</span>
          ),
      },
      {
        key: "childCount",
        header: "Children",
        align: "right",
        render: (row) => <span className="text-ink-soft">{row.childCount}</span>,
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink-muted">
            <Link to="/organization" className="hover:text-brand hover:underline">
              Organization
            </Link>
          </p>

          <p className="truncate text-sm font-semibold text-ink">{entityType.label}</p>

          <code className="font-mono text-xs text-ink-muted">{entityType.key}</code>

          {entityType.description ? (
            <p className="mt-1 text-sm text-ink-soft">{entityType.description}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={entityType.status === "active" ? "success" : "neutral"}>
            {entityType.status}
          </Badge>

          <Badge tone="neutral">
            {entityType.entityCount} {entityType.entityCount === 1 ? "entity" : "entities"}
          </Badge>

          {canManage ? (
            <Button size="sm" onClick={() => setConfigDialog({ mode: "create" })}>
              New configuration
            </Button>
          ) : null}
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Configurations</h2>

        <p className="text-xs text-ink-soft">
          Each configuration names the form, table and mapping this kind of entity uses. A profile
          holds one record per entity; a section holds a list.
        </p>

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

                {/*
                 * A configuration is only worth having once it can be used from
                 * here: a profile feeds the entity form, a section opens the
                 * records screen of the table it stores into.
                 */}
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

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">
            {entityType.label} records
          </h2>

          <div className="flex flex-1 flex-wrap items-end justify-end gap-3">
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

            {canManage && entityType.status === "active" ? (
              <Button onClick={() => setEntityDialog({ mode: "create" })}>
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

                  <Button variant="ghost" size="sm" onClick={() => setEntityArchiveTarget(row)}>
                    Archive
                  </Button>
                </>
              ) : null}
            </>
          )}
        />
      </section>

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
