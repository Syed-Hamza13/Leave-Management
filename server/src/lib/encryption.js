import crypto from "node:crypto";

import { env } from "../config/env.js";
import { appError } from "./appError.js";

/*
 * AES-256-GCM envelope encryption for secret settings such as SMTP
 * credentials.
 *
 * Secrets are encrypted at rest, authenticated on read, and never returned by
 * any read endpoint. The key comes from the environment so rotating it is a
 * deployment operation rather than a code change.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const ENVELOPE_VERSION = 1;

function deriveKey() {
  const secret = env.ENCRYPTION_KEY;

  if (!secret) {
    throw appError(503, "Secret storage is not configured on this server.", {
      code: "ENCRYPTION_NOT_CONFIGURED",
    });
  }

  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function isEncryptionConfigured() {
  return Boolean(env.ENCRYPTION_KEY);
}

export function encryptSecret(plainText) {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(String(plainText), "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return {
    v: ENVELOPE_VERSION,
    alg: ALGORITHM,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

export function decryptSecret(envelope) {
  if (!envelope || typeof envelope !== "object") {
    throw appError(500, "Stored secret is malformed.", { code: "SECRET_MALFORMED" });
  }

  const key = deriveKey();

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(envelope.iv, "base64")
  );

  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));

  try {
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, "base64")),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch {
    throw appError(500, "Stored secret could not be decrypted.", {
      code: "SECRET_DECRYPT_FAILED",
    });
  }
}

export function isEncryptedEnvelope(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.v === ENVELOPE_VERSION &&
      typeof value.iv === "string" &&
      typeof value.tag === "string" &&
      typeof value.data === "string"
  );
}
