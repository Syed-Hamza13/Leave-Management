import { db } from "../../config/database.js";
import { stringifyJsonColumn, parseJsonColumn } from "../../lib/jsonColumn.js";
import { limitClause } from "../../lib/pagination.js";

export async function insertAuditEvent(executor, event) {
  const [result] = await executor.execute(
    `
      INSERT INTO audit_events
        (actor_user_id, action, entity_type, entity_id, summary, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      event.actorUserId ?? null,
      event.action,
      event.entityType,
      event.entityId != null ? String(event.entityId) : null,
      stringifyJsonColumn(event.summary ?? null),
      event.ipAddress ?? null,
      event.userAgent ?? null,
    ]
  );

  return result.insertId;
}

function buildAuditFilters(query = {}) {
  const conditions = [];
  const params = [];

  if (query.action) {
    conditions.push("action = ?");
    params.push(query.action);
  }

  if (query.entityType) {
    conditions.push("entity_type = ?");
    params.push(query.entityType);
  }

  if (query.entityId) {
    conditions.push("entity_id = ?");
    params.push(String(query.entityId));
  }

  if (query.actorUserId) {
    conditions.push("actor_user_id = ?");
    params.push(query.actorUserId);
  }

  if (query.from) {
    conditions.push("created_at >= ?");
    params.push(query.from);
  }

  if (query.to) {
    conditions.push("created_at <= ?");
    params.push(query.to);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

export async function findAuditEvents(query) {
  const { where, params } = buildAuditFilters(query);

  const [rows] = await db.execute(
    `
      SELECT
        a.id,
        a.actor_user_id,
        u.email AS actor_email,
        a.action,
        a.entity_type,
        a.entity_id,
        a.summary,
        a.ip_address,
        a.created_at
      FROM audit_events a
      LEFT JOIN users u ON u.id = a.actor_user_id
      ${where}
      ORDER BY a.id DESC
      ${limitClause(query.limit, query.offset)}
    `,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: parseJsonColumn(row.summary, null),
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  }));
}

export async function countAuditEvents(query) {
  const { where, params } = buildAuditFilters(query);

  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM audit_events
      ${where}
    `,
    params
  );

  return Number(rows[0]?.total || 0);
}
