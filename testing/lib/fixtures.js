/*
 * Server-side fixtures for the browser suites.

 * Builders are exercised through the UI, but a record or organization test needs
 * a complete mapped pair before it can click anything, so the pair is assembled
 * through the API. Every name carries the run tag, which keeps the rows traceable
 * and away from hand-made data.
 */
import { config } from "../config.js";

async function created(adminApi, promise, label) {
  return adminApi.expectOk(promise, label);
}

/**
 * Builds a managed table, one text/number/date/dropdown column per spec, a form
 * carrying the matching fields, and the mapping that connects them.
 *
 * Returns the ids plus one entry per spec: { name, label, key, dataType, columnKey,
 * formFieldId, value } where `value` is a sample that satisfies the type.
 */
export async function buildMappedTable({ adminApi, isolate, name, specs = null, options = null }) {
  const tableLabel = isolate.label(`${name} table`);
  const formLabel = isolate.label(`${name} form`);

  const defaultSpecs = [
    { name: "notes", dataType: "text" },
    { name: "count", dataType: "number" },
    { name: "day", dataType: "date" },
  ];

  const resolved = specs ?? defaultSpecs;

  const dropdownId = options?.id ?? null;

  const table = await created(
    adminApi,
    adminApi.post("/admin/tables", {
      label: tableLabel,
      key: isolate.key(`${name}_table`),
    }),
    `create the ${name} table`
  );

  const entries = [];

  for (const spec of resolved) {
    const field = await created(
      adminApi,
      adminApi.post("/admin/fields", {
        label: isolate.label(spec.name),
        key: isolate.key(`${name}_${spec.name}`),
        dataType: spec.dataType,
        config: spec.dataType === "dropdown" ? { dropdownId: spec.dropdownId } : spec.config,
        isRequired: spec.isRequired,
      }),
      `create the ${spec.name} field`
    );

    const column = await created(
      adminApi,
      adminApi.post(`/admin/tables/${table.id}/columns`, {
        label: isolate.label(`${spec.name} column`),
        key: isolate.key(`${name}_${spec.name}_column`),
        dataType: spec.dataType,
        config: spec.dataType === "dropdown" ? { dropdownId: spec.dropdownId } : spec.config,
        isRequired: spec.isRequired,
      }),
      `create the ${spec.name} column`
    );

    entries.push({ spec, field, column });
  }

  const form = await created(
    adminApi,
    adminApi.post("/admin/forms", {
      label: formLabel,
      key: isolate.key(`${name}_form`),
      fields: entries.map((entry) => ({ fieldId: entry.field.id })),
    }),
    `create the ${name} form`
  );

  const render = await created(
    adminApi,
    adminApi.get(`/admin/forms/${form.id}/render`),
    `read the ${name} form for entry`
  );

  const byFieldKey = new Map((render?.fields ?? []).map((field) => [field.key, field]));

  const columns = entries.map((entry) => {
    const rendered = byFieldKey.get(entry.field.key);

    if (!rendered?.formFieldId) {
      throw new Error(`the form never attached the field ${entry.field.key}`);
    }

    return {
      name: entry.spec.name,
      label: entry.field.label,
      key: entry.field.key,
      dataType: entry.spec.dataType,
      columnKey: entry.column.key,
      columnLabel: entry.column.label,
      columnId: entry.column.id,
      formFieldId: rendered.formFieldId,
      isRequired: Boolean(entry.spec.isRequired),
      value: sampleValue(entry.spec, isolate, options),
    };
  });

  const mapping = await created(
    adminApi,
    adminApi.put("/admin/mappings", {
      formId: form.id,
      tableId: table.id,
      entries: columns.map((column) => ({
        formFieldId: column.formFieldId,
        columnId: column.columnId,
      })),
    }),
    `map the ${name} form to its table`
  );

  return {
    name,
    tableId: table.id,
    tableLabel,
    tableKey: table.key,
    formId: form.id,
    formLabel,
    mappingId: mapping?.id ?? null,
    columns,
    values: Object.fromEntries(columns.map((column) => [column.key, column.value])),
    columnValues: Object.fromEntries(columns.map((column) => [column.columnKey, column.value])),
  };
}

function sampleValue(spec, isolate, options) {
  if (spec.value !== undefined) return spec.value;

  switch (spec.dataType) {
    case "number":
      return 7;
    case "date":
      return "2026-03-04";
    case "checkbox":
    case "toggle":
      return true;
    case "dropdown":
      return options?.optionValue ?? "alpha";
    default:
      return isolate.tag;
  }
}

/** A dropdown option set with two known values, for typed entry and facets. */
export async function buildDropdown({ adminApi, isolate, name }) {  const label = isolate.label(`${name} options`);

  const dropdown = await created(
    adminApi,
    adminApi.post("/admin/dropdowns", {
      label,
      key: isolate.key(`${name}_options`),
      options: [
        { value: "alpha", label: "Alpha" },
        { value: "beta", label: "Beta" },
      ],
    }),
    `create the ${name} option set`
  );

  return { id: dropdown.id, label, key: dropdown.key, optionValue: "alpha" };
}

export function recordPath(tableId) {
  return `${config.webBaseUrl}/records/${tableId}`;
}

/**
 * An entity type with the configurations it needs: a profile pair (one record per
 * entity) and/or a section pair (a list under each entity). Both halves are built
 * through the API because a browser cannot reach a configuration screen without
 * them, and every name still carries the run tag.
 */
export async function buildEntityType({
  adminApi,
  isolate,
  name,
  parentTypeId = null,
  profileSpecs = null,
  sectionSpecs = null,
}) {
  const typeLabel = isolate.label(`${name} type`);

  const type = await created(
    adminApi,
    adminApi.post("/organization/entity-types", {
      label: typeLabel,
      key: isolate.key(`${name}_type`),
      description: `Created by the Selenium run ${isolate.tag}.`,
      parentTypeId,
    }),
    `create the ${name} entity type`
  );

  const attach = async (scope, specs) => {
    const pair = await buildMappedTable({
      adminApi,
      isolate,
      name: `${name}${scope === "profile" ? "Profile" : "Section"}`,
      specs,
    });

    const configuration = await created(
      adminApi,
      adminApi.post(`/organization/entity-types/${type.id}/configurations`, {
        scope,
        label: isolate.label(`${name} ${scope}`),
        formId: pair.formId,
        tableId: pair.tableId,
        mappingId: pair.mappingId,
      }),
      `attach the ${name} ${scope} configuration`
    );

    return { pair, configurationId: configuration.id, label: configuration.label };
  };

  return {
    typeId: type.id,
    typeLabel,
    typeKey: type.key,
    profile: profileSpecs ? await attach("profile", profileSpecs) : null,
    section: sectionSpecs ? await attach("section", sectionSpecs) : null,
  };
}
