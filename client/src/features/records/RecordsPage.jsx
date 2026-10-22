import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ColumnFilter from "../../components/ui/ColumnFilter.jsx";
import ColumnVisibilityManager from "../../components/ui/ColumnVisibilityManager.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import Modal from "../../components/ui/Modal.jsx";
import SearchInput from "../../components/ui/SearchInput.jsx";
import Select from "../../components/ui/Select.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import { errorMessage } from "../../services/errors.js";
import { records as recordsApi, tables as tablesApi } from "../../services/resources.js";

import { useMetadata } from "../metadata/MetadataContext.js";
import { usePermissions } from "../permissions/PermissionsContext.js";

import RecordDialog from "./RecordDialog.jsx";
import { formatRecordValue } from "./recordValues.js";
import useEntryOptions from "./useEntryOptions.js";

const PAGE_SIZE = 25;

/*
 * The facets endpoint only answers for these storages, so a picker is offered
 * where the server can actually supply distinct values.
 */
const FACET_STORAGES = new Set(["string", "number", "date"]);

function toFilterText(filter, operators) {
  const meta = operators.find((entry) => entry.key === filter.operator);

  const valueText =
    meta?.arity === 0
      ? ""
      : Array.isArray(filter.value)
        ? filter.value.join(", ")
        : String(filter.value ?? "");

  return [meta?.label ?? filter.operator, valueText].filter(Boolean).join(" ");
}

export default function RecordsPage() {
  const { tableId } = useParams();
  const { can } = usePermissions();
  const { getDataType } = useMetadata();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [sort, setSort] = useState({ key: "createdAt", direction: "desc" });
  const [filters, setFilters] = useState([]);
  const [page, setPage] = useState(1);

  const [dialog, setDialog] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [pickedColumn, setPickedColumn] = useState(null);

  const canCreate = can(PERMISSIONS.RECORDS_CREATE);
  const canUpdate = can(PERMISSIONS.RECORDS_UPDATE);
  const canDelete = can(PERMISSIONS.RECORDS_DELETE);

  const {
    data: tableData,
    loading: tableLoading,
    error: tableError,
    reload: reloadTable,
  } = useAsyncData(`records-table:${tableId}`, () => tablesApi.get(tableId));

  const table = tableData?.data ?? null;
  const columns = useMemo(() => table?.columns ?? [], [table]);

  const browsable = useMemo(
    () => columns.filter((column) => !column.isSystem && column.isVisible),
    [columns]
  );

  const { optionsFor } = useEntryOptions(columns);

  const requestKey = `records:${tableId}:${page}:${search}:${status}:${sort?.key ?? ""}:${sort?.direction ?? ""}:${JSON.stringify(filters)}`;

  const { data, loading, error, reload } = useAsyncData(requestKey, () =>
    recordsApi.list(tableId, {
      page,
      pageSize: PAGE_SIZE,
      search,
      status,
      sort,
      filters: filters.length > 0 ? filters : undefined,
    })
  );

  const { run: runArchive, pending: archiving } = useMutation();

  const rows = data?.data ?? [];
  const meta = data?.meta ?? null;

  function descriptorFor(column) {
    const type = getDataType(column.dataType);

    return {
      key: column.key,
      label: column.label,
      storage: type?.storage ?? "string",
      config: column.config ?? {},
      filterOperators: type?.filterOperators ?? [],
    };
  }

  const facetColumns = useMemo(
    () =>
      columns.filter((column) => {
        if (column.isSystem || !column.isFilterable) return false;

        return FACET_STORAGES.has(getDataType(column.dataType)?.storage);
      }),
    [columns, getDataType]
  );

  function facetLoader(column) {
    return ({ search: facetSearch, page: facetPage, pageSize }) =>
      recordsApi
        .facets(tableId, { column: column.key, search: facetSearch, page: facetPage, pageSize })
        .then((response) => ({
          items: (response?.data ?? []).map((value) => ({ value, label: String(value) })),
          total: response?.meta?.total ?? 0,
        }));
  }

  function applyFilter(filter) {
    if (filter) {
      setFilters((current) => [
        ...current.filter((entry) => entry.column !== filter.column),
        filter,
      ]);
    } else {
      setFilters([]);
    }

    setPage(1);
    setFilterOpen(false);
  }

  function removeFilter(columnKey) {
    setFilters((current) => current.filter((entry) => entry.column !== columnKey));
    setPage(1);
  }

  const availableColumns = useMemo(
    () => [
      ...browsable.map((c, index) => ({ key: c.key, label: c.label, alwaysVisible: index === 0 })),
      { key: "status", label: "Status" },
      { key: "createdAt", label: "Created" },
    ],
    [browsable]
  );

  const defaultVisibleKeys = useMemo(
    () => availableColumns.map((c) => c.key),
    [availableColumns]
  );

  const [visibleColumnKeys, setVisibleColumnKeys] = useState(() => defaultVisibleKeys);

  useEffect(() => {
    setVisibleColumnKeys((prev) => {
      const allKeySet = new Set(availableColumns.map((c) => c.key));
      const valid = prev.filter((k) => allKeySet.has(k));
      return valid.length > 0 ? valid : availableColumns.map((c) => c.key);
    });
  }, [availableColumns]);

  const tableColumns = useMemo(
    () => [
      ...browsable.map((column) => {
        const type = getDataType(column.dataType);

        return {
          key: column.key,
          header: column.label,
          sortable: true,
          hidden: !visibleColumnKeys.includes(column.key),
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
      {
        key: "status",
        header: "Status",
        sortable: true,
        hidden: !visibleColumnKeys.includes("status"),
        render: (row) => (
          <Badge tone={row.status === "active" ? "success" : "neutral"}>{row.status}</Badge>
        ),
      },
      {
        key: "createdAt",
        header: "Created",
        sortable: true,
        hidden: !visibleColumnKeys.includes("createdAt"),
        render: (row) => (
          <span className="whitespace-nowrap text-xs text-ink-muted">
            {row.createdAt ? String(row.createdAt).slice(0, 10) : "—"}
          </span>
        ),
      },
    ],
    [browsable, getDataType, optionsFor, visibleColumnKeys]
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

  if (tableLoading) {
    return <DataTable columns={[]} rows={[]} loading />;
  }

  if (tableError || !table) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-danger">
          {errorMessage(tableError, "This table could not be loaded.")}
        </p>

        <Button variant="secondary" size="sm" onClick={reloadTable}>
          Try again
        </Button>
      </div>
    );
  }

  const activeColumn =
    (pickedColumn && columns.find((column) => column.key === pickedColumn)) || facetColumns[0] || null;

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-ink">{table.label}</p>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-end gap-3">
          <SearchInput
            className="w-full sm:max-w-xs"
            value={search}
            onChange={(next) => {
              setSearch(next);
              setPage(1);
            }}
            label="Search records"
            placeholder="Search text values…"
          />

          <Select
            id="records-status"
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

          {facetColumns.length > 0 ? (
            <Button
              variant="secondary"
              onClick={() => {
                setPickedColumn(filters[0]?.column ?? facetColumns[0]?.key ?? null);
                setFilterOpen(true);
              }}
            >
              Filter
              {filters.length > 0 ? ` (${filters.length})` : ""}
            </Button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <ColumnVisibilityManager
            columns={availableColumns}
            visibleKeys={visibleColumnKeys}
            onChangeVisibleKeys={setVisibleColumnKeys}
            storageKey={`columns:records-table:${tableId}`}
            defaultVisibleKeys={defaultVisibleKeys}
          />

          <Link to="/records">
            <Button variant="ghost">All tables</Button>
          </Link>

          {canCreate && table.status === "active" ? (
            <Button onClick={() => setDialog({ mode: "create" })}>New record</Button>
          ) : null}
        </div>
      </div>

      {filters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Filters
          </span>

          {filters.map((filter) => {
            const column = columns.find((entry) => entry.key === filter.column);
            const operators = getDataType(column?.dataType)?.filterOperators ?? [];

            return (
              <button
                key={`${filter.column}-${filter.operator}`}
                type="button"
                onClick={() => removeFilter(filter.column)}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand hover:underline"
              >
                {column?.label ?? filter.column}: {toFilterText(filter, operators)}

                <span aria-hidden="true">✕</span>
                <span className="sr-only">Remove filter on {column?.label ?? filter.column}</span>
              </button>
            );
          })}

          <Button
            variant="quiet"
            size="sm"
            onClick={() => {
              setFilters([]);
              setPage(1);
            }}
          >
            Clear all
          </Button>
        </div>
      ) : null}

      <DataTable
        columns={tableColumns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
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
              filters.length > 0 || search
                ? "No records match"
                : `No ${table.label.toLowerCase()} records yet`
            }
            description={
              filters.length > 0 || search
                ? "Clear the search or the filters to see the rest."
                : "Records are created by submitting a form that is mapped to this table."
            }
            action={
              canCreate && table.status === "active" && !search && filters.length === 0 ? (
                <Button onClick={() => setDialog({ mode: "create" })}>New record</Button>
              ) : null
            }
          />
        }
        actions={(row) => (
          <>
            {canUpdate && row.status === "active" ? (
              <Button variant="ghost" size="sm" onClick={() => setDialog({ mode: "edit", record: row })}>
                Edit
              </Button>
            ) : null}

            {canDelete && row.status === "active" ? (
              <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(row)}>
                Archive
              </Button>
            ) : null}

            {row.status === "active" || canUpdate || canDelete ? null : (
              <span className="text-xs text-ink-muted">Read only</span>
            )}
          </>
        )}
      />

      {dialog ? (
        <RecordDialog
          table={table}
          record={dialog.record ?? null}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            toast.success(
              dialog.mode === "create"
                ? `Record #${saved?.id ?? ""} was created.`
                : `Record #${saved?.id ?? ""} was saved.`
            );
            reload();
          }}
        />
      ) : null}

      {filterOpen ? (
        <Modal
          open
          onClose={() => setFilterOpen(false)}
          title={`Filter ${table.label}`}
          description="Values are looked up from the records already stored, a page at a time."
          size="md"
        >
          <Select
            id="record-filter-column"
            label="Column"
            data-autofocus
            value={activeColumn?.key ?? ""}
            onChange={(event) => setPickedColumn(event.target.value)}
            options={facetColumns.map((column) => ({
              value: column.key,
              label: column.label,
            }))}
          />

          {activeColumn ? (
            <div className="mt-4">
              <ColumnFilter
                key={activeColumn.key}
                column={descriptorFor(activeColumn)}
                value={filters.find((entry) => entry.column === activeColumn.key) ?? null}
                loadOptions={facetLoader(activeColumn)}
                onApply={applyFilter}
              />
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink-soft">
              This table has no columns that can be filtered this way.
            </p>
          )}
        </Modal>
      ) : null}

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive record"
        message={`Archive record #${archiveTarget?.id ?? ""}?`}
        detail="Archived records stay in the table and can still be listed, but they stop appearing in pickers and no longer accept edits."
        confirmLabel="Archive record"
        loading={archiving}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
      />
    </div>
  );
}
