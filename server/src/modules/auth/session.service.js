import {
  createSessionRecord,
  findSessionById,
  updateSessionLastSeen,
  revokeSession,
  revokeAllUserSessions,
  revokeOtherUserSessions,
} from "./session.repository.js";

export async function registerSession({
  userId,
  sessionId,
  deviceId,
  userAgent,
  ipAddress,
  expiresAt,
}) {
  return createSessionRecord({
    userId,
    sessionId,
    deviceId,
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
  deviceId,
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

  if (!deviceId || !session.device_id) {
    return {
      valid: false,
      reason: "DEVICE_ID_MISSING",
    };
  }

  if (session.device_id !== deviceId) {
    console.log(
      "🚨 DEVICE ID MISMATCH — SESSION REJECTED"
    );

    return {
      valid: false,
      reason: "DEVICE_MISMATCH",
    };
  }

  if (!userAgent || !session.user_agent) {
    return {
      valid: false,
      reason: "USER_AGENT_MISSING",
    };
  }

  if (session.user_agent !== userAgent) {
    console.log(
      "🚨 USER-AGENT MISMATCH — SESSION REJECTED"
    );

    return {
      valid: false,
      reason: "USER_AGENT_MISMATCH",
    };
  }

  return {
    valid: true,
    session,
  };
}

export async function touchSession(sessionId) {
  return updateSessionLastSeen(sessionId);
}

export async function revokeSessionById(sessionId) {
  return revokeSession(sessionId);
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