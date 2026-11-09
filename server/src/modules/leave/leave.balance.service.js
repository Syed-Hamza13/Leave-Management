import { db } from "../../config/database.js";
import { parseJsonColumn, stringifyJsonColumn } from "../../lib/jsonColumn.js";
import { findSectionConfigRow } from "../sections/sectionConfig.repository.js";
import { findTableByKey } from "../tables/table.repository.js";

/**
 * Resolves the tableId used for storing leave balances.
 * Looks first in section_config:leave-balance, then falls back to table_key 'leave_balances' or 'leave_balance'.
 */
export async function getLeaveBalanceTableId() {
  const sectionRow = await findSectionConfigRow("leave-balance");
  if (sectionRow && sectionRow.setting_value) {
    const parsed = parseJsonColumn(sectionRow.setting_value, null);
    if (parsed && parsed.tableId) {
      return Number(parsed.tableId);
    }
  }

  const table =
    (await findTableByKey("leave_balances")) ||
    (await findTableByKey("leave_balance"));

  return table ? Number(table.id) : null;
}

/**
 * Finds user balance record for a specific leave type and year.
 */
export async function findUserBalanceRecord({ userId, leaveType, year, tableId }) {
  const targetTableId = tableId || (await getLeaveBalanceTableId());
  if (!targetTableId) return null;

  const currentYear = year || new Date().getFullYear();

  const [rows] = await db.execute(
    `
      SELECT
        id,
        table_id,
        data,
        status,
        created_at,
        updated_at
      FROM table_records
      WHERE table_id = ?
        AND status = 'active'
        AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.user')) = ?
        AND (
          JSON_UNQUOTE(JSON_EXTRACT(data, '$.leave_type')) = ?
          OR JSON_UNQUOTE(JSON_EXTRACT(data, '$.leave_type')) LIKE ?
        )
      LIMIT 1
    `,
    [targetTableId, String(userId), String(leaveType), `%${leaveType}%`]
  );

  if (rows.length === 0) return null;

  return {
    id: Number(rows[0].id),
    tableId: Number(rows[0].table_id),
    values: parseJsonColumn(rows[0].data, {}),
    status: rows[0].status,
  };
}

/**
 * Checks if user has enough balance for the requested duration.
 */
export async function checkLeaveBalance({ userId, leaveType, days, session }) {
  const tableId = await getLeaveBalanceTableId();
  if (!tableId) {
    // If leave balance table is not yet configured, allow request with neutral status
    return { hasBalance: true, availableDays: null, balanceRecord: null };
  }

  const currentYear = new Date().getFullYear();
  const record = await findUserBalanceRecord({ userId, leaveType, year: currentYear, tableId });

  if (!record) {
    return {
      hasBalance: true, // If no individual record found yet, proceed without blocking
      availableDays: null,
      balanceRecord: null,
      message: "No initial balance record found; request will proceed subject to approval.",
    };
  }

  const isShortLeave = session === "short_leave" || String(leaveType).toLowerCase().includes("short");
  if (isShortLeave) {
    const slotsRemaining = Number(record.values.short_leave_slots_remaining ?? record.values.slots_remaining ?? 24);
    const hasBalance = slotsRemaining > 0;
    return {
      hasBalance,
      availableDays: slotsRemaining,
      isShortLeave: true,
      balanceRecord: record,
      message: hasBalance
        ? `${slotsRemaining} short leave slot(s) remaining.`
        : "Short leave quota of 24 slots has been exhausted for this year.",
    };
  }

  const availableDays = Number(
    record.values.closing_balance ??
    record.values.balance ??
    record.values.remaining_leaves ??
    0
  );

  const hasBalance = availableDays >= days;

  return {
    hasBalance,
    availableDays,
    balanceRecord: record,
    message: hasBalance
      ? `Available balance: ${availableDays} days.`
      : `Insufficient balance: requested ${days} days, available balance is ${availableDays} days.`,
  };
}

/**
 * Deducts approved leave days from the user's balance ledger within a transaction.
 */
export async function deductLeaveBalance(executor, { userId, leaveType, days, session, actorUserId }) {
  const tableId = await getLeaveBalanceTableId();
  if (!tableId) return null;

  const currentYear = new Date().getFullYear();
  const record = await findUserBalanceRecord({ userId, leaveType, year: currentYear, tableId });
  if (!record) return null;

  const currentValues = { ...record.values };
  const isShortLeave = session === "short_leave" || String(leaveType).toLowerCase().includes("short");

  if (isShortLeave) {
    const currentTaken = Number(currentValues.short_leaves_taken || 0);
    const slotsRemaining = Number(currentValues.short_leave_slots_remaining ?? 24);
    currentValues.short_leaves_taken = currentTaken + 1;
    currentValues.short_leave_slots_remaining = Math.max(0, slotsRemaining - 1);
  } else {
    const availed = Number(currentValues.availed || 0) + Number(days);
    const opening = Number(currentValues.opening_balance || 0);
    const accrued = Number(currentValues.accrued || 0);
    const closing = opening + accrued - availed;

    currentValues.availed = availed;
    currentValues.closing_balance = closing;
  }

  await executor.execute(
    `
      UPDATE table_records
      SET data = ?, updated_by = ?
      WHERE id = ?
    `,
    [stringifyJsonColumn(currentValues), actorUserId ?? null, record.id]
  );

  return currentValues;
}

