import { appError, badRequest } from "../../lib/appError.js";
import { isEncryptionConfigured, encryptSecret, decryptSecret, isEncryptedEnvelope } from "../../lib/encryption.js";
import { parseJsonColumn } from "../../lib/jsonColumn.js";
import { withTransaction } from "../../lib/transactions.js";
import { recordAudit } from "../audit/audit.service.js";

import { SMTP_SETTING_KEY } from "./settings.validation.js";
import { findSettingRow, upsertSetting } from "./settings.repository.js";
import { probeSmtp } from "./smtp.probe.js";

const DEFAULTS = {
  host: "",
  port: 587,
  secure: false,
  username: "",
  fromAddress: "",
  authMode: "password",
};

const EDITABLE_KEYS = Object.keys(DEFAULTS);

/*
 * The stored `smtp` row keeps its non-secret fields readable and the password
 * as an AES-256-GCM envelope inside the same JSON document, so one row describes
 * the whole mail transport while the credential alone is encrypted.
 */
function readStored(row) {
  const value = parseJsonColumn(row?.setting_value, {}) ?? {};

  const plain = {};

  for (const key of EDITABLE_KEYS) {
    if (value[key] !== undefined && value[key] !== null) plain[key] = value[key];
  }

  return {
    ...DEFAULTS,
    ...plain,
    envelope: isEncryptedEnvelope(value.password) ? value.password : null,
  };
}

function sanitize({ envelope, ...value }) {
  return {
    ...value,
    passwordConfigured: Boolean(envelope),
  };
}

export async function getSmtpSettings() {
  return sanitize(readStored(await findSettingRow(SMTP_SETTING_KEY)));
}

export async function listSettings() {
  return {
    smtp: await getSmtpSettings(),
    secretStorageConfigured: isEncryptionConfigured(),
  };
}

export async function updateSmtpSettings(patch, actor) {
  const row = await findSettingRow(SMTP_SETTING_KEY);
  const stored = readStored(row);

  const next = { ...stored };

  for (const key of EDITABLE_KEYS) {
    if (patch[key] !== undefined) next[key] = patch[key];
  }

  let passwordUpdated = false;
  let passwordCleared = false;

  if (patch.password !== undefined) {
    if (!isEncryptionConfigured()) {
      throw appError(503, "Secret storage is not configured on this server.", {
        code: "ENCRYPTION_NOT_CONFIGURED",
      });
    }

    next.envelope = encryptSecret(patch.password);
    passwordUpdated = true;
  }

  if (patch.clearPassword === true) {
    next.envelope = null;
    passwordCleared = true;
  }

  /*
   * Only the credential is encrypted; everything else is stored as plain JSON
   * so the read endpoint can show the current transport without a key.
   */
  const value = { ...next, password: next.envelope ?? null };

  delete value.envelope;

  if (value.host !== "" && !/^[\w.-]+$/.test(value.host)) {
    throw badRequest("The mail server host is not a valid hostname.", {
      code: "SMTP_HOST_INVALID",
      errors: { host: "Use a hostname such as smtp.example.com, without a scheme." },
    });
  }

  await withTransaction(async (connection) => {
    await upsertSetting(connection, {
      settingKey: SMTP_SETTING_KEY,
      value,
      isSecret: true,
      updatedBy: actor?.userId ?? null,
    });

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "settings.smtp.update",
      entityType: "settings",
      entityId: SMTP_SETTING_KEY,
      summary: {
        host: value.host,
        port: value.port,
        secure: value.secure,
        username: value.username,
        fromAddress: value.fromAddress,
        authMode: value.authMode,
        passwordUpdated,
        passwordCleared,
      },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  return sanitize(next);
}

/*
 * Reaches the configured server with the stored credential. The result says
 * which stage succeeded, because "host unreachable" and "wrong password" need
 * different fixes.
 */
export async function testSmtpSettings(actor) {
  const stored = readStored(await findSettingRow(SMTP_SETTING_KEY));

  if (!stored.host) {
    throw badRequest("Set the mail server host before running a test.", {
      code: "SMTP_HOST_REQUIRED",
      errors: { host: "Enter the mail server host." },
    });
  }

  const password = stored.envelope ? decryptSecret(stored.envelope) : null;

  const result = await probeSmtp({
    host: stored.host,
    port: stored.port,
    secure: stored.secure,
    username: stored.username,
    password,
    authMode: stored.authMode,
  });

  await recordAudit({
    actorUserId: actor?.userId ?? null,
    action: "settings.smtp.test",
    entityType: "settings",
    entityId: SMTP_SETTING_KEY,
    summary: {
      host: stored.host,
      port: stored.port,
      tls: result.tls,
      authAttempted: result.authAttempted,
      authAccepted: result.authAccepted,
    },
    ipAddress: actor?.ipAddress ?? null,
    userAgent: actor?.userAgent ?? null,
  });

  return { ...result, host: stored.host, port: stored.port };
}
