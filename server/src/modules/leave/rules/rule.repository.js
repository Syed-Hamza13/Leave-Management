import { db } from "../../../config/database.js";

export async function listRulesForPolicy(policyId, leaveTypeId = null, connection = db) {
  let sql = `SELECT * FROM leave_policy_rules WHERE policy_id = ? AND status = 'active'`;
  const params = [policyId];

  if (leaveTypeId) {
    sql += ` AND (leave_type_id = ? OR leave_type_id IS NULL)`;
    params.push(leaveTypeId);
  }

  sql += ` ORDER BY priority DESC, id ASC`;

  const [rows] = await connection.execute(sql, params);
  return rows.map((r) => ({
    ...r,
    config_json: typeof r.config_json === "string" ? JSON.parse(r.config_json) : r.config_json,
  }));
}

export async function findRuleById(id, connection = db) {
  const [rows] = await connection.execute(
    `SELECT * FROM leave_policy_rules WHERE id = ?`,
    [id]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    ...r,
    config_json: typeof r.config_json === "string" ? JSON.parse(r.config_json) : r.config_json,
  };
}

export async function createRule(data, connection = db) {
  const [result] = await connection.execute(
    `INSERT INTO leave_policy_rules (policy_id, leave_type_id, rule_key, rule_type, priority, config_json, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.policyId,
      data.leaveTypeId || null,
      data.ruleKey,
      data.ruleType,
      data.priority || 0,
      JSON.stringify(data.configJson),
      data.status || "active",
    ]
  );
  return result.insertId;
}

export async function updateRule(id, data, connection = db) {
  const fields = [];
  const values = [];

  if (data.ruleKey !== undefined) {
    fields.push("rule_key = ?");
    values.push(data.ruleKey);
  }
  if (data.ruleType !== undefined) {
    fields.push("rule_type = ?");
    values.push(data.ruleType);
  }
  if (data.leaveTypeId !== undefined) {
    fields.push("leave_type_id = ?");
    values.push(data.leaveTypeId);
  }
  if (data.priority !== undefined) {
    fields.push("priority = ?");
    values.push(data.priority);
  }
  if (data.configJson !== undefined) {
    fields.push("config_json = ?");
    values.push(JSON.stringify(data.configJson));
  }
  if (data.status !== undefined) {
    fields.push("status = ?");
    values.push(data.status);
  }

  if (fields.length === 0) return;

  values.push(id);
  await connection.execute(
    `UPDATE leave_policy_rules SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

export async function deleteRule(id, connection = db) {
  await connection.execute(`DELETE FROM leave_policy_rules WHERE id = ?`, [id]);
}
