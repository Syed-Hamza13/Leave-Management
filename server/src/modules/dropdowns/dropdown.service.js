import { badRequest, conflict, notFound } from "../../lib/appError.js";
import { withTransaction } from "../../lib/transactions.js";
import {
  assertValidKey,
  assertKeyNotReserved,
  slugifyKey,
} from "../../lib/identifiers.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  findDropdowns,
  countDropdowns,
  findDropdownById,
  findDropdownByKey,
  findAllActiveDropdowns,
  insertDropdown,
  updateDropdown,
  findOptionsByDropdownId,
  findOptionById,
  findOptionByValue,
  nextOptionSortOrder,
  insertOption,
  updateOption,
  deleteOption,
  applyOptionOrder,
  findColumnsUsingDropdown,
  countRecordsUsingOptionValue,
  countProfileValuesUsingOptionValue,
  countFieldsUsingDropdown,
} from "./dropdown.repository.js";

export async function listDropdowns(query) {
  const [dropdowns, total] = await Promise.all([
    findDropdowns(query),
    countDropdowns(query),
  ]);

  return { dropdowns, total };
}

export async function listActiveDropdownSummaries() {
  const dropdowns = await findAllActiveDropdowns();

  return dropdowns.map((dropdown) => ({
    id: dropdown.id,
    key: dropdown.key,
    label: dropdown.label,
    optionCount: dropdown.optionCount,
  }));
}

export async function getDropdown(dropdownId, { includeOptions = true } = {}) {
  const dropdown = await findDropdownById(dropdownId);

  if (!dropdown) {
    throw notFound("Option set not found.", { code: "DROPDOWN_NOT_FOUND" });
  }

  if (!includeOptions) return dropdown;

  const options = await findOptionsByDropdownId(dropdownId);

  return { ...dropdown, options };
}

export async function createDropdown(payload, actor) {
  const key = assertValidKey(
    payload.key || slugifyKey(payload.label),
    "option set key"
  );

  assertKeyNotReserved(key, "Option set key");

  if (await findDropdownByKey(key)) {
    throw conflict(`An option set with key "${key}" already exists.`, {
      code: "DROPDOWN_KEY_TAKEN",
    });
  }

  const seenValues = new Set();

  for (const option of payload.options || []) {
    if (seenValues.has(option.value)) {
      throw conflict(`Duplicate option value "${option.value}".`, {
        code: "DUPLICATE_OPTION_VALUE",
      });
    }

    seenValues.add(option.value);
  }

  const dropdownId = await withTransaction(async (connection) => {
    const insertId = await insertDropdown(connection, {
      key,
      label: payload.label,
      description: payload.description ?? null,
      actorUserId: actor?.userId ?? null,
    });

    let order = 10;

    for (const option of payload.options || []) {
      await insertOption(connection, {
        dropdownId: insertId,
        value: option.value,
        label: option.label,
        sortOrder: order,
        isActive: true,
      });

      order += 10;
    }

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "dropdown.create",
      entityType: "dropdown",
      entityId: insertId,
      summary: { key, label: payload.label, optionCount: (payload.options || []).length },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });

    return insertId;
  });

  return getDropdown(dropdownId);
}

export async function updateDropdownDefinition(dropdownId, patch, actor) {
  const current = await getDropdown(dropdownId, { includeOptions: false });

  /*
   * An archived option set would leave every dropdown field pointing at it
   * unable to accept new values, so the fields must be dealt with first.
   */
  if (patch.status === "archived" && current.status === "active") {
    const fieldCount = await countFieldsUsingDropdown(dropdownId);

    if (fieldCount > 0) {
      throw conflict(
        `This option set is used by ${fieldCount} field(s). Archive those fields first.`,
        { code: "DROPDOWN_IN_USE" }
      );
    }
  }

  const changed = await withTransaction(async (connection) => {
    const didUpdate = await updateDropdown(
      connection,
      dropdownId,
      patch,
      actor?.userId ?? null
    );

    if (didUpdate) {
      await recordAudit({
        connection,
        actorUserId: actor?.userId ?? null,
        action: patch.status === "archived" ? "dropdown.archive" : "dropdown.update",
        entityType: "dropdown",
        entityId: dropdownId,
        summary: { changedKeys: Object.keys(patch) },
        ipAddress: actor?.ipAddress ?? null,
        userAgent: actor?.userAgent ?? null,
      });
    }

    return didUpdate;
  });

  if (!changed) {
    throw badRequest("No changes were supplied.", { code: "NO_CHANGES" });
  }

  return getDropdown(dropdownId);
}

export async function archiveDropdown(dropdownId, actor) {
  const current = await getDropdown(dropdownId, { includeOptions: false });

  if (current.status === "archived") return current;

  return updateDropdownDefinition(dropdownId, { status: "archived" }, actor);
}

export async function listOptions(dropdownId, { activeOnly = false } = {}) {
  await getDropdown(dropdownId, { includeOptions: false });

  return findOptionsByDropdownId(dropdownId, { activeOnly });
}

export async function addOption(dropdownId, payload, actor) {
  const dropdown = await getDropdown(dropdownId, { includeOptions: false });

  if (dropdown.status !== "active") {
    throw conflict("This option set is archived and cannot accept new options.", {
      code: "DROPDOWN_ARCHIVED",
    });
  }

  if (await findOptionByValue(dropdownId, payload.value)) {
    throw conflict(`Option value "${payload.value}" already exists.`, {
      code: "DUPLICATE_OPTION_VALUE",
    });
  }

  const optionId = await withTransaction(async (connection) => {
    const sortOrder =
      payload.sortOrder ?? (await nextOptionSortOrder(connection, dropdownId));

    const insertId = await insertOption(connection, {
      dropdownId,
      value: payload.value,
      label: payload.label,
      sortOrder,
      isActive: payload.isActive !== false,
    });

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "dropdown.option.create",
      entityType: "dropdown_option",
      entityId: insertId,
      summary: { dropdownId, value: payload.value, label: payload.label },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });

    return insertId;
  });

  const option = await findOptionById(optionId);

  return option;
}

export async function changeOption(dropdownId, optionId, patch, actor) {
  const option = await findOptionById(optionId);

  if (!option || Number(option.dropdownId) !== Number(dropdownId)) {
    throw notFound("Option not found.", { code: "OPTION_NOT_FOUND" });
  }

  await withTransaction(async (connection) => {
    const didUpdate = await updateOption(connection, optionId, patch);

    if (didUpdate) {
      await recordAudit({
        connection,
        actorUserId: actor?.userId ?? null,
        action: "dropdown.option.update",
        entityType: "dropdown_option",
        entityId: optionId,
        summary: { dropdownId, changedKeys: Object.keys(patch) },
        ipAddress: actor?.ipAddress ?? null,
        userAgent: actor?.userAgent ?? null,
      });
    }
  });

  return findOptionById(optionId);
}

/*
 * Deleting an option is only allowed while no stored record uses its value.
 * Otherwise the admin is directed to deactivate it, which keeps historical
 * records readable while hiding the choice from new submissions.
 */
export async function removeOption(dropdownId, optionId, actor) {
  const option = await findOptionById(optionId);

  if (!option || Number(option.dropdownId) !== Number(dropdownId)) {
    throw notFound("Option not found.", { code: "OPTION_NOT_FOUND" });
  }

  const columns = await findColumnsUsingDropdown(dropdownId);

  for (const column of columns) {
    const usage = column.is_system
      ? await countProfileValuesUsingOptionValue(column.id, option.value)
      : await countRecordsUsingOptionValue(column.table_id, column.column_key, option.value);

    if (usage > 0) {
      throw conflict(
        `"${option.label}" is stored in ${usage} record(s). Deactivate the option instead of deleting it.`,
        { code: "OPTION_IN_USE" }
      );
    }
  }

  await withTransaction(async (connection) => {
    await deleteOption(connection, optionId);

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "dropdown.option.delete",
      entityType: "dropdown_option",
      entityId: optionId,
      summary: { dropdownId, value: option.value },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  return { deleted: true, optionId };
}

export async function reorderDropdownOptions(dropdownId, optionIds, actor) {
  const options = await findOptionsByDropdownId(dropdownId);
  const knownIds = new Set(options.map((option) => Number(option.id)));

  const unknown = optionIds.filter((id) => !knownIds.has(Number(id)));

  if (unknown.length > 0) {
    throw badRequest("Some options do not belong to this option set.", {
      code: "OPTION_MISMATCH",
    });
  }

  if (optionIds.length !== options.length) {
    throw badRequest("The new order must include every option exactly once.", {
      code: "INCOMPLETE_OPTION_ORDER",
    });
  }

  await withTransaction(async (connection) => {
    await applyOptionOrder(connection, dropdownId, optionIds.map(Number));

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "dropdown.option.reorder",
      entityType: "dropdown",
      entityId: dropdownId,
      summary: { optionCount: optionIds.length },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  return findOptionsByDropdownId(dropdownId);
}
