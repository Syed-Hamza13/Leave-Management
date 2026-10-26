import { db } from "../../../config/database.js";

export async function findUserBalance(userId, leaveTypeId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT b.*, t.name AS leave_type_name, t.type_key, t.unit AS leave_unit
     FROM leave_balances b
     JOIN leave_types t ON b.leave_type_id = t.id
     WHERE b.user_id = ? AND b.leave_type_id = ?
     ORDER BY b.period_end DESC LIMIT 1`,
    [userId, leaveTypeId]
  );
  return rows[0] || null;
}

export async function findUserBalanceForUpdate(userId, leaveTypeId, connection) {
  const [rows] = await connection.execute(
    `SELECT b.*, t.name AS leave_type_name, t.type_key, t.unit AS leave_unit, t.requires_balance
     FROM leave_balances b
     JOIN leave_types t ON b.leave_type_id = t.id
     WHERE b.user_id = ? AND b.leave_type_id = ?
     ORDER BY b.period_end DESC LIMIT 1
     FOR UPDATE`,
    [userId, leaveTypeId]
  );
  return rows[0] || null;
}

export async function listUserBalances(userId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT b.*, t.name AS leave_type_name, t.type_key, t.unit AS leave_unit, t.paid_status
     FROM leave_balances b
     JOIN leave_types t ON b.leave_type_id = t.id
     WHERE b.user_id = ? AND t.status = 'active'
     ORDER BY t.sort_order ASC, t.id ASC`,
    [userId]
  );
  return rows;
}

export async function listAllBalances(query = {}, connection = db) {
  let sql = `SELECT b.*, COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) AS user_name, u.email AS user_email, t.name AS leave_type_name, t.type_key
             FROM leave_balances b
             JOIN users u ON b.user_id = u.id
             JOIN leave_types t ON b.leave_type_id = t.id
             WHERE 1=1`;
  const params = [];

  if (query.userId) {
    sql += ` AND b.user_id = ?`;
    params.push(query.userId);
  }
  if (query.leaveTypeId) {
    sql += ` AND b.leave_type_id = ?`;
    params.push(query.leaveTypeId);
  }

  sql += ` ORDER BY u.first_name ASC, t.sort_order ASC`;
  const [rows] = await connection.execute(sql, params);
  return rows;
}

export async function createUserBalance(data, connection = db) {
  const [result] = await connection.execute(
    `INSERT INTO leave_balances
       (user_id, leave_type_id, policy_id, period_start, period_end, opening_balance, accrued, carried_forward, adjusted, consumed, closing_balance, unit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.userId,
      data.leaveTypeId,
      data.policyId,
      data.periodStart,
      data.periodEnd,
      data.openingBalance || 0,
      data.accrued || 0,
      data.carriedForward || 0,
      data.adjusted || 0,
      data.consumed || 0,
      data.closingBalance !== undefined ? data.closingBalance : (data.openingBalance || 0),
      data.unit || "day",
    ]
  );
  return result.insertId;
}

export async function updateBalanceCounters(balanceId, updates, connection = db) {
  const fields = [];
  const values = [];

  if (updates.openingBalance !== undefined) {
    fields.push("opening_balance = ?");
    values.push(updates.openingBalance);
  }
  if (updates.accrued !== undefined) {
    fields.push("accrued = ?");
    values.push(updates.accrued);
  }
  if (updates.carriedForward !== undefined) {
    fields.push("carried_forward = ?");
    values.push(updates.carriedForward);
  }
  if (updates.adjusted !== undefined) {
    fields.push("adjusted = ?");
    values.push(updates.adjusted);
  }
  if (updates.consumed !== undefined) {
    fields.push("consumed = ?");
    values.push(updates.consumed);
  }
  if (updates.closingBalance !== undefined) {
    fields.push("closing_balance = ?");
    values.push(updates.closingBalance);
  }

  if (fields.length === 0) return;

  values.push(balanceId);
  await connection.execute(
    `UPDATE leave_balances SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

export async function insertBalanceTransaction(data, connection = db) {
  const [result] = await connection.execute(
    `INSERT INTO leave_balance_transactions
       (balance_id, user_id, leave_application_id, transaction_type, quantity, reference, metadata_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.balanceId,
      data.userId,
      data.leaveApplicationId || null,
      data.transactionType,
      data.quantity,
      data.reference || null,
      data.metadataJson ? JSON.stringify(data.metadataJson) : null,
      data.createdBy || null,
    ]
  );
  return result.insertId;
}

export async function listBalanceTransactions(balanceId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT t.*, COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) AS created_by_name
     FROM leave_balance_transactions t
     LEFT JOIN users u ON t.created_by = u.id
     WHERE t.balance_id = ?
     ORDER BY t.created_at DESC, t.id DESC`,
    [balanceId]
  );
  return rows.map((r) => ({
    ...r,
    metadata_json: typeof r.metadata_json === "string" ? JSON.parse(r.metadata_json) : r.metadata_json,
  }));
}
