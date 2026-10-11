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

export async function touchSession(sessionId) {
  return updateSessionLastSeen(sessionId);
}

export async function revokeSessionById(sessionId) {
  return revokeSession(sessionId);
}

export async function revokeAllSessions(userId) {
  return revokeAllUserSessions(userId);
}

export async function revokeOtherSessions(userId, currentSessionId) {
  return revokeOtherUserSessions(userId, currentSessionId);
}