import {
  createSessionRecord,
  findSessionById,
  updateSessionLastSeen,
  revokeSession,
  markSessionExpired,
  revokeAllUserSessions,
  revokeOtherUserSessions,
} from "./session.repository.js";

export async function registerSession({
  userId,
  sessionId,
  userDeviceId,
  userAgent,
  ipAddress,
  expiresAt,
}) {
  return createSessionRecord({
    userId,
    sessionId,
    userDeviceId,
    userAgent,
    ipAddress,
    expiresAt,
  });
}

export async function getSession(sessionId) {
  return findSessionById(sessionId);
}

export async function validateSession(
  sessionId,
  userId,
  device,
  userAgent
) {
  const session = await findSessionById(sessionId);

  if (!session) {
    return {
      valid: false,
      reason: "NOT_FOUND",
    };
  }

  if (String(session.user_id) !== String(userId)) {
    return {
      valid: false,
      reason: "USER_MISMATCH",
    };
  }

  if (session.revoked_at) {
    return {
      valid: false,
      reason: "REVOKED",
    };
  }

  if (
    session.expires_at &&
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
    return {
      valid: false,
      reason: "EXPIRED",
    };
  }

  if (!session.user_device_id) {
    return {
      valid: false,
      reason: "DEVICE_NOT_BOUND",
    };
  }

  if (!device) {
    return {
      valid: false,
      reason: "DEVICE_MISSING",
    };
  }

  if (String(device.id) !== String(session.user_device_id)) {
    return {
      valid: false,
      reason: "DEVICE_MISMATCH",
    };
  }

  if (String(device.user_id) !== String(userId)) {
    return {
      valid: false,
      reason: "DEVICE_USER_MISMATCH",
    };
  }

  /*
   * User-Agent is intentionally NOT an authentication factor.
   *
   * It is client-controlled and changes legitimately (browser
   * updates, extensions, mobile/desktop environments), so treating
   * it as proof of identity causes false logouts.
   *
   * It stays here only as an audit/observability signal.
   */
  if (
    userAgent &&
    session.user_agent &&
    userAgent !== session.user_agent
  ) {
    console.log("ℹ️ USER-AGENT CHANGED FOR ACTIVE SESSION");
  }

  return {
    valid: true,
    session,
    device,
  };
}

export async function touchSession(sessionId) {
  return updateSessionLastSeen(sessionId);
}

export async function revokeSessionById(sessionId) {
  return revokeSession(sessionId);
}

export async function markSessionAsExpired(sessionId) {
  return markSessionExpired(sessionId);
}

export async function revokeAllSessions(userId) {
  return revokeAllUserSessions(userId);
}

export async function revokeOtherSessions(
  userId,
  currentSessionId
) {
  return revokeOtherUserSessions(
    userId,
    currentSessionId
  );
}