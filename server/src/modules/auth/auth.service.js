import argon2 from "argon2";
import {
  findUserByEmail,
  findUserById,
  updateLastLogin,
} from "./auth.repository.js";

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    status: user.status,
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

export async function loginUser({ email, password }) {
  const normalizedEmail = email.toLowerCase();

  const user = await findUserByEmail(normalizedEmail);

  // Same generic error whether user doesn't exist
  // or password is incorrect.
  if (!user) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  if (user.status !== "active") {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  const passwordValid = await argon2.verify(
    user.password_hash,
    password
  );

  if (!passwordValid) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  await updateLastLogin(user.id);

  return sanitizeUser(user);
}

export async function getCurrentUser(userId) {
  const user = await findUserById(userId);

  if (!user || user.status !== "active") {
    return null;
  }

  return sanitizeUser(user);
}