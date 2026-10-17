import { Link } from "react-router-dom";

import Badge from "../../components/ui/Badge.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";

import { useMetadata } from "../metadata/MetadataContext.js";

/*
 * Only administrator-defined tables hold browser-editable records: a system
 * table's rows belong to the service that owns authentication, so they are not
 * offered here.
 */
export default function RecordsIndexPage() {
  const { lookups, loading, error } = useMetadata();

  const tables = (lookups.tables ?? []).filter((table) => table.storageKind === "managed");

  if (loading) return <LoadingState label="Loading tables…" />;

  if (error) {
    return (
      <p className="text-sm font-medium text-danger">
        The table list could not be loaded. Reload the page to try again.
      </p>
    );
  }

  if (tables.length === 0) {
    return (
      <EmptyState
        title="No tables to browse"
        description="Define a logical table, compose a form and map it to that table, and the records will appear here."
      />
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tables.map((table) => (
        <li key={table.id}>
          <Link
            to={`/records/${table.id}`}
            className="block h-full rounded-card border border-line bg-surface px-4 py-3 transition-colors hover:border-brand/40 hover:bg-surface-sunken"
          >
            <p className="truncate text-sm font-semibold text-ink">{table.label}</p>

            <code className="font-mono text-xs text-ink-muted">{table.key}</code>

            <p className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
              <Badge tone="neutral">
                {table.columnCount} {table.columnCount === 1 ? "column" : "columns"}
              </Badge>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
