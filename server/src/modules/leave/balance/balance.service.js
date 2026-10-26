import { notFound, badRequest, unprocessable } from "../../../lib/appError.js";
import { withTransaction } from "../../../lib/transactions.js";
import { recordAudit } from "../../audit/audit.service.js";
import { LEAVE_ERROR_CODES, TRANSACTION_TYPE } from "../leave.constants.js";
import * as balanceRepo from "./balance.repository.js";

export async function getUserBalances(userId) {
  return balanceRepo.listUserBalances(userId);
}

export async function getUserBalance(userId, leaveTypeId) {
  return balanceRepo.findUserBalance(userId, leaveTypeId);
}

export async function getAllBalances(query) {
  return balanceRepo.listAllBalances(query);
}

export async function getBalanceLedger(balanceId) {
  return balanceRepo.listBalanceTransactions(balanceId);
}

export async function initializeBalance(data, actorUserId = null) {
  return withTransaction(async (connection) => {
    const existing = await balanceRepo.findUserBalance(data.userId, data.leaveTypeId, connection);
    if (existing) {
      return existing;
    }

    const balanceId = await balanceRepo.createUserBalance(
      {
        ...data,
        closingBalance: data.openingBalance || 0,
      },
      connection
    );

    if (data.openingBalance > 0) {
      await balanceRepo.insertBalanceTransaction(
        {
          balanceId,
          userId: data.userId,
          transactionType: TRANSACTION_TYPE.OPENING,
          quantity: data.openingBalance,
          reference: "Initial period opening balance",
          createdBy: actorUserId,
        },
        connection
      );
    }

    await recordAudit({
      actorUserId,
      action: "LEAVE_BALANCE_INITIALIZED",
      entityType: "leave_balance",
      entityId: balanceId,
      summary: { userId: data.userId, leaveTypeId: data.leaveTypeId, opening: data.openingBalance },
      connection,
    });

    const [created] = await connection.execute(`SELECT * FROM leave_balances WHERE id = ?`, [balanceId]);
    return created[0];
  });
}

export async function adjustBalance({ balanceId, quantity, transactionType, reason, actorUserId }) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT * FROM leave_balances WHERE id = ? FOR UPDATE`,
      [balanceId]
    );

    if (rows.length === 0) {
      throw notFound("Leave balance not found", { code: LEAVE_ERROR_CODES.LEAVE_BALANCE_NOT_FOUND });
    }

    const current = rows[0];
    const newClosing = Number(current.closing_balance) + Number(quantity);

    if (newClosing < 0) {
      throw unprocessable("Adjustment would cause closing balance to fall below zero.", {
        code: LEAVE_ERROR_CODES.LEAVE_INSUFFICIENT_BALANCE,
        details: { currentBalance: current.closing_balance, adjustment: quantity },
      });
    }

    // Insert transaction
    await balanceRepo.insertBalanceTransaction(
      {
        balanceId,
        userId: current.user_id,
        transactionType,
        quantity,
        reference: reason,
        createdBy: actorUserId,
      },
      connection
    );

    // Update balance
    const currentAdjusted = Number(current.adjusted || 0);
    await balanceRepo.updateBalanceCounters(
      balanceId,
      {
        adjusted: currentAdjusted + Number(quantity),
        closingBalance: newClosing,
      },
      connection
    );

    await recordAudit({
      actorUserId,
      action: "LEAVE_BALANCE_ADJUSTED",
      entityType: "leave_balance",
      entityId: balanceId,
      summary: {
        userId: current.user_id,
        delta: quantity,
        type: transactionType,
        reason,
        oldClosing: current.closing_balance,
        newClosing,
      },
      connection,
    });

    const [updated] = await connection.execute(`SELECT * FROM leave_balances WHERE id = ?`, [balanceId]);
    return updated[0];
  });
}

export async function deductBalanceForApplication({ userId, leaveTypeId, units, applicationId, actorUserId }, connection) {
  const balance = await balanceRepo.findUserBalanceForUpdate(userId, leaveTypeId, connection);

  if (!balance) {
    throw notFound("No leave balance record found for user and leave type.", {
      code: LEAVE_ERROR_CODES.LEAVE_BALANCE_NOT_FOUND,
    });
  }

  // If leave type does not require balance (e.g. LWP or WFH), skip debit
  if (balance.requires_balance === 0) {
    return balance;
  }

  const currentAvailable = Number(balance.closing_balance);
  const needed = Number(units);

  if (currentAvailable < needed) {
    throw unprocessable(
      `Insufficient leave balance. Available: ${currentAvailable}, requested: ${needed}.`,
      {
        code: LEAVE_ERROR_CODES.LEAVE_INSUFFICIENT_BALANCE,
        details: { available: currentAvailable, needed },
      }
    );
  }

  const newConsumed = Number(balance.consumed || 0) + needed;
  const newClosing = currentAvailable - needed;

  await balanceRepo.insertBalanceTransaction(
    {
      balanceId: balance.id,
      userId,
      leaveApplicationId: applicationId,
      transactionType: TRANSACTION_TYPE.CONSUMPTION,
      quantity: -needed,
      reference: `Leave Application #${applicationId}`,
      createdBy: actorUserId,
    },
    connection
  );

  await balanceRepo.updateBalanceCounters(
    balance.id,
    {
      consumed: newConsumed,
      closingBalance: newClosing,
    },
    connection
  );

  await recordAudit({
    actorUserId,
    action: "LEAVE_BALANCE_CONSUMED",
    entityType: "leave_balance",
    entityId: balance.id,
    summary: { userId, units: needed, applicationId, closingBalance: newClosing },
    connection,
  });

  return { ...balance, consumed: newConsumed, closing_balance: newClosing };
}

export async function reverseBalanceForApplication({ userId, leaveTypeId, units, applicationId, reason, actorUserId }, connection) {
  const balance = await balanceRepo.findUserBalanceForUpdate(userId, leaveTypeId, connection);
  if (!balance) return null;

  if (balance.requires_balance === 0) return balance;

  const needed = Number(units);
  const newConsumed = Math.max(0, Number(balance.consumed || 0) - needed);
  const newClosing = Number(balance.closing_balance) + needed;

  await balanceRepo.insertBalanceTransaction(
    {
      balanceId: balance.id,
      userId,
      leaveApplicationId: applicationId,
      transactionType: TRANSACTION_TYPE.REVERSAL,
      quantity: needed,
      reference: reason || `Cancelled Application #${applicationId}`,
      createdBy: actorUserId,
    },
    connection
  );

  await balanceRepo.updateBalanceCounters(
    balance.id,
    {
      consumed: newConsumed,
      closingBalance: newClosing,
    },
    connection
  );

  await recordAudit({
    actorUserId,
    action: "LEAVE_BALANCE_REVERSED",
    entityType: "leave_balance",
    entityId: balance.id,
    summary: { userId, units: needed, applicationId, closingBalance: newClosing },
    connection,
  });

  return { ...balance, consumed: newConsumed, closing_balance: newClosing };
}
