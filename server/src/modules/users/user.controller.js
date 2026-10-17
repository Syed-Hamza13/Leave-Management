import { ok, created, okList, okMessage } from "../../lib/responses.js";
import { parsePagination, parseSearch, parseSort } from "../../lib/pagination.js";

import {
  createUserSchema,
  listUsersQuerySchema,
  setPasswordSchema,
  updateUserSchema,
  userIdParamSchema,
} from "./user.validation.js";
import { USER_SORT_KEYS } from "./user.repository.js";
import { createUser, getUser, listUsers, setUserPassword, updateUser } from "./user.service.js";

function actorFrom(req) {
  return {
    userId: req.currentUserId ?? req.session?.user?.id ?? null,
    ipAddress: req.ip || null,
    userAgent: req.get("user-agent") || null,
  };
}

export async function listUsersHandler(req, res, next) {
  try {
    const query = listUsersQuerySchema.parse(req.query);
    const pagination = parsePagination(query);

    const { users, total } = await listUsers({
      limit: pagination.limit,
      offset: pagination.offset,
      search: parseSearch(query) || undefined,
      status: query.status,
      role: query.role,
      sort: parseSort(query, USER_SORT_KEYS, [{ key: "createdAt", direction: "desc" }]),
    });

    return okList(res, users, pagination, total);
  } catch (error) {
    return next(error);
  }
}

export async function getUserHandler(req, res, next) {
  try {
    const { userId } = userIdParamSchema.parse(req.params);

    return ok(res, await getUser(userId));
  } catch (error) {
    return next(error);
  }
}

export async function createUserHandler(req, res, next) {
  try {
    const payload = createUserSchema.parse(req.body);

    return created(res, await createUser(payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function updateUserHandler(req, res, next) {
  try {
    const { userId } = userIdParamSchema.parse(req.params);
    const payload = updateUserSchema.parse(req.body);

    return ok(res, await updateUser(userId, payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function setUserPasswordHandler(req, res, next) {
  try {
    const { userId } = userIdParamSchema.parse(req.params);
    const { password } = setPasswordSchema.parse(req.body);

    const user = await setUserPassword(userId, password, actorFrom(req));

    return okMessage(
      res,
      "The password was set. That account has to sign in again.",
      user
    );
  } catch (error) {
    return next(error);
  }
}
