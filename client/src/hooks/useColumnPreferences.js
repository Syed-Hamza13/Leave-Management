import { useCallback, useEffect, useMemo, useState } from "react";

function readStored(storageKey) {
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { order: null, visible: parsed };
    }
    if (parsed && typeof parsed === "object") {
      return {
        order: Array.isArray(parsed.order) ? parsed.order : null,
        visible: Array.isArray(parsed.visible) ? parsed.visible : null,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function writeStored(storageKey, prefs) {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(prefs));
  } catch {
    // Ignore localStorage write quota/security errors
  }
}

/**
 * Hook to manage column visibility and drag-and-drop order with localStorage persistence.
 * Solves async column loading issues by never wiping saved custom keys before they load.
 *
 * @param {Object} options
 * @param {string} [options.storageKey]
 * @param {Array<{ key: string, label?: string, header?: string, alwaysVisible?: boolean, isVisible?: boolean }>} options.columns
 * @param {Array<string>} [options.defaultVisibleKeys]
 */
export default function useColumnPreferences({
  storageKey = null,
  columns = [],
  defaultVisibleKeys = null,
}) {
  const [savedPrefs, setSavedPrefs] = useState(() =>
    readStored(storageKey) || { order: null, visible: null }
  );

  // Re-read if storageKey changes
  useEffect(() => {
    setSavedPrefs(readStored(storageKey) || { order: null, visible: null });
  }, [storageKey]);

  // Derive ordered columns based on saved order
  const orderedColumns = useMemo(() => {
    if (!columns || columns.length === 0) return [];
    if (!savedPrefs.order || savedPrefs.order.length === 0) return columns;

    const columnMap = new Map(columns.map((col) => [col.key, col]));
    const result = [];

    // First add columns that appear in saved order
    for (const key of savedPrefs.order) {
      const col = columnMap.get(key);
      if (col) {
        result.push(col);
        columnMap.delete(key);
      }
    }

    // Append any columns from `columns` that were not in saved order (e.g. newly added columns)
    for (const remainingCol of columnMap.values()) {
      result.push(remainingCol);
    }

    return result;
  }, [columns, savedPrefs.order]);

  // Derive visible keys
  const visibleKeys = useMemo(() => {
    if (!columns || columns.length === 0) return [];

    const allKeys = new Set(columns.map((c) => c.key));
    const alwaysVisibleKeys = columns.filter((c) => c.alwaysVisible).map((c) => c.key);

    if (savedPrefs.visible && Array.isArray(savedPrefs.visible)) {
      const savedSet = new Set(savedPrefs.visible);
      const result = new Set();

      // Keep saved visible keys that exist in current columns
      for (const key of savedPrefs.visible) {
        if (allKeys.has(key)) {
          result.add(key);
        }
      }

      // Check if there are newly added columns (never recorded in order or visible)
      // They should default to visible unless explicitly marked isVisible === false
      const knownKeys = new Set([
        ...(savedPrefs.order || []),
        ...(savedPrefs.visible || []),
      ]);

      for (const col of columns) {
        if (!knownKeys.has(col.key) && col.isVisible !== false) {
          result.add(col.key);
        }
      }

      // Always include alwaysVisible keys
      for (const fixedKey of alwaysVisibleKeys) {
        result.add(fixedKey);
      }

      const list = Array.from(result);
      return list.length > 0 ? list : columns.map((c) => c.key);
    }

    // Fallback to defaults
    if (defaultVisibleKeys && defaultVisibleKeys.length > 0) {
      return defaultVisibleKeys;
    }

    return columns.filter((c) => c.isVisible !== false).map((c) => c.key);
  }, [columns, savedPrefs.visible, savedPrefs.order, defaultVisibleKeys]);

  const setVisibleKeys = useCallback(
    (nextKeys) => {
      const validKeys = Array.isArray(nextKeys) ? nextKeys : [];
      setSavedPrefs((prev) => {
        // Keep existing order or create from current orderedColumns
        const currentOrder = prev.order || orderedColumns.map((c) => c.key);
        const updated = {
          order: currentOrder,
          visible: validKeys,
        };
        writeStored(storageKey, updated);
        return updated;
      });
    },
    [storageKey, orderedColumns]
  );

  const toggleColumn = useCallback(
    (key, isAlwaysVisible) => {
      if (isAlwaysVisible) return;

      const isCurrent = visibleKeys.includes(key);
      let nextKeys;
      if (isCurrent) {
        if (visibleKeys.length <= 1) return; // Keep at least 1 column
        nextKeys = visibleKeys.filter((k) => k !== key);
      } else {
        nextKeys = [...visibleKeys, key];
      }

      setVisibleKeys(nextKeys);
    },
    [visibleKeys, setVisibleKeys]
  );

  const reorderColumns = useCallback(
    (newOrderOrFromIndex, maybeToIndex) => {
      setSavedPrefs((prev) => {
        let nextOrder;
        if (Array.isArray(newOrderOrFromIndex)) {
          nextOrder = newOrderOrFromIndex;
        } else if (
          typeof newOrderOrFromIndex === "string" &&
          typeof maybeToIndex === "string"
        ) {
          const fromKey = newOrderOrFromIndex;
          const toKey = maybeToIndex;
          const currentList = [...orderedColumns.map((c) => c.key)];
          const fromIndex = currentList.indexOf(fromKey);
          const toIndex = currentList.indexOf(toKey);
          if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return prev;
          const [moved] = currentList.splice(fromIndex, 1);
          currentList.splice(toIndex, 0, moved);
          nextOrder = currentList;
        } else if (
          typeof newOrderOrFromIndex === "number" &&
          typeof maybeToIndex === "number"
        ) {
          const fromIndex = newOrderOrFromIndex;
          const toIndex = maybeToIndex;
          const currentList = [...orderedColumns.map((c) => c.key)];
          if (
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= currentList.length ||
            toIndex >= currentList.length ||
            fromIndex === toIndex
          ) {
            return prev;
          }
          const [moved] = currentList.splice(fromIndex, 1);
          currentList.splice(toIndex, 0, moved);
          nextOrder = currentList;
        } else {
          return prev;
        }

        const updated = {
          order: nextOrder,
          visible: prev.visible || visibleKeys,
        };
        writeStored(storageKey, updated);
        return updated;
      });
    },
    [storageKey, orderedColumns, visibleKeys]
  );

  const resetPreferences = useCallback(() => {
    const defaultOrder = columns.map((c) => c.key);
    const defaultVisible =
      defaultVisibleKeys || columns.filter((c) => c.isVisible !== false).map((c) => c.key);

    const updated = {
      order: defaultOrder,
      visible: defaultVisible,
    };
    writeStored(storageKey, updated);
    setSavedPrefs(updated);
  }, [storageKey, columns, defaultVisibleKeys]);

  const selectAll = useCallback(() => {
    const all = columns.map((c) => c.key);
    setVisibleKeys(all);
  }, [columns, setVisibleKeys]);

  const removeColumnFromPreferences = useCallback(
    (columnKey) => {
      setSavedPrefs((prev) => {
        const nextOrder = prev.order ? prev.order.filter((k) => k !== columnKey) : null;
        const nextVisible = prev.visible ? prev.visible.filter((k) => k !== columnKey) : null;
        const updated = { order: nextOrder, visible: nextVisible };
        writeStored(storageKey, updated);
        return updated;
      });
    },
    [storageKey]
  );

  return {
    orderedColumns,
    visibleKeys,
    setVisibleKeys,
    toggleColumn,
    reorderColumns,
    resetPreferences,
    selectAll,
    removeColumnFromPreferences,
  };
}
