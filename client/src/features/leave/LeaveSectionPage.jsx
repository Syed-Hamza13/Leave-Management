import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

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
import {
  records as recordsApi,
  sections as sectionsApi,
  tables as tablesApi,
} from "../../services/resources.js";

import { useMetadata } from "../metadata/MetadataContext.js";
import { usePermissions } from "../permissions/PermissionsContext.js";
import RecordDialog from "../records/RecordDialog.jsx";
import { formatRecordValue } from "../records/recordValues.js";
import useEntryOptions from "../records/useEntryOptions.js";

import SectionConfigDialog from "./SectionConfigDialog.jsx";

const PAGE_SIZE = 25;

export default function LeaveSectionPage({
  sectionKey,
  title,
  description,
  singularLabel,
}) {
  const { can } = usePermissions();
  const { getDataType } = useMetadata();
  const toast = useToast();

  const canManage =
    can(PERMISSIONS.FORMS_MANAGE) ||
    can(PERMISSIONS.TABLES_MANAGE) ||
    can(PERMISSIONS.SETTINGS_MANAGE) ||
    can(PERMISSIONS.ORGANIZATION_MANAGE);

  const canCreate = can(PERMISSIONS.RECORDS_CREATE);
  const canUpdate = can(PERMISSIONS.RECORDS_UPDATE);
  const canDelete = can(PERMISSIONS.RECORDS_DELETE);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "createdAt", direction: "desc" });

  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configDeleteOpen, setConfigDeleteOpen] = useState(false);
  const [recordDialog, setRecordDialog] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);

  const {
    data: configData,
    loading: configLoading,
    error: configError,
    reload: reloadConfig,
  } = useAsyncData(`section-config:${sectionKey}`, () =>
    sectionsApi.getConfiguration(sectionKey)
  );

  const configuration = configData?.data ?? null;
  const tableId = configuration?.table?.id ?? null;

  const {
    data: tableData,
    loading: tableLoading,
    reload: reloadTable,
  } = useAsyncData(
    `section-table:${tableId ?? "none"}`,
    () => (tableId ? tablesApi.get(tableId) : Promise.resolve(null))
  );

  const configuredTable = tableData?.data ?? null;
  const tableColumns = useMemo(
    () => (configuredTable?.columns ?? []).filter((c) => !c.isSystem && c.isVisible),
    [configuredTable]
  );

  const { optionsFor } = useEntryOptions(tableColumns);

  const requestKey = `section-records:${sectionKey}:${tableId ?? "none"}:${page}:${search}:${status}:${sort?.key ?? ""}:${sort?.direction ?? ""}`;

  const {
    data: recordsData,
    loading: recordsLoading,
    error: recordsError,
    reload: reloadRecords,
  } = useAsyncData(
    requestKey,
    () =>
      tableId
        ? recordsApi.list(tableId, {
            page,
            pageSize: PAGE_SIZE,
            search,
            status,
            sort,
          })
        : Promise.resolve({ data: [], meta: null })
  );

  const rows = recordsData?.data ?? [];
  const meta = recordsData?.meta ?? null;

  const { run: runArchive, pending: archiving } = useMutation();
  const { run: runDeleteConfig, pending: deletingConfig } = useMutation();

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
      { key: "label", label: title, alwaysVisible: true },
      { key: "status", label: "Status" },
    ];
  }, [tableColumns, title]);

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
      ? `columns:section-records:${sectionKey}:${tableId}`
      : `columns:section-records:${sectionKey}`,
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
            const raw = row.values?.[column.key];
            const formatted =
              raw !== undefined && raw !== null && String(raw).trim() !== ""
                ? formatRecordValue(column, raw, optionsFor(column))
                : null;

            return (
              <span className={isPrimary ? "font-medium text-ink" : "text-ink-soft"}>
                {formatted ?? <span className="text-ink-muted">—</span>}
              </span>
            );
          },
        });
      });
    }

    map.set("status", {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge tone={row.status === "active" ? "success" : "neutral"} size="sm">
          {row.status}
        </Badge>
      ),
    });

    return map;
  }, [tableColumns, getDataType, optionsFor]);

  const displayedColumns = useMemo(() => {
    return orderedColumns
      .filter((col) => visibleColumnKeys.includes(col.key))
      .map((col) => columnDefinitionMap.get(col.key))
      .filter(Boolean);
  }, [orderedColumns, visibleColumnKeys, columnDefinitionMap]);

  async function handleArchiveRecord() {
    if (!archiveTarget || !tableId) return;

    const outcome = await runArchive(() =>
      recordsApi.archive(tableId, archiveTarget.id)
    );

    if (outcome.ok) {
      toast.success("Record archived.");
      setArchiveTarget(null);
      reloadRecords();
      return;
    }

    toast.error(errorMessage(outcome.error, "The record could not be archived."));
  }

  async function handleRemoveConfiguration() {
    const outcome = await runDeleteConfig(() =>
      sectionsApi.deleteConfiguration(sectionKey)
    );

    if (outcome.ok) {
      toast.success("Configuration removed.");
      setConfigDeleteOpen(false);
      reloadConfig();
      reloadTable();
      return;
    }

    toast.error(
      errorMessage(outcome.error, "The configuration could not be removed.")
    );
  }

  if (configLoading) {
    return <LoadingState label="Loading section…" />;
  }

  if (configError) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-danger">
          {errorMessage(configError, "This section could not be loaded.")}
        </p>

        <Button variant="secondary" size="sm" onClick={reloadConfig}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Unified Header matching Organization EntityTypePage */}
      <header className="-mx-4 -mt-6 mb-6 border-b border-line bg-surface px-4 py-4 md:-mx-6 md:px-6 md:py-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                <li>
                  <span className="font-medium text-ink-muted">Leave Management</span>
                </li>
                <li aria-hidden="true" className="text-ink-muted">/</li>
                <li>
                  <span aria-current="page" className="font-semibold text-ink-soft">
                    {title}
                  </span>
                </li>
              </ol>
            </nav>

            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>

              {configuration ? (
                <>
                  <Badge tone={configuration.isActive ? "success" : "neutral"}>
                    {configuration.isActive ? "Active" : "Inactive"}
                  </Badge>

                  <Badge tone="neutral">
                    {meta?.total ?? rows.length} {((meta?.total ?? rows.length) === 1) ? "entry" : "entries"}
                  </Badge>
                </>
              ) : (
                <Badge tone="neutral">Not configured</Badge>
              )}
            </div>

            {description ? (
              <p className="max-w-2xl text-sm text-ink-soft">{description}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {canManage ? (
              !configuration ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfigDialogOpen(true)}
                >
                  New configuration
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfigDialogOpen(true)}
                >
                  Edit configuration
                </Button>
              )
            ) : null}

            {configuration && configuredTable && canCreate ? (
              <Button
                size="sm"
                onClick={() => setRecordDialog({ mode: "create" })}
              >
                New {singularLabel.toLowerCase()}
              </Button>
            ) : null}
          </div>
        </div>

        {/* Integrated Configuration Strip */}
        {configuration ? (
          <div className="mt-4 border-t border-line/60 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink-muted uppercase tracking-wider text-[11px]">
                Configuration
              </span>

              <div className="flex flex-wrap items-center gap-2 text-ink-soft">
                <span className="font-semibold text-ink">{configuration.label}</span>
                <span className="inline-flex items-center gap-1 rounded border border-line/60 bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink-soft">
                  <span className="text-ink-muted">Form:</span> {configuration.form?.label || "—"}
                </span>
                <span className="text-ink-muted">→</span>
                <span className="inline-flex items-center gap-1 rounded border border-line/60 bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink-soft">
                  <span className="text-ink-muted">Table:</span> {configuration.table?.label || "—"}
                </span>
                {!configuration.isActive ? (
                  <Badge tone="warning" size="sm">Inactive</Badge>
                ) : null}
              </div>
            </div>

            {canManage ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfigDialogOpen(true)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfigDeleteOpen(true)}
                >
                  Remove
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          canManage && (
            <div className="mt-4 border-t border-line/60 pt-3 flex items-center justify-between gap-2 text-xs text-ink-muted">
              <span>No form and table linked yet. Click &ldquo;New configuration&rdquo; to link a form and table to this section.</span>
            </div>
          )
        )}
      </header>

      {/* Main Content */}
      {!configuration ? (
        <EmptyState
          title={`No configuration for ${title}`}
          description="Link a form and table to start entering and managing records in this section."
          action={
            canManage ? (
              <Button onClick={() => setConfigDialogOpen(true)}>
                New configuration
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
                label={`Search ${title.toLowerCase()}`}
                placeholder="Search records…"
              />

              <Select
                id={`section-status-${sectionKey}`}
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
                storageKey={`columns:section-records:${sectionKey}:${tableId}`}
                defaultVisibleKeys={defaultVisibleKeys}
              />
            </div>
          </div>

          <DataTable
            columns={displayedColumns}
            rows={rows}
            loading={recordsLoading || tableLoading}
            error={recordsError}
            onRetry={reloadRecords}
            onReorderColumns={reorderColumns}
            sort={sort}
            onSortChange={(next) => {
              setSort(next);
              setPage(1);
            }}
            pagination={meta}
            onPageChange={setPage}
            empty={
              <EmptyState
                title={
                  search
                    ? `No matching ${title.toLowerCase()}`
                    : `No ${title.toLowerCase()} records yet`
                }
                description={
                  search
                    ? "Try clearing the search query to see all records."
                    : `Submit a new ${singularLabel.toLowerCase()} through the configured form.`
                }
                action={
                  canCreate && !search ? (
                    <Button onClick={() => setRecordDialog({ mode: "create" })}>
                      New {singularLabel.toLowerCase()}
                    </Button>
                  ) : null
                }
              />
            }
            actions={(row) => (
              <>
                {canUpdate && row.status === "active" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRecordDialog({ mode: "edit", record: row })}
                  >
                    Edit
                  </Button>
                ) : null}

                {canDelete && row.status === "active" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setArchiveTarget(row)}
                  >
                    Archive
                  </Button>
                ) : null}

                {row.status === "active" || canUpdate || canDelete ? null : (
                  <span className="text-xs text-ink-muted">Read only</span>
                )}
              </>
            )}
          />
        </section>
      )}

      {/* Configuration Dialog */}
      {configDialogOpen ? (
        <SectionConfigDialog
          sectionKey={sectionKey}
          title={title}
          configuration={configuration}
          onClose={() => setConfigDialogOpen(false)}
          onSaved={() => {
            setConfigDialogOpen(false);
            toast.success("Configuration saved.");
            reloadConfig();
            reloadTable();
            reloadRecords();
          }}
        />
      ) : null}

      {/* Record Creation / Edit Dialog */}
      {recordDialog && configuredTable ? (
        <RecordDialog
          table={configuredTable}
          record={recordDialog.record ?? null}
          fixedFormId={configuration.form.id}
          onClose={() => setRecordDialog(null)}
          onSaved={(saved) => {
            setRecordDialog(null);
            toast.success(
              recordDialog.mode === "create"
                ? `Record #${saved?.id ?? ""} was created.`
                : `Record #${saved?.id ?? ""} was updated.`
            );
            reloadRecords();
          }}
        />
      ) : null}

      {/* Archive Record Confirm Dialog */}
      {archiveTarget ? (
        <ConfirmDialog
          open
          tone="danger"
          title={`Archive record #${archiveTarget.id}?`}
          confirmLabel="Archive"
          busy={archiving}
          onClose={() => setArchiveTarget(null)}
          onConfirm={handleArchiveRecord}
        >
          <p className="text-sm text-ink-soft">
            Archived records are kept in storage and can be reviewed under the
            &ldquo;Archived&rdquo; filter.
          </p>
        </ConfirmDialog>
      ) : null}

      {/* Remove Configuration Confirm Dialog */}
      {configDeleteOpen ? (
        <ConfirmDialog
          open
          tone="danger"
          title={`Remove configuration for ${title}?`}
          confirmLabel="Remove configuration"
          busy={deletingConfig}
          onClose={() => setConfigDeleteOpen(false)}
          onConfirm={handleRemoveConfiguration}
        >
          <p className="text-sm text-ink-soft">
            This unlinks the form and table from this section. Existing records
            in the table will not be deleted.
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
