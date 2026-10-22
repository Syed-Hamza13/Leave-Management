import { useState } from "react";
import Button from "./Button.jsx";
import EmptyState from "./EmptyState.jsx";
import Pagination from "./Pagination.jsx";
import { Skeleton } from "./LoadingState.jsx";

const ALIGN = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

function nextSort(sort, key) {
  if (!sort || sort.key !== key) return { key, direction: "asc" };

  if (sort.direction === "asc") return { key, direction: "desc" };

  return null;
}

function SortIndicator({ direction }) {
  return (
    <span aria-hidden="true" className="ml-1 inline-block w-2 text-[10px] leading-none">
      {direction === "asc" ? "▲" : direction === "desc" ? "▼" : "◇"}
    </span>
  );
}

/*
 * One table contract for every list screen: loading, error-with-retry, empty
 * and populated states are decided here so pages only describe their columns.
 */
export default function DataTable({
  columns,
  rows = [],
  rowKey = "id",
  loading = false,
  error = null,
  onRetry,
  empty,
  sort = null,
  onSortChange,
  onReorderColumns = null,
  actions,
  pagination = null,
  onPageChange,
  className = "",
}) {
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);

  const visible = columns.filter((column) => column.hidden !== true);
  const span = visible.length + (actions ? 1 : 0);
  const keyOf =
    typeof rowKey === "function" ? rowKey : (row) => row?.[rowKey];

  const emptyState =
    empty === undefined ? (
      <EmptyState title="Nothing to show yet" description="No rows matched this view." />
    ) : (
      empty
    );

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Data table</caption>

          <thead>
            <tr className="border-b border-line bg-surface-sunken">
              {visible.map((column) => {
                const isSorted = sort?.key === column.key;
                const align = ALIGN[column.align] ?? ALIGN.left;
                const canReorder = Boolean(onReorderColumns && !column.alwaysVisible && !column.isFixed);
                const isDragging = draggedColKey === column.key;
                const isOver = dragOverColKey === column.key && draggedColKey !== column.key;

                return (
                  <th
                    key={column.key}
                    scope="col"
                    draggable={canReorder}
                    onDragStart={
                      canReorder
                        ? (e) => {
                            setDraggedColKey(column.key);
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", column.key);
                          }
                        : undefined
                    }
                    onDragOver={
                      canReorder
                        ? (e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            if (dragOverColKey !== column.key) {
                              setDragOverColKey(column.key);
                            }
                          }
                        : undefined
                    }
                    onDrop={
                      canReorder
                        ? (e) => {
                            e.preventDefault();
                            if (draggedColKey && draggedColKey !== column.key) {
                              onReorderColumns(draggedColKey, column.key);
                            }
                            setDraggedColKey(null);
                            setDragOverColKey(null);
                          }
                        : undefined
                    }
                    onDragEnd={
                      canReorder
                        ? () => {
                            setDraggedColKey(null);
                            setDragOverColKey(null);
                          }
                        : undefined
                    }
                    aria-sort={
                      isSorted
                        ? sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    style={column.width ? { width: column.width } : undefined}
                    className={`whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-soft transition-colors ${align} ${
                      isDragging ? "opacity-30 bg-surface-sunken" : ""
                    } ${
                      isOver ? "border-l-2 border-brand bg-brand/5" : ""
                    } ${canReorder ? "cursor-grab active:cursor-grabbing hover:bg-surface-sunken/80" : ""}`}
                    title={canReorder ? "Drag column header to reorder" : undefined}
                  >
                    <div className="inline-flex items-center gap-1.5">
                      {canReorder ? (
                        <span
                          className="opacity-0 group-hover:opacity-60 text-ink-muted hover:opacity-100"
                          aria-hidden="true"
                        >
                          ⋮
                        </span>
                      ) : null}

                      {column.sortable && onSortChange ? (
                        <button
                          type="button"
                          onClick={() => onSortChange(nextSort(sort, column.key))}
                          className="inline-flex items-center rounded hover:text-ink"
                        >
                          {column.header}
                          <SortIndicator
                            direction={isSorted ? sort.direction : null}
                          />
                          <span className="sr-only">
                            {isSorted
                              ? sort.direction === "asc"
                                ? ", sorted ascending, activate to sort descending"
                                : ", sorted descending, activate to clear sorting"
                              : ", activate to sort ascending"}
                          </span>
                        </button>
                      ) : (
                        column.header
                      )}
                    </div>
                  </th>
                );
              })}

              {actions ? (
                <th
                  scope="col"
                  className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-ink-soft"
                >
                  <span className="sr-only">Row actions</span>
                </th>
              ) : null}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, rowIndex) => (
                <tr key={`skeleton-${rowIndex}`} className="border-b border-line last:border-0">
                  {Array.from({ length: span }).map((__, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-3">
                      <Skeleton className="h-4 w-full max-w-40" />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={span} className="px-4 py-10 text-center">
                  <p className="text-sm font-medium text-danger">
                    {error.message || "This table could not be loaded."}
                  </p>

                  {onRetry ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-3"
                      onClick={onRetry}
                    >
                      Try again
                    </Button>
                  ) : null}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={span} className="p-0">
                  {emptyState}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={keyOf(row)}
                  className="border-b border-line transition-colors last:border-0 hover:bg-surface-sunken"
                >
                  {visible.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3 align-middle text-ink ${
                        ALIGN[column.align] ?? ALIGN.left
                      } ${column.className ?? ""}`}
                    >
                      {column.render ? column.render(row) : row?.[column.key]}
                    </td>
                  ))}

                  {actions ? (
                    <td className="px-4 py-3 text-right align-middle">
                      <div className="flex items-center justify-end gap-1.5">
                        {actions(row)}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && !loading && !error ? (
        <Pagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          totalPages={pagination.totalPages}
          onChange={onPageChange}
          disabled={loading}
        />
      ) : null}
    </div>
  );
}
