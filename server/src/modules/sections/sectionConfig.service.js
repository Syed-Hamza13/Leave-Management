import { badRequest, conflict, notFound } from "../../lib/appError.js";
import { parseJsonColumn } from "../../lib/jsonColumn.js";
import { withTransaction } from "../../lib/transactions.js";
import { recordAudit } from "../audit/audit.service.js";
import { findFormById } from "../forms/form.repository.js";
import { findTableById } from "../tables/table.repository.js";
import { findMappingById } from "../mappings/mapping.repository.js";
import { getActiveMappingWithEntries } from "../mappings/mapping.service.js";
import {
  findSectionConfigRow,
  upsertSectionConfigRow,
  deleteSectionConfigRow,
  hydrateSectionConfig,
} from "./sectionConfig.repository.js";

async function assertSectionConfigurationTriple({ formId, tableId, mappingId }) {
  const form = await findFormById(formId);
  if (!form) {
    throw badRequest("The selected form does not exist.", { code: "FORM_NOT_FOUND" });
  }

  const table = await findTableById(tableId);
  if (!table) {
    throw badRequest("The selected table does not exist.", { code: "TABLE_NOT_FOUND" });
  }

  if (table.storageKind !== "managed") {
    throw conflict("Section records cannot be stored in a system-managed table.", {
      code: "SYSTEM_TABLE_READONLY",
    });
  }

  const mapping = await findMappingById(mappingId);
  if (!mapping) {
    throw badRequest("The selected mapping does not exist.", { code: "MAPPING_NOT_FOUND" });
  }

  if (Number(mapping.formId) !== Number(formId) || Number(mapping.tableId) !== Number(tableId)) {
    throw badRequest("The mapping does not connect the selected form and table.", {
      code: "MAPPING_PAIR_MISMATCH",
    });
  }

  await getActiveMappingWithEntries(formId, tableId);
}

export async function getSectionConfiguration(sectionKey) {
  const row = await findSectionConfigRow(sectionKey);
  if (!row || !row.setting_value) {
    return null;
  }

  const raw = parseJsonColumn(row.setting_value, null);
  if (!raw) {
    return null;
  }

  const hydrated = await hydrateSectionConfig(raw, {
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  if (!hydrated) {
    return null;
  }

  return {
    ...hydrated,
    configurations: [hydrated],
  };
}

export async function saveSectionConfiguration(sectionKey, input, actor) {
  await assertSectionConfigurationTriple({
    formId: input.formId,
    tableId: input.tableId,
    mappingId: input.mappingId,
  });

  const value = {
    sectionKey,
    label: input.label,
    formId: input.formId,
    tableId: input.tableId,
    mappingId: input.mappingId,
    isActive: Boolean(input.isActive ?? true),
    sortOrder: Number(input.sortOrder ?? 0),
  };

  await withTransaction(async (connection) => {
    await upsertSectionConfigRow(connection, {
      sectionKey,
      value,
      updatedBy: actor?.userId ?? null,
    });

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "section.configuration.save",
      entityType: "section_configuration",
      entityId: sectionKey,
      summary: { sectionKey, label: input.label, formId: input.formId, tableId: input.tableId },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  return getSectionConfiguration(sectionKey);
}

export async function deleteSectionConfiguration(sectionKey, actor) {
  const current = await findSectionConfigRow(sectionKey);
  if (!current) {
    return { success: true };
  }

  await withTransaction(async (connection) => {
    await deleteSectionConfigRow(connection, sectionKey);

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "section.configuration.delete",
      entityType: "section_configuration",
      entityId: sectionKey,
      summary: { sectionKey },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  return { success: true };
}
