import { db } from "../../../config/database.js";
import { APPROVER_TYPE } from "../leave.constants.js";

export async function listWorkflowsForPolicy(policyId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT * FROM leave_workflows WHERE policy_id = ? AND status = 'active' ORDER BY id ASC`,
    [policyId]
  );
  return rows.map((r) => ({
    ...r,
    conditions_json: typeof r.conditions_json === "string" ? JSON.parse(r.conditions_json) : r.conditions_json,
  }));
}

export async function findWorkflowById(id, connection = db) {
  const [rows] = await connection.execute(
    `SELECT * FROM leave_workflows WHERE id = ?`,
    [id]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    ...r,
    conditions_json: typeof r.conditions_json === "string" ? JSON.parse(r.conditions_json) : r.conditions_json,
  };
}

export async function createWorkflow(data, connection = db) {
  const [result] = await connection.execute(
    `INSERT INTO leave_workflows (policy_id, workflow_key, name, description, conditions_json, status, version)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.policyId,
      data.workflowKey,
      data.name,
      data.description || null,
      data.conditionsJson ? JSON.stringify(data.conditionsJson) : null,
      data.status || "active",
      data.version || 1,
    ]
  );
  return result.insertId;
}

export async function updateWorkflow(id, data, connection = db) {
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
  if (data.conditionsJson !== undefined) {
    fields.push("conditions_json = ?");
    values.push(JSON.stringify(data.conditionsJson));
  }
  if (data.status !== undefined) {
    fields.push("status = ?");
    values.push(data.status);
  }

  if (fields.length === 0) return;

  values.push(id);
  await connection.execute(
    `UPDATE leave_workflows SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

export async function deleteWorkflow(id, connection = db) {
  await connection.execute(`DELETE FROM leave_workflows WHERE id = ?`, [id]);
}

export async function listWorkflowSteps(workflowId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT * FROM leave_workflow_steps WHERE workflow_id = ? ORDER BY step_order ASC, id ASC`,
    [workflowId]
  );
  return rows.map((r) => ({
    ...r,
    approver_config_json: typeof r.approver_config_json === "string" ? JSON.parse(r.approver_config_json) : r.approver_config_json,
  }));
}

export async function createWorkflowStep(data, connection = db) {
  const [result] = await connection.execute(
    `INSERT INTO leave_workflow_steps (workflow_id, step_order, approval_mode, approver_type, approver_config_json, timeout_hours)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.workflowId,
      data.stepOrder || 1,
      data.approvalMode || "SEQUENTIAL",
      data.approverType,
      JSON.stringify(data.approverConfigJson || {}),
      data.timeoutHours || null,
    ]
  );
  return result.insertId;
}

export async function deleteWorkflowStep(stepId, connection = db) {
  await connection.execute(`DELETE FROM leave_workflow_steps WHERE id = ?`, [stepId]);
}

/*
 * Resolves approvers for a given step based on the applicant's context.
 */
export async function resolveStepApprovers(step, applicantUserId, connection = db) {
  const config = step.approver_config_json || {};
  const approvers = [];

  switch (step.approver_type) {
    case APPROVER_TYPE.SPECIFIC_USER: {
      if (config.userId) {
        const [users] = await connection.execute(
          `SELECT id, name, email FROM users WHERE id = ? AND status = 'active'`,
          [config.userId]
        );
        if (users.length > 0) approvers.push(users[0]);
      }
      break;
    }

    case APPROVER_TYPE.USER_MANAGER: {
      // Find manager of applicant's primary entity or assigned lead
      const [managers] = await connection.execute(
        `SELECT u.id, COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) AS name, u.email
         FROM organization_entity_members m
         JOIN organization_entity_members mgr
           ON m.organization_entity_id = mgr.organization_entity_id
         JOIN users u ON mgr.user_id = u.id
         WHERE m.user_id = ?
           AND mgr.role IN ('manager', 'lead')
           AND mgr.user_id <> ?
           AND u.status = 'active'
         LIMIT 1`,
        [applicantUserId, applicantUserId]
      );
      if (managers.length > 0) approvers.push(managers[0]);
      break;
    }

    case APPROVER_TYPE.ENTITY_LEAD: {
      // If config specifies entityId, use that; otherwise use applicant's entity
      const entityId = config.entityId;
      if (entityId) {
        const [leads] = await connection.execute(
          `SELECT u.id, COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) AS name, u.email
           FROM organization_entity_members m
           JOIN users u ON m.user_id = u.id
           WHERE m.organization_entity_id = ? AND m.role = 'lead' AND u.status = 'active'`,
          [entityId]
        );
        approvers.push(...leads);
      } else {
        const [leads] = await connection.execute(
          `SELECT u.id, COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) AS name, u.email
           FROM organization_entity_members m
           JOIN organization_entity_members lead_m
             ON m.organization_entity_id = lead_m.organization_entity_id
           JOIN users u ON lead_m.user_id = u.id
           WHERE m.user_id = ?
             AND lead_m.role = 'lead'
             AND lead_m.user_id <> ?
             AND u.status = 'active'`,
          [applicantUserId, applicantUserId]
        );
        approvers.push(...leads);
      }
      break;
    }

    case APPROVER_TYPE.ROLE: {
      const roleKey = config.roleKey || "manager";
      const [users] = await connection.execute(
        `SELECT u.id, COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) AS name, u.email
         FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         JOIN users u ON ur.user_id = u.id
         WHERE r.role_key = ? AND u.status = 'active'`,
        [roleKey]
      );
      approvers.push(...users);
      break;
    }

    case APPROVER_TYPE.COMMITTEE: {
      if (config.entityId) {
        const [members] = await connection.execute(
          `SELECT u.id, COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) AS name, u.email
           FROM organization_entity_members m
           JOIN users u ON m.user_id = u.id
           WHERE m.organization_entity_id = ? AND u.status = 'active'`,
          [config.entityId]
        );
        approvers.push(...members);
      }
      break;
    }

    default:
      break;
  }

  // If no approver resolved, fallback to any available admin
  if (approvers.length === 0) {
    const [admins] = await connection.execute(
      `SELECT u.id, COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) AS name, u.email
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       JOIN users u ON ur.user_id = u.id
       WHERE r.role_key IN ('admin', 'super_admin') AND u.status = 'active'
       LIMIT 1`
    );
    if (admins.length > 0) approvers.push(admins[0]);
  }

  return approvers;
}
