import { badRequest, conflict, forbidden, notFound } from "../../lib/appError.js";
import { withTransaction } from "../../lib/transactions.js";
import { ROLES } from "../../lib/permissions.js";
import { hashPassword, validatePassword } from "../auth/password.policy.js";
import { revokeAllUserSessions } from "../auth/session.repository.js";
import { getRoleIdsByKeys } from "../authorization/permission.service.js";
import { replaceUserRoles } from "../authorization/permission.repository.js";
import { recordAudit } from "../audit/audit.service.js";

import { coerceValue } from "../../lib/dataTypes.js";
import { findTableByKey, findColumnsByTableId } from "../tables/table.repository.js";

import {
  countUsers,
  findActiveAccountByRoleKeys,
  findRolesForUserIds,
  findProfileValuesByUserIds,
  findUserRowById,
  findUserRowByEmail,
  findUsers,
  insertUser,
  updateUserPassword,
  updateUserProfile,
  updateUserStatus,
  upsertUserProfileValues,
} from "./user.repository.js";

/*
 * Roles that keep an installation reachable. Losing the last active account
 * holding one of them would leave nobody able to change configuration, so the
 * guards below refuse to remove it.
 */
const ELEVATED_ROLE_KEYS = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

function mapUser(row, roles = [], values = {}) {
  return {
    id: Number(row.id),
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    status: row.status,
    roles,
    values,
    lastLoginAt: row.last_login_at,
    passwordChangedAt: row.password_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function groupRoles(rows, userIds) {
  const byUserId = new Map(userIds.map((userId) => [Number(userId), []]));

  for (const row of rows) {
    const list = byUserId.get(Number(row.user_id));

    if (list) list.push({ key: row.role_key, label: row.label });
  }

  return byUserId;
}

function assertValidPassword(password) {
  const errors = validatePassword(password);

  if (errors.length > 0) {
    throw badRequest("The password does not meet the account policy.", {
      code: "PASSWORD_POLICY",
      errors: { password: errors },
    });
  }
}

export async function listUsers(query = {}) {
  const rows = await findUsers(query);
  const total = await countUsers(query);

  const userIds = rows.map((row) => row.id);

  const [rolesRows, profileValuesByUserId] = await Promise.all([
    findRolesForUserIds(userIds),
    findProfileValuesByUserIds(userIds),
  ]);

  const rolesByUserId = groupRoles(rolesRows, userIds);

  return {
    users: rows.map((row) =>
      mapUser(
        row,
        rolesByUserId.get(Number(row.id)) ?? [],
        profileValuesByUserId.get(Number(row.id)) ?? {}
      )
    ),
    total,
  };
}

export async function getUser(userId) {
  const row = await findUserRowById(userId);

  if (!row) {
    throw notFound("This user does not exist.", { code: "USER_NOT_FOUND" });
  }

  const [rolesRows, profileValuesByUserId] = await Promise.all([
    findRolesForUserIds([row.id]),
    findProfileValuesByUserIds([row.id]),
  ]);

  const rolesByUserId = groupRoles(rolesRows, [row.id]);

  return mapUser(
    row,
    rolesByUserId.get(Number(row.id)) ?? [],
    profileValuesByUserId.get(Number(row.id)) ?? {}
  );
}

export async function createUser(payload, actor) {
  assertValidPassword(payload.password);

  const taken = await findUserRowByEmail(payload.email);

  if (taken) {
    throw conflict(`"${payload.email}" already has an account.`, {
      code: "EMAIL_TAKEN",
      errors: { email: "An account with this email already exists." },
    });
  }

  const status = payload.status ?? "active";
  const roleKeys = payload.roleKeys ?? [];
  const passwordHash = await hashPassword(payload.password);

  const roleIds = await getRoleIdsByKeys(roleKeys);

  const usersTable = await findTableByKey("users");
  const allColumns = usersTable ? await findColumnsByTableId(usersTable.id, { includeArchived: false }) : [];
  const customColumns = allColumns.filter((col) => !col.isSystem);
  const customColumnsByKey = new Map(customColumns.map((col) => [col.key, col]));

  const validatedValues = {};
  const validationErrors = {};

  if (payload.values && typeof payload.values === "object") {
    for (const [key, rawValue] of Object.entries(payload.values)) {
      const col = customColumnsByKey.get(key);
      if (!col) continue;

      const result = coerceValue({
        typeKey: col.dataType,
        config: col.config,
        value: rawValue,
        required: col.isRequired,
        label: col.label,
      });

      if (!result.ok) {
        validationErrors[key] = result.message;
      } else {
        validatedValues[key] = result.value;
      }
    }
  }

  for (const col of customColumns) {
    if (col.isRequired && (validatedValues[col.key] === null || validatedValues[col.key] === undefined || validatedValues[col.key] === "")) {
      validationErrors[col.key] = `${col.label} is required.`;
    }
  }

  if (Object.keys(validationErrors).length > 0) {
    throw badRequest("Some custom fields are invalid.", {
      code: "INVALID_FIELD_VALUES",
      errors: validationErrors,
    });
  }

  const userId = await withTransaction(async (connection) => {
    const insertedId = await insertUser(connection, {
      email: payload.email,
      passwordHash,
      firstName: payload.firstName,
      lastName: payload.lastName,
      status,
    });

    if (roleIds.length > 0) {
      await replaceUserRoles(connection, insertedId, roleIds, actor?.userId ?? null);
    }

    if (Object.keys(validatedValues).length > 0) {
      await upsertUserProfileValues(connection, insertedId, validatedValues, customColumnsByKey);
    }

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "users.create",
      entityType: "user",
      entityId: insertedId,
      summary: { email: payload.email, status, roleKeys, valueKeys: Object.keys(validatedValues) },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });

    return insertedId;
  });

  return getUser(userId);
}

export async function updateUser(userId, patch, actor) {
  const current = await findUserRowById(userId);

  if (!current) {
    throw notFound("This user does not exist.", { code: "USER_NOT_FOUND" });
  }

  const wantsStatus = patch.status !== undefined && patch.status !== current.status;

  if (wantsStatus && patch.status !== "active") {
    if (Number(userId) === Number(actor?.userId)) {
      throw forbidden("You cannot deactivate your own account.", {
        code: "SELF_DEACTIVATION_BLOCKED",
      });
    }

    /*
     * Only an active account holding an elevated role counts towards the guard,
     * so disabling one of several administrators is always allowed.
     */
    const elevated = await findActiveAccountByRoleKeys(ELEVATED_ROLE_KEYS);

    if (elevated.length === 1 && elevated.includes(Number(current.id))) {
      throw forbidden(
        "This is the only active administrator account, so it cannot be deactivated.",
        { code: "LAST_ADMINISTRATOR_PROTECTED" }
      );
    }
  }

    let validatedValues = null;
  let customColumnsByKey = null;

  if (patch.values !== undefined && patch.values !== null) {
    const usersTable = await findTableByKey("users");
    const allColumns = usersTable ? await findColumnsByTableId(usersTable.id, { includeArchived: false }) : [];
    const customColumns = allColumns.filter((col) => !col.isSystem);
    customColumnsByKey = new Map(customColumns.map((col) => [col.key, col]));

    validatedValues = {};
    const validationErrors = {};

    for (const [key, rawValue] of Object.entries(patch.values)) {
      const col = customColumnsByKey.get(key);
      if (!col) continue;

      const result = coerceValue({
        typeKey: col.dataType,
        config: col.config,
        value: rawValue,
        required: false,
        label: col.label,
      });

      if (!result.ok) {
        validationErrors[key] = result.message;
      } else if (col.isRequired && (result.value === null || result.value === undefined || result.value === "")) {
        validationErrors[key] = `${col.label} is required and cannot be cleared.`;
      } else {
        validatedValues[key] = result.value;
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      throw badRequest("Some custom fields are invalid.", {
        code: "INVALID_FIELD_VALUES",
        errors: validationErrors,
      });
    }
  }

  await withTransaction(async (connection) => {
    if (patch.firstName !== undefined || patch.lastName !== undefined) {
      await updateUserProfile(connection, userId, {
        firstName: patch.firstName,
        lastName: patch.lastName,
      });
    }

    if (wantsStatus) {
      await updateUserStatus(connection, userId, patch.status);
    }

    if (validatedValues && customColumnsByKey) {
      await upsertUserProfileValues(connection, userId, validatedValues, customColumnsByKey);
    }

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "users.update",
      entityType: "user",
      entityId: userId,
      summary: {
        email: current.email,
        firstName: patch.firstName,
        lastName: patch.lastName,
        status: wantsStatus ? patch.status : undefined,
        valueKeys: validatedValues ? Object.keys(validatedValues) : undefined,
      },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  /*
   * A deactivated account must not keep working sessions. requireAuth already
   * refuses it on the next request; revoking here clears the registry too.
   */
  if (wantsStatus && patch.status !== "active") {
    await revokeAllUserSessions(userId);
  }

  return getUser(userId);
}

/*
 * An administrator sets a new password without knowing the old one. The stored
 * hash is replaced, the change is stamped so every earlier session of that
 * account stops validating, and the sessions are revoked explicitly.
 */
export async function setUserPassword(userId, password, actor) {
  assertValidPassword(password);

  const current = await findUserRowById(userId);

  if (!current) {
    throw notFound("This user does not exist.", { code: "USER_NOT_FOUND" });
  }

  const passwordHash = await hashPassword(password);

  await withTransaction(async (connection) => {
    await updateUserPassword(connection, userId, passwordHash);

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "users.password.set",
      entityType: "user",
      entityId: userId,
      summary: { email: current.email },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  await revokeAllUserSessions(userId);

  return getUser(userId);
}
