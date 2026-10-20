import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import SearchInput from "../../components/ui/SearchInput.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import { errorMessage } from "../../services/errors.js";
import {
  organization as organizationApi,
  records as recordsApi,
  tables as tablesApi,
} from "../../services/resources.js";

import { useMetadata } from "../metadata/MetadataContext.js";
import { usePermissions } from "../permissions/PermissionsContext.js";
import RecordDialog from "../records/RecordDialog.jsx";
import { formatRecordValue } from "../records/recordValues.js";
import useEntryOptions from "../records/useEntryOptions.js";

const PAGE_SIZE = 25;

function ConfiguredSection({ configuration, showTitle = false }) {
  const { can } = usePermissions();
  const { getDataType } = useMetadata();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [recordDialog, setRecordDialog] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);

  const tableId = configuration.table.id;
  const formId = configuration.form.id;

  const canCreate = can(PERMISSIONS.RECORDS_CREATE);
  const canUpdate = can(PERMISSIONS.RECORDS_UPDATE);
  const canDelete = can(PERMISSIONS.RECORDS_DELETE);

  const {
    data: tableData,
    loading: tableLoading,
    error: tableError,
    reload: reloadTable,
  } = useAsyncData(`entity-table:${tableId}`, () => tablesApi.get(tableId));

  const table = tableData?.data ?? null;
  const columns = useMemo(() => table?.columns ?? [], [table]);
  const browsable = useMemo(
    () => columns.filter((column) => !column.isSystem && column.isVisible),
    [columns]
  );

  const { optionsFor } = useEntryOptions(columns);

  const requestKey = `entity-records:${tableId}:${page}:${search}`;

  const { data, loading, error, reload } = useAsyncData(requestKey, () =>
    recordsApi.list(tableId, {
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      status: "active",
      sort: { key: "createdAt", direction: "desc" },
    })
  );

  const { run: runArchive, pending: archiving } = useMutation();

  const rows = data?.records ?? data?.data ?? [];
  const meta = data?.meta ?? data?.pagination ?? null;

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
      <div className="space-y-2 rounded-card border border-line bg-surface p-4">
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
    <div className="space-y-3">
      {showTitle ? (
        <h2 className="text-sm font-semibold text-ink">{configuration.label}</h2>
      ) : null}

      {/* Modern Compact Toolbar right above DataTable */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <SearchInput
            className="w-full sm:max-w-xs"
            value={search}
            onChange={(next) => {
              setSearch(next);
              setPage(1);
            }}
            label="Search records"
            placeholder="Search records…"
          />

          <span className="hidden items-center gap-1.5 text-xs text-ink-muted lg:inline-flex">
            <span>Table: <strong className="font-medium text-ink-soft">{table.label}</strong></span>
            <span className="text-ink-muted/50">·</span>
            <span>Form: <strong className="font-medium text-ink-soft">{configuration.form.label}</strong></span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {canCreate ? (
            <Button size="sm" onClick={() => setRecordDialog({ mode: "create" })}>
              + Add {configuration.form.label}
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
        pagination={meta}
        onPageChange={setPage}
        empty={
          <EmptyState
            title={search ? "No records match your search" : `No records yet`}
            description={
              search
                ? "Try a different search keyword, or clear the search."
                : `Click "+ Add ${configuration.form.label}" above to add your first record.`
            }
            action={
              !search && canCreate ? (
                <Button size="sm" onClick={() => setRecordDialog({ mode: "create" })}>
                  + Add {configuration.form.label}
                </Button>
              ) : null
            }
          />
        }
        actions={(row) => (
          <>
            {canUpdate ? (
              <Button variant="ghost" size="sm" onClick={() => setRecordDialog({ mode: "edit", record: row })}>
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

      {recordDialog ? (
        <RecordDialog
          table={table}
          record={recordDialog.record ?? null}
          fixedFormId={formId}
          onClose={() => setRecordDialog(null)}
          onSaved={(saved) => {
            setRecordDialog(null);
            toast.success(
              recordDialog.mode === "create"
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
        detail="Archived records stay in the database but are removed from this active list."
        confirmLabel="Archive record"
        loading={archiving}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
      />
    </div>
  );
}

export default function EntityTypePage() {
  const { entityTypeId } = useParams();
  const { can } = usePermissions();

  const canManage = can(PERMISSIONS.ORGANIZATION_MANAGE);

  const {
    data: typeData,
    loading: typeLoading,
    error: typeError,
    reload: reloadType,
  } = useAsyncData(`entity-type:${entityTypeId}`, () =>
    organizationApi.getEntityType(entityTypeId)
  );

  const entityType = typeData?.data ?? null;

  useEffect(() => {
    if (entityType?.label) {
      document.title = `${entityType.label} · Leave Management`;
    }
  }, [entityType?.label]);

  const configurations = useMemo(
    () => (entityType?.configurations ?? []).filter((cfg) => cfg.isActive),
    [entityType]
  );

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
    <div className="space-y-5">
      {/* Unified Single Header - replaces repetitive multi-level headers */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1.5 text-xs text-ink-muted">
            <Link to="/organization" className="hover:text-brand hover:underline">
              Organization
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-ink-soft">{entityType.label}</span>
          </nav>

          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {entityType.label}
            </h1>

            <Badge tone={entityType.status === "active" ? "success" : "neutral"}>
              {entityType.status}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canManage ? (
            <Link to={`/organization/${entityType.id}/configure`}>
              <Button variant="secondary" size="sm">
                Configure mappings
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      {configurations.length === 0 ? (
        <EmptyState
          title="No forms or tables configured yet"
          description={`Configure a form and table mapping for ${entityType.label} so you can start adding records.`}
          action={
            canManage ? (
              <Link to={`/organization/${entityType.id}/configure`}>
                <Button>Configure now</Button>
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="space-y-8">
          {configurations.map((configuration) => (
            <ConfiguredSection
              key={configuration.id}
              configuration={configuration}
              showTitle={configurations.length > 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
