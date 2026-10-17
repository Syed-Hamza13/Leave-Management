import { z } from "zod";

import { ok, created, okList } from "../../lib/responses.js";
import { parsePagination, parseSearch } from "../../lib/pagination.js";
import {
  listFormsQuerySchema,
  createFormSchema,
  updateFormSchema,
  formIdParamSchema,
} from "./form.validation.js";
import {
  listForms,
  getForm,
  getRenderableForm,
  createForm,
  updateFormDefinition,
  archiveForm,
  reorderFormFields,
  getFormUsage,
} from "./form.service.js";

const reorderSchema = z.object({
  fieldIds: z.array(z.coerce.number().int().positive()).min(1).max(100),
});

function actorFrom(req) {
  return {
    userId: req.currentUserId ?? req.session?.user?.id ?? null,
    ipAddress: req.ip || null,
    userAgent: req.get("user-agent") || null,
  };
}

export async function listFormsHandler(req, res, next) {
  try {
    const query = listFormsQuerySchema.parse(req.query);
    const pagination = parsePagination(query);

    const { forms, total } = await listForms({
      limit: pagination.limit,
      offset: pagination.offset,
      search: parseSearch(query) || undefined,
      status: query.status,
    });

    if (!query.includeFields) {
      return okList(res, forms, pagination, total);
    }

    const withFields = await Promise.all(
      forms.map((form) =>
        getForm(form.id).then((full) => ({ ...form, fields: full.fields }))
      )
    );

    return okList(res, withFields, pagination, total);
  } catch (error) {
    return next(error);
  }
}

export async function getFormHandler(req, res, next) {
  try {
    const { formId } = formIdParamSchema.parse(req.params);

    return ok(res, await getForm(formId));
  } catch (error) {
    return next(error);
  }
}

export async function getRenderableFormHandler(req, res, next) {
  try {
    const { formId } = formIdParamSchema.parse(req.params);

    return ok(res, await getRenderableForm(formId));
  } catch (error) {
    return next(error);
  }
}

export async function createFormHandler(req, res, next) {
  try {
    const payload = createFormSchema.parse(req.body);

    return created(res, await createForm(payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function updateFormHandler(req, res, next) {
  try {
    const { formId } = formIdParamSchema.parse(req.params);
    const payload = updateFormSchema.parse(req.body);

    return ok(res, await updateFormDefinition(formId, payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function archiveFormHandler(req, res, next) {
  try {
    const { formId } = formIdParamSchema.parse(req.params);

    return ok(res, await archiveForm(formId, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function formUsageHandler(req, res, next) {
  try {
    const { formId } = formIdParamSchema.parse(req.params);

    return ok(res, await getFormUsage(formId));
  } catch (error) {
    return next(error);
  }
}

export async function reorderFormFieldsHandler(req, res, next) {
  try {
    const { formId } = formIdParamSchema.parse(req.params);
    const { fieldIds } = reorderSchema.parse(req.body);

    return ok(res, await reorderFormFields(formId, fieldIds, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}
