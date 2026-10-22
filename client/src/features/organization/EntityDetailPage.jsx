import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ColumnVisibilityManager from "../../components/ui/ColumnVisibilityManager.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import useColumnPreferences from "../../hooks/useColumnPreferences.js";
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
import MemberDialog from "./MemberDialog.jsx";

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

  const availableColumns = useMemo(
    () => browsable.map((c, index) => ({ key: c.key, label: c.label, alwaysVisible: index === 0 })),
    [browsable]
  );

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
    storageKey: configuration?.id ? `columns:entity-section:${configuration.id}` : null,
    columns: availableColumns,
    defaultVisibleKeys,
  });

  const { optionsFor } = useEntryOptions(columns);

  const rows = data?.data ?? [];

  const columnDefinitionMap = useMemo(() => {
    const map = new Map();
    browsable.forEach((column) => {
      const type = getDataType(column.dataType);
      map.set(column.key, {
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
      });
    });
    return map;
  }, [browsable, getDataType, optionsFor]);

  const tableColumns = useMemo(() => {
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
          {errorMessage(tableError, `"${configuration.label}" could not be loaded.`)}
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

        <div className="flex items-center gap-2">
          {availableColumns.length > 0 ? (
            <ColumnVisibilityManager
              columns={orderedColumns}
              visibleKeys={visibleColumnKeys}
              onChangeVisibleKeys={setVisibleColumnKeys}
              onReorderColumns={reorderColumns}
              onReset={resetPreferences}
              storageKey={`columns:entity-section:${configuration.id}`}
              defaultVisibleKeys={defaultVisibleKeys}
            />
          ) : null}

          {canCreate ? (
            <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
              Add to {configuration.label.toLowerCase()}
            </Button>
          ) : null}
        </div>
      </div>

      <DataTable
        columns={tableColumns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        onReorderColumns={reorderColumns}
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

function MembersPanel({ entity, canManage, entityActive }) {
  const toast = useToast();
  const [memberDialog, setMemberDialog] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);

  const { data: membersData, loading, reload } = useAsyncData(
    `entity-members:${entity.id}`,
    () => organizationApi.listMembers(entity.id)
  );

  const members = membersData?.data ?? [];
  const { run: runRemove, pending: removing } = useMutation();

  async function confirmRemove() {
    const outcome = await runRemove(() =>
      organizationApi.removeMember(entity.id, removeTarget.userId)
    );

    setRemoveTarget(null);

    if (outcome.ok) {
      toast.success(`${removeTarget.fullName} was removed.`);
      reload();
      return;
    }

    toast.error(errorMessage(outcome.error, "Could not remove member."));
  }

  const existingUserIds = members.map((m) => m.userId);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">
            Members
            <span className="ml-2 rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink-muted">
              {members.length}
            </span>
          </h2>
          <p className="text-xs text-ink-soft">
            Users assigned to this {entity.name}.
          </p>
        </div>

        {canManage && entityActive ? (
          <Button size="sm" onClick={() => setMemberDialog({ mode: "add" })}>
            Add member
          </Button>
        ) : null}
      </div>

      {loading && !membersData ? (
        <LoadingState label="Loading members…" />
      ) : members.length === 0 ? (
        <EmptyState
          title="No members yet"
          description={`Add users to this ${entity.name} to establish organizational relationships and workflow assignments.`}
          action={
            canManage && entityActive ? (
              <Button size="sm" onClick={() => setMemberDialog({ mode: "add" })}>
                Add member
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <ul className="divide-y divide-line">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface-sunken/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-ink">
                      {member.fullName}
                    </p>

                    <Badge
                      tone={
                        member.role === "lead"
                          ? "brand"
                          : member.role === "manager"
                            ? "accent"
                            : "neutral"
                      }
                    >
                      {member.role === "lead"
                        ? "Lead"
                        : member.role === "manager"
                          ? "Manager"
                          : "Member"}
                    </Badge>

                    {member.userStatus !== "active" ? (
                      <Badge tone="warning">Deactivated</Badge>
                    ) : null}
                  </div>

                  <p className="truncate text-xs text-ink-muted">{member.email}</p>
                </div>

                {canManage && entityActive ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMemberDialog({ mode: "edit", member })}
                    >
                      Change role
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemoveTarget(member)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {memberDialog ? (
        <MemberDialog
          entity={entity}
          member={memberDialog.member ?? null}
          existingUserIds={existingUserIds}
          onClose={() => setMemberDialog(null)}
          onSaved={(saved) => {
            setMemberDialog(null);
            toast.success(
              memberDialog.mode === "add"
                ? `${saved?.fullName ?? "User"} was added as ${saved?.role ?? "member"}.`
                : `Role updated for ${saved?.fullName ?? "member"}.`
            );
            reload();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove member"
        message={`Remove "${removeTarget?.fullName}" from "${entity.name}"?`}
        detail="Removing a member does not delete their user account or records."
        confirmLabel="Remove member"
        loading={removing}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={confirmRemove}
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
   * full type record to populate the dialog.
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
      toast.success(`"${target.name}" was archived.`);
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
      <div className="rounded-card border border-line bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-ink-muted">
              <Link to="/organization" className="hover:text-brand hover:underline">
                Organization
              </Link>
              <span aria-hidden="true"> / </span>
              <Link to={`/organization/${entity.entityType.id}`} className="hover:text-brand hover:underline">
                {entity.entityType.label}
              </Link>
            </p>

            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-bold text-ink">{entity.name}</h2>
              <Badge tone={entity.status === "active" ? "success" : "neutral"}>{entity.status}</Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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

      <MembersPanel
        entity={entity}
        canManage={canManage}
        entityActive={entity.status === "active"}
      />

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
            toast.success(`"${saved?.name ?? entity.name}" was saved.`);
            reload();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={archiveOpen}
        title="Archive entity"
        message={`Archive "${entity.name}"?`}
        detail="Archived entities can be restored later. Their data is preserved."
        confirmLabel="Archive entity"
        loading={archiving}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={confirmArchive}
      />
    </div>
  );
}
