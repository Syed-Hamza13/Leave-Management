import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import { errorMessage } from "../../services/errors.js";
import {
  forms as formsApi,
  mappings as mappingsApi,
  organization as organizationApi,
  records as recordsApi,
  tables as tablesApi,
} from "../../services/resources.js";

import { useMetadata } from "../metadata/MetadataContext.js";
import { usePermissions } from "../permissions/PermissionsContext.js";
import { formatRecordValue } from "../records/recordValues.js";
import useEntryOptions from "../records/useEntryOptions.js";
import RecordDialog from "../records/RecordDialog.jsx";

import EntityDialog from "./EntityDialog.jsx";

const SECTION_PAGE_SIZE = 50;

function ProfilePanel({ entityType, configuration, entity, canManage, onEdit }) {
  const { getDataType } = useMetadata();

  const formId = configuration.form.id;
  const tableId = configuration.table.id;

  const { data: renderData, loading: renderLoading } = useAsyncData(
    `profile-form:${formId}`,
    () => formsApi.render(formId)
  );

  const { data: pairData, loading: pairLoading } = useAsyncData(
    `profile-pair:${formId}:${tableId}`,
    () => mappingsApi.forFormAndTable(formId, tableId)
  );

  const fields = useMemo(() => renderData?.data?.fields ?? [], [renderData]);
  const entries = pairData?.data?.entries ?? null;

  const { optionsFor } = useEntryOptions(fields);

  const columnKeyByFieldKey = useMemo(
    () => new Map((entries ?? []).map((entry) => [entry.field.key, entry.column.key])),
    [entries]
  );

  if (renderLoading || pairLoading) return <LoadingState label="Loading profile…" />;

  const values = entity.profile?.values ?? {};

  const rows = fields.map((field) => {
    const columnKey = columnKeyByFieldKey.get(field.key);

    return {
      key: field.key,
      label: field.label,
      required: Boolean(field.isRequired),
      text: formatRecordValue(columnKey ? values[columnKey] : null, {
        storage: getDataType(field.dataType)?.storage ?? "string",
        options: optionsFor(field),
      }),
    };
  });

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">
          {configuration.label}
          <span className="ml-2 text-xs font-normal text-ink-muted">
            via {configuration.form.label}
          </span>
        </h2>

        {canManage ? (
          <Button size="sm" variant="secondary" onClick={onEdit} disabled={entity.status !== "active"}>
            Edit profile
          </Button>
        ) : null}
      </div>

      {!entity.profile ? (
        <p className="text-sm text-ink-soft">
          No profile record has been saved for this {entityType.label.toLowerCase()} yet.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-soft">
          The profile form has no active fields, so there is nothing to show.
        </p>
      ) : (
        <dl className="grid gap-x-6 gap-y-3 rounded-card border border-line bg-surface px-4 py-4 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.key} className="min-w-0">
              <dt className="text-xs text-ink-muted">
                {row.label}
                {row.required ? " *" : ""}
              </dt>

              <dd className="truncate text-sm text-ink">{row.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function SectionPanel({ configuration, entityId, entityActive }) {
  const { can } = usePermissions();
  const { getDataType } = useMetadata();
  const toast = useToast();

  const [dialog, setDialog] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);

  const tableId = configuration.table.id;

  const canCreate = can(PERMISSIONS.RECORDS_CREATE) && entityActive;
  const canUpdate = can(PERMISSIONS.RECORDS_UPDATE);
  const canDelete = can(PERMISSIONS.RECORDS_DELETE);

  const {
    data: tableData,
    loading: tableLoading,
    error: tableError,
    reload: reloadTable,
  } = useAsyncData(`section-table:${tableId}`, () => tablesApi.get(tableId));

  const { data, loading, error, reload } = useAsyncData(`section-records:${tableId}:${entityId}`, () =>
    recordsApi.list(tableId, {
      organizationEntityId: entityId,
      status: "active",
      pageSize: SECTION_PAGE_SIZE,
      sort: { key: "createdAt", direction: "desc" },
    })
  );

  const { run: runArchive, pending: archiving } = useMutation();

  const table = tableData?.data ?? null;
  const columns = useMemo(() => table?.columns ?? [], [table]);
  const browsable = useMemo(
    () => columns.filter((column) => !column.isSystem && column.isVisible),
    [columns]
  );

  const { optionsFor } = useEntryOptions(columns);

  const rows = data?.data ?? [];

  const tableColumns = useMemo(
    () =>
      browsable.map((column) => {
        const type = getDataType(column.dataType);

        return {
          key: column.key,
          header: column.label,
          render: (row) => (
            <span className="text-ink-soft">
              {formatRecordValue(row.values?.[column.key], {
                storage: type?.storage ?? "string",
                options: optionsFor(column),
              })}
            </span>
          ),
        };
      }),
    [browsable, getDataType, optionsFor]
  );

  async function confirmArchive() {
    const target = archiveTarget;

    const outcome = await runArchive(() => recordsApi.archive(tableId, target.id));

    setArchiveTarget(null);

    if (outcome.ok) {
      toast.success(`Record #${target.id} was archived.`);
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, "The record could not be archived."));
  }

  if (tableLoading) return <LoadingState label={`Loading ${configuration.label}…`} />;

  if (tableError || !table) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-danger">
          {errorMessage(tableError, `“${configuration.label}” could not be loaded.`)}
        </p>

        <Button variant="secondary" size="sm" onClick={reloadTable}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">
          {configuration.label}
          <span className="ml-2 text-xs font-normal text-ink-muted">
            via {configuration.form.label}
          </span>
        </h2>

        {canCreate ? (
          <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
            Add to {configuration.label.toLowerCase()}
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={tableColumns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        empty={
          <EmptyState
            title={`No ${configuration.label.toLowerCase()} yet`}
            description="Records added here are linked to this entity and stay out of the general list."
          />
        }
        actions={(row) => (
          <>
            {canUpdate ? (
              <Button variant="ghost" size="sm" onClick={() => setDialog({ mode: "edit", record: row })}>
                Edit
              </Button>
            ) : null}

            {canDelete ? (
              <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(row)}>
                Archive
              </Button>
            ) : null}
          </>
        )}
      />

      {dialog ? (
        <RecordDialog
          table={table}
          record={dialog.record ?? null}
          fixedFormId={configuration.form.id}
          organizationEntityId={entityId}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            toast.success(
              dialog.mode === "create"
                ? `Record #${saved?.id ?? ""} was added.`
                : `Record #${saved?.id ?? ""} was saved.`
            );
            reload();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive record"
        message={`Archive record #${archiveTarget?.id ?? ""}?`}
        detail="Archived records stay in the table but leave this list and the pickers."
        confirmLabel="Archive record"
        loading={archiving}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
      />
    </section>
  );
}

export default function EntityDetailPage() {
  const { entityId } = useParams();
  const { can } = usePermissions();
  const toast = useToast();

  const canManage = can(PERMISSIONS.ORGANIZATION_MANAGE);

  const [entityDialog, setEntityDialog] = useState(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const { data, loading, error, reload } = useAsyncData(`entity:${entityId}`, () =>
    organizationApi.getEntity(entityId)
  );

  const entity = data?.data ?? null;
  const configurations = useMemo(() => entity?.configurations ?? [], [entity]);

  /*
   * The entity payload only carries a summary of its type. Editing needs the
   * parent type to decide whether a parent is even selectable, so the full
   * record is loaded once and reused.
   */
  const { data: typeData } = useAsyncData(`entity-type:${entity?.entityType?.id ?? "none"}`, () =>
    entity ? organizationApi.getEntityType(entity.entityType.id) : Promise.resolve(null)
  );

  const entityType = typeData?.data ?? entity?.entityType ?? null;

  const profileConfiguration = configurations.find((entry) => entry.scope === "profile") ?? null;
  const sectionConfigurations = configurations.filter(
    (entry) => entry.scope === "section" && entry.isActive
  );

  const { run: runArchive, pending: archiving } = useMutation();

  async function confirmArchive() {
    const target = entity;

    const outcome = await runArchive(() => organizationApi.archiveEntity(target.id));

    setArchiveOpen(false);

    if (outcome.ok) {
      toast.success(`“${target.name}” was archived.`);
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, "The entity could not be archived."));
  }

  if (loading) return <LoadingState label="Loading entity…" />;

  if (error || !entity) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-danger">
          {errorMessage(error, "This entity could not be loaded.")}
        </p>

        <Button variant="secondary" size="sm" onClick={reload}>
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
            <span aria-hidden="true"> / </span>
            <Link
              to={`/organization/${entity.entityType.id}`}
              className="hover:text-brand hover:underline"
            >
              {entity.entityType.label}
            </Link>
          </p>

          <p className="mt-1 truncate text-sm font-semibold text-ink">{entity.name}</p>

          <p className="mt-1 text-sm text-ink-soft">
            {entity.parentEntity ? (
              <>
                Under <span className="font-medium text-ink">{entity.parentEntity.name}</span>
              </>
            ) : (
              "Top of the tree"
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={entity.status === "active" ? "success" : "neutral"}>{entity.status}</Badge>

          <Badge tone="neutral">
            {entity.childCount} {entity.childCount === 1 ? "child" : "children"}
          </Badge>

          {canManage && entity.status === "active" ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setEntityDialog({ mode: "edit" })}>
                Edit
              </Button>

              <Button size="sm" variant="danger" onClick={() => setArchiveOpen(true)}>
                Archive
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {profileConfiguration ? (
        <ProfilePanel
          entityType={entityType}
          configuration={profileConfiguration}
          entity={entity}
          canManage={canManage}
          onEdit={() => setEntityDialog({ mode: "edit" })}
        />
      ) : (
        <p className="text-sm text-ink-soft">
          This entity type has no profile configuration, so its details are not stored yet.
        </p>
      )}

      {sectionConfigurations.map((configuration) => (
        <SectionPanel
          key={configuration.id}
          configuration={configuration}
          entityId={entity.id}
          entityActive={entity.status === "active"}
        />
      ))}

      {entityDialog ? (
        <EntityDialog
          entityType={entityType}
          profileConfiguration={profileConfiguration}
          entity={entity}
          onClose={() => setEntityDialog(null)}
          onSaved={(saved) => {
            setEntityDialog(null);
            toast.success(`“${saved?.name ?? entity.name}” was saved.`);
            reload();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={archiveOpen}
        title="Archive entity"
        message={`Archive “${entity.name}”?`}
        detail="Entities with children or with a profile record are refused until those are handled first."
        confirmLabel="Archive entity"
        loading={archiving}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={confirmArchive}
      />
    </div>
  );
}
