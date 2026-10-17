import argon2 from "argon2";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

/*
 * One set of Argon2 parameters for every writer, so a hash produced by the CLI
 * and one produced by the API verify the same way.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

export async function hashPassword(password) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

const PASSWORD_RULES = {
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  number: /[0-9]/,
  special: /[^A-Za-z0-9\s]/,
  whitespace: /\s/,
};

export function validatePassword(password) {
  const errors = [];

  if (typeof password !== "string") {
    return ["Password is required."];
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`
    );
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    errors.push(
      `Password must not exceed ${PASSWORD_MAX_LENGTH} characters.`
    );
  }

  if (!PASSWORD_RULES.uppercase.test(password)) {
    errors.push("Password must contain at least one uppercase letter.");
  }

  if (!PASSWORD_RULES.lowercase.test(password)) {
    errors.push("Password must contain at least one lowercase letter.");
  }

  if (!PASSWORD_RULES.number.test(password)) {
    errors.push("Password must contain at least one number.");
  }

  if (!PASSWORD_RULES.special.test(password)) {
    errors.push("Password must contain at least one special character.");
  }

  if (PASSWORD_RULES.whitespace.test(password)) {
    errors.push("Password must not contain spaces.");
  }

  return errors;
}

export function isValidPassword(password) {
  return validatePassword(password).length === 0;
}

export {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
};