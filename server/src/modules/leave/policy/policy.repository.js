import { db } from "../../../config/database.js";

export async function findDefaultPolicy(connection = db) {
  const [rows] = await connection.execute(
    `SELECT * FROM leave_policies WHERE is_default = 1 AND status = 'published' LIMIT 1`
  );
  if (rows.length > 0) return rows[0];

  const [fallback] = await connection.execute(
    `SELECT * FROM leave_policies WHERE status = 'published' ORDER BY id ASC LIMIT 1`
  );
  return fallback[0] || null;
}

export async function findPolicyById(policyId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT * FROM leave_policies WHERE id = ?`,
    [policyId]
  );
  return rows[0] || null;
}

export async function findPolicyByKey(key, connection = db) {
  const [rows] = await connection.execute(
    `SELECT * FROM leave_policies WHERE policy_key = ?`,
    [key]
  );
  return rows[0] || null;
}

export async function listPolicies(connection = db) {
  const [rows] = await connection.execute(
    `SELECT p.*, c.name AS calendar_name
     FROM leave_policies p
     LEFT JOIN leave_calendars c ON p.calendar_id = c.id
     ORDER BY p.is_default DESC, p.id DESC`
  );
  return rows;
}

export async function createPolicy(data, connection = db) {
  const [result] = await connection.execute(
    `INSERT INTO leave_policies
       (policy_key, name, description, calendar_id, status, version, effective_from, effective_to, is_default, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.policyKey,
      data.name,
      data.description || null,
      data.calendarId,
      data.status || "draft",
      data.version || 1,
      data.effectiveFrom,
      data.effectiveTo || null,
      data.isDefault ? 1 : 0,
      data.createdBy || null,
    ]
  );
  return result.insertId;
}

export async function updatePolicy(policyId, data, connection = db) {
  const fields = [];
  const values = [];

  if (data.name !== undefined) {
    fields.push("name = ?");
    values.push(data.name);
  }
  if (data.description !== undefined) {
    fields.push("description = ?");
    values.push(data.description);
  }
  if (data.calendarId !== undefined) {
    fields.push("calendar_id = ?");
    values.push(data.calendarId);
  }
  if (data.status !== undefined) {
    fields.push("status = ?");
    values.push(data.status);
  }
  if (data.version !== undefined) {
    fields.push("version = ?");
    values.push(data.version);
  }
  if (data.effectiveFrom !== undefined) {
    fields.push("effective_from = ?");
    values.push(data.effectiveFrom);
  }
  if (data.effectiveTo !== undefined) {
    fields.push("effective_to = ?");
    values.push(data.effectiveTo);
  }
  if (data.isDefault !== undefined) {
    fields.push("is_default = ?");
    values.push(data.isDefault ? 1 : 0);
  }
  if (data.updatedBy !== undefined) {
    fields.push("updated_by = ?");
    values.push(data.updatedBy);
  }

  if (fields.length === 0) return;

  values.push(policyId);
  await connection.execute(
    `UPDATE leave_policies SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

export async function findPolicyAssignments(policyId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT * FROM leave_policy_assignments WHERE policy_id = ? ORDER BY priority DESC`,
    [policyId]
  );
  return rows;
}

export async function createPolicyAssignment(data, connection = db) {
  const [result] = await connection.execute(
    `INSERT INTO leave_policy_assignments (policy_id, user_id, organization_entity_id, conditions_json, priority, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.policyId,
      data.userId || null,
      data.organizationEntityId || null,
      data.conditionsJson ? JSON.stringify(data.conditionsJson) : null,
      data.priority || 0,
      data.status || "active",
    ]
  );
  return result.insertId;
}

export async function deletePolicyAssignment(assignmentId, connection = db) {
  await connection.execute(
    `DELETE FROM leave_policy_assignments WHERE id = ?`,
    [assignmentId]
  );
}

export async function resolvePolicyForUser(userId, connection = db) {
  // Check direct user assignment
  const [userAssigned] = await connection.execute(
    `SELECT p.*
     FROM leave_policy_assignments a
     JOIN leave_policies p ON a.policy_id = p.id
     WHERE a.user_id = ? AND a.status = 'active' AND p.status = 'published'
     ORDER BY a.priority DESC, a.id DESC LIMIT 1`,
    [userId]
  );
  if (userAssigned.length > 0) return userAssigned[0];

  // Check organization entity memberships
  const [entityAssigned] = await connection.execute(
    `SELECT p.*
     FROM organization_entity_members m
     JOIN leave_policy_assignments a ON a.organization_entity_id = m.organization_entity_id
     JOIN leave_policies p ON a.policy_id = p.id
     WHERE m.user_id = ? AND m.status = 'active' AND a.status = 'active' AND p.status = 'published'
     ORDER BY a.priority DESC, a.id DESC LIMIT 1`,
    [userId]
  );
  if (entityAssigned.length > 0) return entityAssigned[0];

  // Return default published policy
  return findDefaultPolicy(connection);
}
