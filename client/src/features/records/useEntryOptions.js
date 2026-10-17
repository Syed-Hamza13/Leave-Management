import useAsyncData from "../../hooks/useAsyncData.js";
import { dropdowns as dropdownsApi, records as recordsApi, tables as tablesApi } from "../../services/resources.js";

import { pickDisplayKey } from "./recordValues.js";

/*
 * One page of candidates is the widest a picker may reach: the server caps a
 * list page at 200 rows and loading every record would be the same mistake as
 * loading every distinct value into the browser.
 */
const CANDIDATE_PAGE_SIZE = 200;

function collectIds(items, dataType, configKey) {
  const ids = new Set();

  for (const item of items) {
    if (item.dataType !== dataType) continue;

    const id = Number(item.config?.[configKey]);

    if (Number.isInteger(id) && id > 0) ids.add(id);
  }

  return [...ids].sort((left, right) => left - right);
}

function loadDropdown(dropdownId) {
  return dropdownsApi.options(dropdownId).then((response) => ({
    options: (response?.data ?? [])
      .filter((option) => option.isActive)
      .map((option) => ({ value: option.value, label: option.label })),
    total: (response?.data ?? []).length,
  }));
}

async function loadTable(tableId) {
  const [tableResponse, recordsResponse] = await Promise.all([
    tablesApi.get(tableId),
    recordsApi.list(tableId, {
      pageSize: CANDIDATE_PAGE_SIZE,
      status: "active",
      sort: { key: "createdAt", direction: "desc" },
    }),
  ]);

  const table = tableResponse?.data ?? null;
  const displayKey = pickDisplayKey(table);

  const options = (recordsResponse?.data ?? []).map((record) => {
    const value = displayKey ? record.values?.[displayKey] : null;

    return {
      value: record.id,
      label:
        value === null || value === undefined || value === ""
          ? `Record #${record.id}`
          : String(value),
    };
  });

  return { options, total: recordsResponse?.meta?.total ?? options.length };
}

/*
 * Entry forms mix dropdowns and relations, and several fields can share one
 * option set or one target table. Loading each source once per screen keeps the
 * request count proportional to the distinct sources, not to the field list.
 */
export default function useEntryOptions(items = []) {
  const list = items;

  const dropdownIds = collectIds(list, "dropdown", "dropdownId");
  const tableIds = collectIds(list, "record_reference", "targetTableId");

  const signature = `${dropdownIds.join(",")}|${tableIds.join(",")}`;

  const { data, loading, error, reload } = useAsyncData(
    `entry-options:${signature}`,
    async () => {
      if (dropdownIds.length === 0 && tableIds.length === 0) return new Map();

      const entries = await Promise.all([
        ...dropdownIds.map(async (id) => [
          `dropdown:${id}`,
          await loadDropdown(id).catch(() => ({ options: null, total: 0 })),
        ]),
        ...tableIds.map(async (id) => [
          `table:${id}`,
          await loadTable(id).catch(() => ({ options: null, total: 0 })),
        ]),
      ]);

      return new Map(entries);
    }
  );

  const sources = data?.data ?? new Map();

  function sourceFor(item) {
    if (item?.dataType === "dropdown") {
      return sources.get(`dropdown:${Number(item.config?.dropdownId)}`) ?? null;
    }

    if (item?.dataType === "record_reference") {
      return sources.get(`table:${Number(item.config?.targetTableId)}`) ?? null;
    }

    return null;
  }

  function optionsFor(item) {
    return sourceFor(item)?.options ?? null;
  }

  /*
   * A relation picker only ever offers the newest candidates, so the form says
   * so instead of implying the list is complete.
   */
  function truncatedFor(item) {
    const source = sourceFor(item);

    if (!source || item?.dataType !== "record_reference") return false;

    return source.options !== null && source.total > source.options.length;
  }

  return { optionsFor, truncatedFor, loading, error, reload };
}
