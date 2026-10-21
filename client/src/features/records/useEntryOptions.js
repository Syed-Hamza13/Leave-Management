import useAsyncData from "../../hooks/useAsyncData.js";
import {
  dropdowns as dropdownsApi,
  organization as organizationApi,
  records as recordsApi,
  tables as tablesApi,
  users as usersApi,
} from "../../services/resources.js";

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

async function loadEntities(entityTypeId = null) {
  const params = {
    pageSize: CANDIDATE_PAGE_SIZE,
    status: "active",
  };

  if (entityTypeId) {
    params.entityTypeId = entityTypeId;
  }

  const response = await organizationApi.listEntities(params);
  const entities = response?.data ?? [];

  const options = entities.map((entity) => ({
    value: entity.id,
    label: entity.name,
  }));

  return { options, total: response?.meta?.total ?? options.length };
}

async function loadUsers() {
  const response = await usersApi.list({
    pageSize: CANDIDATE_PAGE_SIZE,
    status: "active",
  });

  const usersList = response?.data ?? [];

  const options = usersList.map((user) => {
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
    const label = name ? (user.email ? `${name} (${user.email})` : name) : user.email;

    return {
      value: user.id,
      label,
    };
  });

  return { options, total: response?.meta?.total ?? options.length };
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

  const entityTypeIds = new Set();
  let hasUntypedEntities = false;
  let hasUsers = false;

  for (const item of list) {
    if (item.dataType === "entity_reference") {
      const typeId = Number(item.config?.entityTypeId);
      if (Number.isInteger(typeId) && typeId > 0) {
        entityTypeIds.add(typeId);
      } else {
        hasUntypedEntities = true;
      }
    }

    if (item.dataType === "user_reference") {
      hasUsers = true;
    }
  }

  const sortedEntityTypes = [...entityTypeIds].sort((a, b) => a - b);
  const signature = `${dropdownIds.join(",")}|${tableIds.join(",")}|${sortedEntityTypes.join(",")}|${hasUntypedEntities ? "untyped" : ""}|${hasUsers ? "users" : ""}`;

  const { data, loading, error, reload } = useAsyncData(
    `entry-options:${signature}`,
    async () => {
      const tasks = [];

      for (const id of dropdownIds) {
        tasks.push(
          loadDropdown(id)
            .then((res) => [`dropdown:${id}`, res])
            .catch(() => [`dropdown:${id}`, { options: null, total: 0, failed: true }])
        );
      }

      for (const id of tableIds) {
        tasks.push(
          loadTable(id)
            .then((res) => [`table:${id}`, res])
            .catch(() => [`table:${id}`, { options: null, total: 0, failed: true }])
        );
      }

      for (const id of sortedEntityTypes) {
        tasks.push(
          loadEntities(id)
            .then((res) => [`entity:${id}`, res])
            .catch(() => [`entity:${id}`, { options: null, total: 0, failed: true }])
        );
      }

      if (hasUntypedEntities) {
        tasks.push(
          loadEntities(null)
            .then((res) => [`entity:all`, res])
            .catch(() => [`entity:all`, { options: null, total: 0, failed: true }])
        );
      }

      if (hasUsers) {
        tasks.push(
          loadUsers()
            .then((res) => [`users:all`, res])
            .catch(() => [`users:all`, { options: null, total: 0, failed: true }])
        );
      }

      if (tasks.length === 0) return new Map();

      const entries = await Promise.all(tasks);
      return new Map(entries);
    }
  );

  const sources = data ?? new Map();

  function sourceFor(item) {
    if (item?.dataType === "dropdown") {
      return sources.get(`dropdown:${Number(item.config?.dropdownId)}`) ?? null;
    }

    if (item?.dataType === "record_reference") {
      return sources.get(`table:${Number(item.config?.targetTableId)}`) ?? null;
    }

    if (item?.dataType === "entity_reference") {
      const typeId = Number(item.config?.entityTypeId);
      return (
        sources.get(typeId > 0 ? `entity:${typeId}` : "entity:all") ?? null
      );
    }

    if (item?.dataType === "user_reference") {
      return sources.get("users:all") ?? null;
    }

    return null;
  }

  function optionsFor(item) {
    return sourceFor(item)?.options ?? null;
  }

  function failedFor(item) {
    return Boolean(sourceFor(item)?.failed);
  }

  function truncatedFor(item) {
    const source = sourceFor(item);

    if (
      !source ||
      !["record_reference", "entity_reference", "user_reference"].includes(item?.dataType)
    ) {
      return false;
    }

    return source.options !== null && source.total > source.options.length;
  }

  return { optionsFor, truncatedFor, failedFor, loading, error, reload };
}
