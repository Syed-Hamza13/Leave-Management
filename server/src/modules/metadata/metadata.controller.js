import { ok } from "../../lib/responses.js";
import { describeDataTypes } from "../../lib/dataTypes.js";
import { listActiveDropdownSummaries } from "../dropdowns/dropdown.service.js";
import { listActiveTableSummaries } from "../tables/table.service.js";
import { listActiveFormSummaries } from "../forms/form.service.js";
import { listActiveEntityTypeSummaries } from "../organization/organization.service.js";

export async function dataTypesHandler(req, res, next) {
  try {
    return ok(res, describeDataTypes());
  } catch (error) {
    return next(error);
  }
}

/*
 * Builders need the same reference lists on several screens. One bounded
 * endpoint avoids a fan-out of requests each time a configuration dialog opens.
 */
export async function lookupsHandler(req, res, next) {
  try {
    const [dropdowns, tables, forms, entityTypes] = await Promise.all([
      listActiveDropdownSummaries(),
      listActiveTableSummaries(),
      listActiveFormSummaries(),
      listActiveEntityTypeSummaries(),
    ]);

    return ok(res, { dropdowns, tables, forms, entityTypes });
  } catch (error) {
    return next(error);
  }
}
