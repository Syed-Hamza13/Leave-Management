import { useEffect, useRef, useState } from "react";
import Button from "./Button.jsx";

/**
 * Reusable column visibility manager component.
 * Allows users to toggle which columns are visible in a DataTable
 * and drag-and-drop to customize column order/placement.
 *
 * @param {Array<{ key: string, label?: string, header?: string, alwaysVisible?: boolean }>} columns
 * @param {Array<string>} visibleKeys - Array of currently visible column keys
 * @param {(nextKeys: Array<string>) => void} onChangeVisibleKeys - Callback when visibility changes
 * @param {(fromIndex: number, toIndex: number) => void} [onReorderColumns] - Optional callback to reorder columns
 * @param {() => void} [onReset] - Optional callback when reset is clicked
 * @param {string} [storageKey] - Optional localStorage key to remember column choices
 * @param {Array<string>} [defaultVisibleKeys] - Fallback visible keys when resetting
 * @param {string} [buttonLabel="Columns"]
 * @param {string} [className=""]
 */
export default function ColumnVisibilityManager({
  columns = [],
  visibleKeys = [],
  onChangeVisibleKeys,
  onReorderColumns = null,
  onReset = null,
  storageKey = null,
  defaultVisibleKeys = null,
  buttonLabel = "Columns",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const containerRef = useRef(null);

  // Fallback load saved preference on mount if storageKey is given and no external hook is managing it
  useEffect(() => {
    if (!storageKey || onReorderColumns) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      let loadedKeys = null;
      if (Array.isArray(parsed)) {
        loadedKeys = parsed;
      } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.visible)) {
        loadedKeys = parsed.visible;
      }
      if (loadedKeys && loadedKeys.length > 0) {
        const validKeys = loadedKeys.filter((key) => columns.some((col) => col.key === key));
        if (validKeys.length > 0) {
          onChangeVisibleKeys?.(validKeys);
        }
      }
    } catch {
      // Ignore localStorage read errors
    }
  }, [storageKey, onReorderColumns]);

  // Click outside and escape key handling
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function persistVisible(nextKeys) {
    onChangeVisibleKeys?.(nextKeys);
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        let existing = {};
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            existing = parsed;
          }
        }
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            order: existing.order || columns.map((c) => c.key),
            visible: nextKeys,
          })
        );
      } catch {
        // Ignore localStorage write quota/security errors
      }
    }
  }

  function toggleColumn(key, isAlwaysVisible) {
    if (isAlwaysVisible) return;

    if (visibleKeys.includes(key)) {
      if (visibleKeys.length <= 1) return; // Keep at least 1 column
      persistVisible(visibleKeys.filter((k) => k !== key));
    } else {
      persistVisible([...visibleKeys, key]);
    }
  }

  function handleSelectAll() {
    const allKeys = columns.map((col) => col.key);
    persistVisible(allKeys);
  }

  function handleReset() {
    if (onReset) {
      onReset();
      return;
    }
    const fallback = defaultVisibleKeys || columns.map((col) => col.key);
    persistVisible(fallback);
  }

  // Drag and drop handlers
  function handleDragStart(e, index) {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  }

  function handleDrop(e, targetIndex) {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    if (onReorderColumns) {
      onReorderColumns(draggedIndex, targetIndex);
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  const visibleCount = columns.filter((col) => visibleKeys.includes(col.key)).length;

  return (
    <div className={`relative inline-block text-left ${className}`} ref={containerRef}>
      <Button
        variant="secondary"
        size="md"
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2"
        aria-expanded={open}
        aria-haspopup="true"
        title="Show, hide, or reorder table columns"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 text-ink-muted"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M3 4.25A2.25 2.25 0 0 1 5.25 2h9.5A2.25 2.25 0 0 1 17 4.25v11.5A2.25 2.25 0 0 1 14.75 18h-9.5A2.25 2.25 0 0 1 3 15.75V4.25Zm6.75.75v10h5a.75.75 0 0 0 .75-.75V4.25a.75.75 0 0 0-.75-.75h-5Zm-1.5 0h-3a.75.75 0 0 0-.75.75v10.5c0 .414.336.75.75.75h3v-12Z"
            clipRule="evenodd"
          />
        </svg>

        <span>{buttonLabel}</span>

        <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 text-xs font-semibold text-ink-soft">
          {visibleCount}/{columns.length}
        </span>
      </Button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 origin-top-right rounded-card border border-line bg-surface p-3 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
          <div className="mb-2.5 flex items-center justify-between border-b border-line pb-2">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                {onReorderColumns ? "Columns & Order" : "Toggle Columns"}
              </span>
              <p className="text-[11px] text-ink-muted">
                {onReorderColumns ? "Drag to reorder placement" : "Show or hide columns"}
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-brand hover:underline font-medium"
              >
                All
              </button>
              <span className="text-line-strong">|</span>
              <button
                type="button"
                onClick={handleReset}
                className="text-ink-soft hover:underline"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {columns.map((column, index) => {
              const isChecked = visibleKeys.includes(column.key);
              const isAlwaysVisible = Boolean(column.alwaysVisible);
              const canReorder = Boolean(onReorderColumns && !isAlwaysVisible);
              const label = column.label || column.header || column.key;
              const isDragging = draggedIndex === index;
              const isOver = dragOverIndex === index && draggedIndex !== index;

              return (
                <div
                  key={column.key}
                  draggable={canReorder}
                  onDragStart={canReorder ? (e) => handleDragStart(e, index) : undefined}
                  onDragOver={canReorder ? (e) => handleDragOver(e, index) : undefined}
                  onDrop={canReorder ? (e) => handleDrop(e, index) : undefined}
                  onDragEnd={canReorder ? handleDragEnd : undefined}
                  className={`group relative flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm transition-all select-none ${
                    isDragging ? "opacity-30 bg-surface-sunken scale-95" : ""
                  } ${
                    isOver ? "border-t-2 border-brand bg-brand/5" : "border-t-2 border-transparent"
                  } ${
                    isChecked
                      ? "bg-surface-sunken/40 text-ink"
                      : "text-ink-muted hover:bg-surface-sunken/60"
                  } ${canReorder ? "cursor-grab active:cursor-grabbing" : ""}`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {canReorder ? (
                      <span
                        className="text-ink-muted/50 hover:text-ink-muted cursor-grab"
                        title="Drag to reorder"
                        aria-hidden="true"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="h-3.5 w-3.5"
                        >
                          <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-12a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
                        </svg>
                      </span>
                    ) : null}

                    <input
                      type="checkbox"
                      id={`col-toggle-${column.key}`}
                      checked={isChecked}
                      disabled={isAlwaysVisible || (isChecked && visibleKeys.length <= 1)}
                      onChange={() => toggleColumn(column.key, isAlwaysVisible)}
                      className="h-4 w-4 rounded border-line-strong text-brand accent-brand focus:ring-brand cursor-pointer"
                    />

                    <label
                      htmlFor={`col-toggle-${column.key}`}
                      className="truncate cursor-pointer flex-1"
                    >
                      {label}
                    </label>
                  </div>

                  {isAlwaysVisible ? (
                    <span className="text-[10px] uppercase font-semibold text-ink-muted tracking-tight">
                      Fixed
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
