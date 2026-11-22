import { db } from "../../config/database.js";
import { parseJsonColumn, stringifyJsonColumn } from "../../lib/jsonColumn.js";
import { findColumnsByTableId } from "./table.repository.js";

/**
 * When a record in sourceTable is saved (created or updated),
 * sync any relation column that has config.syncTargetColumnKey
 * into the targetTable's record(s).
 */
export async function syncRelationOnWrite({
  connection,
  sourceTableId,
  sourceRecordId,
  values, // merged current values
  previousValues = {},
}) {
  const executor = connection || db;
  const columns = await findColumnsByTableId(sourceTableId, { includeArchived: false });
  const syncColumns = columns.filter(
    (c) =>
      c.status === "active" &&
      (c.dataType === "record_reference" || c.dataType === "user_reference") &&
      c.config?.syncTargetColumnKey &&
      (c.relationTableId || c.config?.targetTableId)
  );

  if (syncColumns.length === 0) return;

  for (const col of syncColumns) {
    const targetTableId = Number(col.relationTableId || col.config?.targetTableId);
    const syncKey = col.config.syncTargetColumnKey;
    const newVal = values[col.key];
    const oldVal = previousValues[col.key];

    const newTargetIds = new Set(
      (Array.isArray(newVal) ? newVal : newVal ? [newVal] : []).map(Number).filter((id) => id > 0)
    );
    const oldTargetIds = new Set(
      (Array.isArray(oldVal) ? oldVal : oldVal ? [oldVal] : []).map(Number).filter((id) => id > 0)
    );

    const numericSourceId = Number(sourceRecordId);

    // 1. Remove sourceRecordId from old targets that are no longer selected
    const removedTargetIds = [...oldTargetIds].filter((id) => !newTargetIds.has(id));
    for (const tId of removedTargetIds) {
      const [rows] = await executor.execute(
        `SELECT id, data FROM table_records WHERE table_id = ? AND id = ? LIMIT 1`,
        [targetTableId, tId]
      );
      if (rows.length > 0) {
        const data = parseJsonColumn(rows[0].data, {});
        let curMembers = data[syncKey];
        if (Array.isArray(curMembers)) {
          data[syncKey] = curMembers.filter((mId) => Number(mId) !== numericSourceId);
        } else if (Number(curMembers) === numericSourceId) {
          data[syncKey] = null;
        }
        await executor.execute(
          `UPDATE table_records SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [stringifyJsonColumn(data), tId]
        );
      }
    }

    // 2. Add sourceRecordId to newly selected targets
    for (const tId of newTargetIds) {
      const [rows] = await executor.execute(
        `SELECT id, data FROM table_records WHERE table_id = ? AND id = ? LIMIT 1`,
        [targetTableId, tId]
      );
      if (rows.length > 0) {
        const data = parseJsonColumn(rows[0].data, {});
        let curMembers = data[syncKey];
        if (Array.isArray(curMembers)) {
          if (!curMembers.some((mId) => Number(mId) === numericSourceId)) {
            data[syncKey] = [...curMembers, numericSourceId];
          }
        } else if (curMembers !== undefined && curMembers !== null && curMembers !== "") {
          data[syncKey] = Array.isArray(curMembers)
            ? [...curMembers, numericSourceId]
            : [curMembers, numericSourceId];
        } else {
          data[syncKey] = [numericSourceId];
        }
        await executor.execute(
          `UPDATE table_records SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [stringifyJsonColumn(data), tId]
        );
      }
    }
  }
}

/**
 * When a record in targetTable (e.g. Table_A / Teams) is updated directly:
 * If other tables (e.g. Table_B / Users) have relation columns that sync to targetTable's column
 * (e.g. syncTargetColumnKey === "members"),
 * update the linked column in those tables to reflect this record.
 */
export async function syncInverseRelationOnWrite({
  connection,
  tableId,
  recordId,
  values,
  previousValues = {},
}) {
  const executor = connection || db;
  const [rows] = await executor.execute(
    `
      SELECT
        cd.id,
        cd.table_id,
        cd.column_key,
        cd.config,
        td.storage_kind
      FROM column_definitions cd
      INNER JOIN table_definitions td ON td.id = cd.table_id
      WHERE (cd.relation_table_id = ? OR JSON_UNQUOTE(JSON_EXTRACT(cd.config, '$.targetTableId')) = ?)
        AND cd.status = 'active'
        AND td.status = 'active'
        AND JSON_UNQUOTE(JSON_EXTRACT(cd.config, '$.syncTargetColumnKey')) IS NOT NULL
    `,
    [tableId, String(tableId)]
  );

  if (rows.length === 0) return;

  const numericRecordId = Number(recordId);

  for (const row of rows) {
    const config = parseJsonColumn(row.config, {});
    const syncKey = config.syncTargetColumnKey;
    if (!syncKey || !(syncKey in values)) continue;

    const sourceTableId = Number(row.table_id);
    const sourceColKey = row.column_key;
    const isSystemUsers = row.storage_kind === "system_users";
    const isMultiple = Boolean(config.allowMultiple);

    const newMembers = new Set(
      (Array.isArray(values[syncKey]) ? values[syncKey] : values[syncKey] ? [values[syncKey]] : [])
        .map(Number)
        .filter((id) => id > 0)
    );
    const oldMembers = new Set(
      (Array.isArray(previousValues[syncKey]) ? previousValues[syncKey] : previousValues[syncKey] ? [previousValues[syncKey]] : [])
        .map(Number)
        .filter((id) => id > 0)
    );

    const added = [...newMembers].filter((id) => !oldMembers.has(id));
    const removed = [...oldMembers].filter((id) => !newMembers.has(id));

    // For added members: set their sourceColKey in sourceTable
    for (const memberId of added) {
      if (isSystemUsers) {
        const [valRows] = await executor.execute(
          `SELECT value FROM user_profile_values WHERE user_id = ? AND column_definition_id = ? LIMIT 1`,
          [memberId, row.id]
        );
        let cur = valRows.length > 0 ? parseJsonColumn(valRows[0].value, null) : null;
        let nextVal = isMultiple
          ? Array.from(new Set([...(Array.isArray(cur) ? cur : cur ? [cur] : []), numericRecordId]))
          : numericRecordId;

        await executor.execute(
          `INSERT INTO user_profile_values (user_id, column_definition_id, value)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP`,
          [memberId, row.id, JSON.stringify(nextVal)]
        );
      } else {
        const [recRows] = await executor.execute(
          `SELECT data FROM table_records WHERE table_id = ? AND id = ? LIMIT 1`,
          [sourceTableId, memberId]
        );
        if (recRows.length > 0) {
          const recData = parseJsonColumn(recRows[0].data, {});
          let cur = recData[sourceColKey];
          recData[sourceColKey] = isMultiple
            ? Array.from(new Set([...(Array.isArray(cur) ? cur : cur ? [cur] : []), numericRecordId]))
            : numericRecordId;
          await executor.execute(
            `UPDATE table_records SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [stringifyJsonColumn(recData), memberId]
          );
        }
      }
    }

    // For removed members: clear or remove numericRecordId
    for (const memberId of removed) {
      if (isSystemUsers) {
        const [valRows] = await executor.execute(
          `SELECT value FROM user_profile_values WHERE user_id = ? AND column_definition_id = ? LIMIT 1`,
          [memberId, row.id]
        );
        if (valRows.length > 0) {
          let cur = parseJsonColumn(valRows[0].value, null);
          if (Array.isArray(cur)) {
            const nextVal = cur.filter((id) => Number(id) !== numericRecordId);
            await executor.execute(
              `UPDATE user_profile_values SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND column_definition_id = ?`,
              [JSON.stringify(nextVal), memberId, row.id]
            );
          } else if (Number(cur) === numericRecordId) {
            await executor.execute(
              `DELETE FROM user_profile_values WHERE user_id = ? AND column_definition_id = ?`,
              [memberId, row.id]
            );
          }
        }
      } else {
        const [recRows] = await executor.execute(
          `SELECT data FROM table_records WHERE table_id = ? AND id = ? LIMIT 1`,
          [sourceTableId, memberId]
        );
        if (recRows.length > 0) {
          const recData = parseJsonColumn(recRows[0].data, {});
          let cur = recData[sourceColKey];
          if (Array.isArray(cur)) {
            recData[sourceColKey] = cur.filter((id) => Number(id) !== numericRecordId);
          } else if (Number(cur) === numericRecordId) {
            recData[sourceColKey] = null;
          }
          await executor.execute(
            `UPDATE table_records SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [stringifyJsonColumn(recData), memberId]
          );
        }
      }
    }
  }
}

/**
 * Hydrates live values for inverse relations so that if Table_A was modified,
 * Table_B records automatically reflect the linked record even before a write.
 */
export async function hydrateInverseRelationColumns({ tableId, records }) {
  if (!records || records.length === 0) return records;
  const columns = await findColumnsByTableId(tableId, { includeArchived: false });
  const syncColumns = columns.filter(
    (c) =>
      c.status === "active" &&
      (c.dataType === "record_reference" || c.dataType === "user_reference") &&
      c.config?.syncTargetColumnKey &&
      (c.relationTableId || c.config?.targetTableId)
  );

  if (syncColumns.length === 0) return records;

  for (const col of syncColumns) {
    const targetTableId = Number(col.relationTableId || col.config?.targetTableId);
    const syncKey = col.config.syncTargetColumnKey;
    const isMultiple = Boolean(col.config?.allowMultiple);

    // Fetch active target records
    const [targetRows] = await db.execute(
      `SELECT id, data FROM table_records WHERE table_id = ? AND status = 'active'`,
      [targetTableId]
    );

    // Map: sourceRecordId -> Array of targetRecordIds
    const targetIdsBySourceId = new Map();
    for (const tr of targetRows) {
      const data = parseJsonColumn(tr.data, {});
      const members = data[syncKey];
      if (members !== undefined && members !== null) {
        const list = Array.isArray(members) ? members : [members];
        for (const mId of list) {
          const numericMId = Number(mId);
          if (numericMId > 0) {
            if (!targetIdsBySourceId.has(numericMId)) {
              targetIdsBySourceId.set(numericMId, []);
            }
            targetIdsBySourceId.get(numericMId).push(Number(tr.id));
          }
        }
      }
    }

    // Apply to records
    for (const r of records) {
      const matched = targetIdsBySourceId.get(Number(r.id)) || [];
      if (matched.length > 0) {
        r.values[col.key] = isMultiple ? matched : matched[0];
      }
    }
  }

  return records;
}
