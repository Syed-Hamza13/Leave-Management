import { badRequest, forbidden, notFound } from "../../lib/appError.js";
import { withTransaction } from "../../lib/transactions.js";
import { ROLES } from "../../lib/permissions.js";
import { findUserById } from "../auth/auth.repository.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  findPermissionKeysByUserId,
  findRoleKeysByUserId,
  findAllRoles,
  replaceUserRoles,
  countAllRoleAssignments,
} from "./permission.repository.js";

const ADMIN_ROLE_KEYS = new Set([ROLES.SUPER_ADMIN, ROLES.ADMIN]);

export async function getUserPermissions(userId) {
  return findPermissionKeysByUserId(userId);
}

export async function getAuthorizationSummary(userId) {
  const [permissions, roles] = await Promise.all([
    findPermissionKeysByUserId(userId),
    findRoleKeysByUserId(userId),
  ]);

  return {
    permissions,
    roles: roles.map((role) => ({
      key: role.role_key,
      label: role.label,
    })),
  };
}

export async function listRoles() {
  const roles = await findAllRoles();

  return roles.map((role) => ({
    id: role.id,
    key: role.role_key,
    label: role.label,
    description: role.description,
    isSystem: Boolean(role.is_system),
    createdAt: role.created_at,
  }));
}

export async function assignRoles({ userId, roleKeys, actorUserId }) {
  const targetUser = await findUserById(userId);

  if (!targetUser) {
    throw notFound("User not found.", { code: "USER_NOT_FOUND" });
  }

  const roles = await findAllRoles();
  const byKey = new Map(roles.map((role) => [role.role_key, role]));

  const unknown = roleKeys.filter((key) => !byKey.has(key));

  if (unknown.length > 0) {
    throw badRequest(`Unknown role(s): ${unknown.join(", ")}.`, {
      code: "UNKNOWN_ROLE",
    });
  }

  const nextRoleIds = roleKeys.map((key) => byKey.get(key).id);

  /*
   * Lockout guard: an administrator may not strip their own elevated roles.
   * Without this a single mistaken save could leave the installation with no
   * account able to reach the administration screens.
   */
  if (String(userId) === String(actorUserId)) {
    const keepsAdmin = roleKeys.some((key) => ADMIN_ROLE_KEYS.has(key));

    if (!keepsAdmin) {
      throw forbidden("You cannot remove your own administrator access.", {
        code: "SELF_DEMOTION_BLOCKED",
      });
    }
  }

  await withTransaction(async (connection) => {
    await replaceUserRoles(connection, userId, nextRoleIds, actorUserId);

    await recordAudit({
      connection,
      actorUserId,
      action: "authorization.roles.assign",
      entityType: "user",
      entityId: userId,
      summary: { roleKeys },
    });
  });

  return getAuthorizationSummary(userId);
}

export async function getRoleIdsByKeys(roleKeys) {
  const roles = await findAllRoles();
  const byKey = new Map(roles.map((role) => [role.role_key, role]));

  return roleKeys
    .map((key) => byKey.get(key)?.id)
    .filter((id) => id !== undefined);
}

export async function ensureBootstrapAdministrator(userId) {
  /*
   * Promotion only happens while the installation has no role assignments at
   * all. Checking the signing-in user instead would hand super_admin to every
   * new account, so the guard is deliberately global.
   */
  const totalAssignments = await countAllRoleAssignments();

  if (totalAssignments > 0) return;

  const roleIds = await getRoleIdsByKeys([ROLES.SUPER_ADMIN]);

  if (roleIds.length === 0) return;

  await withTransaction(async (connection) => {
    await replaceUserRoles(connection, userId, roleIds, null);
  });
}
