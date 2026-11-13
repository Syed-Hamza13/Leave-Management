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
  deleteUserRow,
  cleanupUserReferences,
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

export async function deleteUser(targetUserId, actor) {
  const userId = Number(targetUserId);
  if (actor?.userId && Number(actor.userId) === userId) {
    throw badRequest("You cannot delete your own account.", { code: "SELF_DELETION" });
  }

  const user = await getUser(userId);
  if (!user) {
    throw notFound("This user does not exist.", { code: "USER_NOT_FOUND" });
  }

  // Prevent deleting the last active account holding super_admin or admin
  const holdsElevated = user.roles.some((r) => ELEVATED_ROLE_KEYS.includes(r.key));
  if (holdsElevated && user.status === "active") {
    for (const roleKey of ELEVATED_ROLE_KEYS) {
      if (user.roles.some((r) => r.key === roleKey)) {
        const remaining = await findActiveAccountByRoleKeys([roleKey]);
        if (remaining.length <= 1 && remaining.includes(userId)) {
          throw conflict(`Cannot delete the last active ${roleKey} account.`, {
            code: "LAST_ADMIN_ACCOUNT",
          });
        }
      }
    }
  }

  await revokeAllUserSessions(userId);

  await withTransaction(async (conn) => {
    await deleteUserRow(conn, userId);
    await recordAudit({
      connection: conn,
      actorUserId: actor?.userId ?? null,
      action: "users.delete",
      entityType: "user",
      entityId: userId,
      summary: { email: user.email },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  return { id: userId, email: user.email };
}

export async function bulkDeleteUsers(userIds = [], actor) {
  const actorId = actor?.userId ? Number(actor.userId) : null;
  const filteredIds = userIds.map(Number).filter((id) => id > 0 && id !== actorId);

  if (filteredIds.length === 0) {
    throw badRequest("No valid accounts selected for deletion.");
  }

  // Ensure at least one active administrator remains
  const elevated = await findActiveAccountByRoleKeys(ELEVATED_ROLE_KEYS);
  const remainingElevated = elevated.filter((id) => !filteredIds.includes(id));
  if (elevated.length > 0 && remainingElevated.length === 0) {
    throw conflict("Cannot delete all active administrator accounts. At least one must remain.", {
      code: "LAST_ADMIN_ACCOUNT",
    });
  }

  const deleted = [];
  await withTransaction(async (conn) => {
    await cleanupUserReferences(conn, filteredIds);
    for (const userId of filteredIds) {
      await revokeAllUserSessions(userId);
      await deleteUserRow(conn, userId);
      deleted.push(userId);
    }

    await recordAudit({
      connection: conn,
      actorUserId: actorId,
      action: "users.bulk_delete",
      entityType: "user",
      entityId: null,
      summary: { count: deleted.length, userIds: deleted },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  return { deletedCount: deleted.length, deletedUserIds: deleted };
}

export async function bulkUpdateUsers({ userIds = [], status, roleKeys, profileValues = {}, clearFields = [] }, actor) {
  const actorId = actor?.userId ? Number(actor.userId) : null;
  const validIds = userIds.map(Number).filter((id) => id > 0);

  if (validIds.length === 0) {
    throw badRequest("No valid accounts selected for update.");
  }

  if (actorId && validIds.includes(actorId) && status && status !== "active") {
    throw forbidden("You cannot deactivate your own account.", {
      code: "SELF_DEACTIVATION_BLOCKED",
    });
  }

  if (status && status !== "active") {
    const elevated = await findActiveAccountByRoleKeys(ELEVATED_ROLE_KEYS);
    const remaining = elevated.filter((id) => !validIds.includes(id));
    if (elevated.length > 0 && remaining.length === 0) {
      throw conflict("Cannot deactivate all active administrator accounts. At least one must remain.", {
        code: "LAST_ADMIN_ACCOUNT",
      });
    }
  }

  if (roleKeys && !roleKeys.some((r) => ELEVATED_ROLE_KEYS.includes(r))) {
    const elevated = await findActiveAccountByRoleKeys(ELEVATED_ROLE_KEYS);
    const remaining = elevated.filter((id) => !validIds.includes(id));
    if (elevated.length > 0 && remaining.length === 0) {
      throw conflict("Cannot remove administrator privileges from all active admin accounts. At least one must remain.", {
        code: "LAST_ADMIN_ACCOUNT",
      });
    }
  }

  const usersTable = await findTableByKey("users");
  const allColumns = usersTable ? await findColumnsByTableId(usersTable.id, { includeArchived: false }) : [];
  const customColumns = allColumns.filter((col) => !col.isSystem);
  const customColumnsByKey = new Map(customColumns.map((col) => [col.key, col]));

  // Combine profileValues and clearFields
  const combinedProfileValues = { ...profileValues };
  for (const field of clearFields) {
    combinedProfileValues[field] = null;
  }

  let roleIds = null;
  if (Array.isArray(roleKeys) && roleKeys.length > 0) {
    roleIds = await getRoleIdsByKeys(roleKeys);
  }

  await withTransaction(async (conn) => {
    for (const userId of validIds) {
      // 1. Update status if provided
      if (status) {
        await updateUserStatus(conn, userId, status);
        if (status === "disabled") {
          await revokeAllUserSessions(userId);
        }
      }

      // 2. Update role if provided
      if (roleIds) {
        await replaceUserRoles(conn, userId, roleIds, actorId);
      }

      // 3. Update profile values if provided
      if (Object.keys(combinedProfileValues).length > 0) {
        await upsertUserProfileValues(conn, userId, combinedProfileValues, customColumnsByKey);
      }
    }

    await recordAudit({
      connection: conn,
      actorUserId: actorId,
      action: "users.bulk_update",
      entityType: "user",
      entityId: null,
      summary: {
        count: validIds.length,
        userIds: validIds,
        fieldsUpdated: Object.keys(combinedProfileValues),
        statusUpdated: status || null,
        rolesUpdated: roleKeys || null,
      },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  return { updatedCount: validIds.length, userIds: validIds };
}
