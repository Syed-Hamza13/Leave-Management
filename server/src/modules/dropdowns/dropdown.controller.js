import { ok, created, okList } from "../../lib/responses.js";
import { parsePagination, parseSearch } from "../../lib/pagination.js";
import {
  listDropdownsQuerySchema,
  createDropdownSchema,
  updateDropdownSchema,
  createOptionSchema,
  updateOptionSchema,
  reorderOptionsSchema,
  dropdownIdParamSchema,
  optionIdParamSchema,
} from "./dropdown.validation.js";
import {
  listDropdowns,
  getDropdown,
  createDropdown,
  updateDropdownDefinition,
  archiveDropdown,
  listOptions,
  addOption,
  changeOption,
  removeOption,
  reorderDropdownOptions,
} from "./dropdown.service.js";

function actorFrom(req) {
  return {
    userId: req.currentUserId ?? req.session?.user?.id ?? null,
    ipAddress: req.ip || null,
    userAgent: req.get("user-agent") || null,
  };
}

export async function listDropdownsHandler(req, res, next) {
  try {
    const query = listDropdownsQuerySchema.parse(req.query);
    const pagination = parsePagination(query);

    const { dropdowns, total } = await listDropdowns({
      limit: pagination.limit,
      offset: pagination.offset,
      search: parseSearch(query) || undefined,
      status: query.status,
    });

    if (!query.includeOptions) {
      return okList(res, dropdowns, pagination, total);
    }

    const withOptions = await Promise.all(
      dropdowns.map((dropdown) =>
        listOptions(dropdown.id).then((options) => ({ ...dropdown, options }))
      )
    );

    return okList(res, withOptions, pagination, total);
  } catch (error) {
    return next(error);
  }
}

export async function getDropdownHandler(req, res, next) {
  try {
    const { dropdownId } = dropdownIdParamSchema.parse(req.params);

    return ok(res, await getDropdown(dropdownId));
  } catch (error) {
    return next(error);
  }
}

export async function createDropdownHandler(req, res, next) {
  try {
    const payload = createDropdownSchema.parse(req.body);

    return created(res, await createDropdown(payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function updateDropdownHandler(req, res, next) {
  try {
    const { dropdownId } = dropdownIdParamSchema.parse(req.params);
    const payload = updateDropdownSchema.parse(req.body);

    return ok(res, await updateDropdownDefinition(dropdownId, payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function archiveDropdownHandler(req, res, next) {
  try {
    const { dropdownId } = dropdownIdParamSchema.parse(req.params);

    return ok(res, await archiveDropdown(dropdownId, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function listOptionsHandler(req, res, next) {
  try {
    const { dropdownId } = dropdownIdParamSchema.parse(req.params);
    const activeOnly = req.query.activeOnly === "true";

    return ok(res, await listOptions(dropdownId, { activeOnly }));
  } catch (error) {
    return next(error);
  }
}

export async function addOptionHandler(req, res, next) {
  try {
    const { dropdownId } = dropdownIdParamSchema.parse(req.params);
    const payload = createOptionSchema.parse(req.body);

    return created(res, await addOption(dropdownId, payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function updateOptionHandler(req, res, next) {
  try {
    const { dropdownId, optionId } = optionIdParamSchema.parse(req.params);
    const payload = updateOptionSchema.parse(req.body);

    return ok(res, await changeOption(dropdownId, optionId, payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function deleteOptionHandler(req, res, next) {
  try {
    const { dropdownId, optionId } = optionIdParamSchema.parse(req.params);

    return ok(res, await removeOption(dropdownId, optionId, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function reorderOptionsHandler(req, res, next) {
  try {
    const { dropdownId } = dropdownIdParamSchema.parse(req.params);
    const { optionIds } = reorderOptionsSchema.parse(req.body);

    return ok(res, await reorderDropdownOptions(dropdownId, optionIds, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}
