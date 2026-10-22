import { ok, created, okList } from "../../lib/responses.js";
import { parsePagination, parseSearch } from "../../lib/pagination.js";
import {
  listTablesQuerySchema,
  createTableSchema,
  updateTableSchema,
  createColumnSchema,
  updateColumnSchema,
  reorderColumnsSchema,
  tableIdParamSchema,
  columnIdParamSchema,
} from "./table.validation.js";
import {
  listTables,
  getTable,
  createTable,
  updateTableDefinition,
  archiveTable,
  listColumns,
  addColumn,
  updateColumnDefinition,
  deleteColumn,
  archiveColumn,
  reorderTableColumns,
  getTableUsage,
} from "./table.service.js";

function actorFrom(req) {
  return {
    userId: req.currentUserId ?? req.session?.user?.id ?? null,
    ipAddress: req.ip || null,
    userAgent: req.get("user-agent") || null,
  };
}

export async function listTablesHandler(req, res, next) {
  try {
    const query = listTablesQuerySchema.parse(req.query);
    const pagination = parsePagination(query);

    const { tables, total } = await listTables({
      limit: pagination.limit,
      offset: pagination.offset,
      search: parseSearch(query) || undefined,
      status: query.status,
      storageKind: query.storageKind,
    });

    if (!query.includeColumns) {
      return okList(res, tables, pagination, total);
    }

    const withColumns = await Promise.all(
      tables.map((table) =>
        listColumns(table.id).then((columns) => ({ ...table, columns }))
      )
    );

    return okList(res, withColumns, pagination, total);
  } catch (error) {
    return next(error);
  }
}

export async function getTableHandler(req, res, next) {
  try {
    const { tableId } = tableIdParamSchema.parse(req.params);

    return ok(res, await getTable(tableId));
  } catch (error) {
    return next(error);
  }
}

export async function createTableHandler(req, res, next) {
  try {
    const payload = createTableSchema.parse(req.body);

    return created(res, await createTable(payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function updateTableHandler(req, res, next) {
  try {
    const { tableId } = tableIdParamSchema.parse(req.params);
    const payload = updateTableSchema.parse(req.body);

    return ok(res, await updateTableDefinition(tableId, payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function archiveTableHandler(req, res, next) {
  try {
    const { tableId } = tableIdParamSchema.parse(req.params);

    return ok(res, await archiveTable(tableId, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function tableUsageHandler(req, res, next) {
  try {
    const { tableId } = tableIdParamSchema.parse(req.params);

    return ok(res, await getTableUsage(tableId));
  } catch (error) {
    return next(error);
  }
}

export async function listColumnsHandler(req, res, next) {
  try {
    const { tableId } = tableIdParamSchema.parse(req.params);

    return ok(res, await listColumns(tableId));
  } catch (error) {
    return next(error);
  }
}

export async function addColumnHandler(req, res, next) {
  try {
    const { tableId } = tableIdParamSchema.parse(req.params);
    const payload = createColumnSchema.parse(req.body);

    return created(res, await addColumn(tableId, payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function updateColumnHandler(req, res, next) {
  try {
    const { tableId, columnId } = columnIdParamSchema.parse(req.params);
    const payload = updateColumnSchema.parse(req.body);

    return ok(
      res,
      await updateColumnDefinition(tableId, columnId, payload, actorFrom(req))
    );
  } catch (error) {
    return next(error);
  }
}

export async function archiveColumnHandler(req, res, next) {
  try {
    const { tableId, columnId } = columnIdParamSchema.parse(req.params);
    const permanent = req.query.permanent === "true" || req.query.permanent === true;

    return ok(res, await deleteColumn(tableId, columnId, { permanent }, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function reorderColumnsHandler(req, res, next) {
  try {
    const { tableId } = tableIdParamSchema.parse(req.params);
    const { columnIds } = reorderColumnsSchema.parse(req.body);

    return ok(res, await reorderTableColumns(tableId, columnIds, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}
