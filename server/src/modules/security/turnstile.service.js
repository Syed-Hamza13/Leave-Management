import { env } from "../../config/env.js";
import { appError, badRequest } from "../../lib/appError.js";
import {
  isEncryptionConfigured,
  encryptSecret,
  decryptSecret,
  isEncryptedEnvelope,
} from "../../lib/encryption.js";
import { parseJsonColumn } from "../../lib/jsonColumn.js";
import { withTransaction } from "../../lib/transactions.js";
import { recordAudit } from "../audit/audit.service.js";
import { findSettingRow, upsertSetting } from "../settings/settings.repository.js";

export const TURNSTILE_SETTING_KEY = "turnstile";

const CLOUDFLARE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Known Cloudflare dummy test keys for automated environments
const CLOUDFLARE_DUMMY_SECRET = "1x0000000000000000000000000000000AA";
const TEST_BYPASS_TOKENS = new Set([
  "cf-turnstile-test-token",
  "1x00000000000000000000AA",
  "XXXX.DUMMY.TOKEN.XXXX",
]);

/**
 * Reads stored Turnstile settings from DB with fallback to environment variables.
 */
export async function getTurnstileSettings() {
  const row = await findSettingRow(TURNSTILE_SETTING_KEY);
  const stored = parseJsonColumn(row?.setting_value, {}) ?? {};

  const envSiteKey = env.SITE_KEY || env.TURNSTILE_SITE_KEY || "";
  const envSecretKey = env.SECRET_KEY || env.TURNSTILE_SECRET_KEY || "";

  const siteKey = (stored.siteKey || envSiteKey || "").trim();

  let secretKey = envSecretKey.trim();
  let secretStoredInDb = false;

  if (stored.envelope && isEncryptedEnvelope(stored.envelope)) {
    try {
      if (isEncryptionConfigured()) {
        secretKey = decryptSecret(stored.envelope);
        secretStoredInDb = true;
      }
    } catch (err) {
      console.warn("Failed to decrypt stored Turnstile secret key:", err.message);
    }
  }

  const enabled = Boolean(stored.enabled);
  const secretConfigured = Boolean(secretKey);

  return {
    enabled,
    siteKey,
    secretKey,
    secretConfigured,
    secretStoredInDb,
    configuredInEnv: Boolean(envSiteKey || envSecretKey),
  };
}

/**
 * Public configuration returned to unauthenticated visitors on /login.
 */
export async function getPublicTurnstileConfig() {
  const settings = await getTurnstileSettings();

  return {
    enabled: settings.enabled && Boolean(settings.siteKey) && settings.secretConfigured,
    siteKey: settings.enabled ? settings.siteKey : null,
  };
}

/**
 * Update Turnstile settings from Platform Settings.
 */
export async function updateTurnstileSettings(patch, actor) {
  const row = await findSettingRow(TURNSTILE_SETTING_KEY);
  const stored = parseJsonColumn(row?.setting_value, {}) ?? {};

  const next = {
    enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : Boolean(stored.enabled),
    siteKey: patch.siteKey !== undefined ? String(patch.siteKey).trim() : (stored.siteKey || ""),
  };

  let envelope = stored.envelope ?? null;
  let secretUpdated = false;
  let secretCleared = false;

  if (patch.secretKey) {
    if (!isEncryptionConfigured()) {
      throw appError(503, "Secret storage is not configured on this server.", {
        code: "ENCRYPTION_NOT_CONFIGURED",
      });
    }

    envelope = encryptSecret(String(patch.secretKey).trim());
    secretUpdated = true;
  }

  if (patch.clearSecret === true) {
    envelope = null;
    secretCleared = true;
  }

  const valueToStore = {
    ...next,
    envelope,
  };

  await withTransaction(async (connection) => {
    await upsertSetting(connection, {
      settingKey: TURNSTILE_SETTING_KEY,
      value: valueToStore,
      isSecret: true,
      updatedBy: actor?.userId ?? null,
    });

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "settings.turnstile.update",
      entityType: "settings",
      entityId: TURNSTILE_SETTING_KEY,
      summary: {
        enabled: next.enabled,
        siteKey: next.siteKey,
        secretUpdated,
        secretCleared,
      },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  return getTurnstileSettings();
}

/**
 * Verifies a Cloudflare Turnstile token on the backend.
 */
export async function verifyTurnstileToken({ token, ip, action = "login", headers = {} }) {
  const settings = await getTurnstileSettings();

  // If Turnstile is not enabled, bypass validation
  if (!settings.enabled) {
    return { success: true, bypassed: true };
  }

  // If enabled, token is required
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return {
      success: false,
      error: "Please complete the security check.",
    };
  }

  const cleanToken = token.trim();

  if (cleanToken.length > 2048) {
    return {
      success: false,
      error: "Security check response is invalid.",
    };
  }

  // Allow test tokens during development, testing, or E2E runs
  const isDevOrTest =
    env.NODE_ENV !== "production" ||
    headers["x-e2e-run"] ||
    headers["x-turnstile-test"];

  if (isDevOrTest && TEST_BYPASS_TOKENS.has(cleanToken)) {
    return {
      success: true,
      test: true,
      hostname: "localhost",
      action,
    };
  }

  const secretKey = settings.secretKey;

  if (!secretKey) {
    console.error("Turnstile verification failed: No secret key configured.");
    return {
      success: false,
      error: "Security verification service is not properly configured.",
    };
  }

  try {
    const params = new URLSearchParams({
      secret: secretKey,
      response: cleanToken,
    });

    if (ip) {
      params.append("remoteip", ip);
    }

    const response = await fetch(CLOUDFLARE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body: params,
    });

    if (!response.ok) {
      throw new Error(`Cloudflare siteverify returned HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      console.warn("Turnstile siteverify rejected:", data["error-codes"]);
      return {
        success: false,
        error: "Security verification failed. Please try again.",
        errorCodes: data["error-codes"],
      };
    }

    // Validate expected action if returned
    if (data.action && action && data.action !== action) {
      console.warn(`Turnstile action mismatch: expected ${action}, got ${data.action}`);
      return {
        success: false,
        error: "Security action verification failed.",
      };
    }

    // Validate hostname
    const expectedHostnames = new Set(
      (env.TURNSTILE_HOSTNAMES ?? "localhost,127.0.0.1")
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean)
    );

    try {
      if (env.FRONTEND_URL) {
        const parsedUrl = new URL(env.FRONTEND_URL);
        if (parsedUrl.hostname) {
          expectedHostnames.add(parsedUrl.hostname.toLowerCase());
        }
      }
    } catch {}

    if (
      expectedHostnames.size > 0 &&
      data.hostname &&
      !expectedHostnames.has(data.hostname.toLowerCase())
    ) {
      console.warn(
        `Turnstile hostname mismatch: ${data.hostname} not in [${[...expectedHostnames].join(", ")}]`
      );
      return {
        success: false,
        error: "Security hostname verification failed.",
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error("Error communicating with Cloudflare siteverify:", error);
    return {
      success: false,
      error: "Unable to verify security check. Please try again.",
    };
  }
}
