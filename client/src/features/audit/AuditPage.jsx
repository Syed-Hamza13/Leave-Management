import { useMemo, useState } from "react";

import Button from "../../components/ui/Button.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import DateInput from "../../components/ui/DateInput.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";

import useAsyncData from "../../hooks/useAsyncData.js";
import { audit as auditApi } from "../../services/resources.js";

const PAGE_SIZE = 25;

const EMPTY_FILTERS = {
  action: "",
  entityType: "",
  entityId: "",
  actorUserId: "",
  from: "",
  to: "",
};

function formatMoment(value) {
  if (!value) return "—";

  return String(value).slice(0, 19).replace("T", " ");
}

function summarize(summary) {
  if (!summary || typeof summary !== "object") return "";

  return Object.entries(summary)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
    .join(" · ");
}

export default function AuditPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useAsyncData(
    `audit:${page}:${filters.action}:${filters.entityType}:${filters.entityId}:${filters.actorUserId}:${filters.from}:${filters.to}`,
    () =>
      auditApi.events({
        page,
        pageSize: PAGE_SIZE,
        action: filters.action || undefined,
        entityType: filters.entityType || undefined,
        entityId: filters.entityId || undefined,
        actorUserId: filters.actorUserId || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
      })
  );

  const rows = data?.data ?? [];
  const meta = data?.meta ?? null;

  const activeFilters = useMemo(
    () => Object.entries(filters).filter(([, value]) => value !== "").length,
    [filters]
  );

  const patch = (changes) => {
    setFilters((current) => ({ ...current, ...changes }));
    setPage(1);
  };

  const columns = useMemo(
    () => [
      {
        key: "createdAt",
        header: "When (UTC)",
        width: "10rem",
        render: (row) => (
          <span className="whitespace-nowrap text-ink-soft">{formatMoment(row.createdAt)}</span>
        ),
      },
      {
        key: "action",
        header: "Action",
        render: (row) => (
          <code className="font-mono text-xs text-ink">{row.action}</code>
        ),
      },
      {
        key: "entityType",
        header: "Object",
        render: (row) => (
          <span className="text-ink-soft">
            {row.entityType}
            {row.entityId ? ` #${row.entityId}` : ""}
          </span>
        ),
      },
      {
        key: "actorEmail",
        header: "Actor",
        render: (row) => (
          <span className="text-ink-soft">{row.actorEmail ?? "System"}</span>
        ),
      },
      {
        key: "summary",
        header: "Details",
        render: (row) => {
          const text = summarize(row.summary);

          if (!text) return <span className="text-xs text-ink-muted">—</span>;

          return (
            <details className="max-w-md">
              <summary className="cursor-pointer truncate text-xs text-ink-soft">
                {text}
              </summary>

              <pre className="mt-2 overflow-x-auto rounded-control bg-surface-sunken px-2 py-2 font-mono text-[11px] text-ink-soft">
                {JSON.stringify(row.summary, null, 2)}
              </pre>
            </details>
          );
        },
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-card border border-line bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TextInput
            id="audit-action"
            label="Action"
            hint="For example records.create"
            value={filters.action}
            onChange={(event) => patch({ action: event.target.value })}
            maxLength={80}
          />

          <TextInput
            id="audit-entity-type"
            label="Object type"
            hint="For example table_record"
            value={filters.entityType}
            onChange={(event) => patch({ entityType: event.target.value })}
            maxLength={60}
          />

          <TextInput
            id="audit-entity-id"
            label="Object id"
            value={filters.entityId}
            onChange={(event) => patch({ entityId: event.target.value })}
            maxLength={64}
          />

          <TextInput
            id="audit-actor"
            label="Actor user id"
            value={filters.actorUserId}
            onChange={(event) => patch({ actorUserId: event.target.value })}
            maxLength={12}
          />

          <DateInput
            id="audit-from"
            label="From date"
            value={filters.from}
            onChange={(event) => patch({ from: event.target.value })}
            max={filters.to || undefined}
          />

          <DateInput
            id="audit-to"
            label="To date"
            value={filters.to}
            onChange={(event) => patch({ to: event.target.value })}
            min={filters.from || undefined}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-ink-muted">
            {activeFilters === 0
              ? "Showing every recorded action, newest first."
              : `${activeFilters} filter${activeFilters === 1 ? "" : "s"} applied.`}
          </p>

          {activeFilters > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <LoadingState label="Loading the audit trail…" />
      ) : (
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
              title="No matching actions"
              description="Administrative actions are recorded here as they happen, with sensitive values removed."
            />
          }
        />
      )}
    </div>
  );
}
