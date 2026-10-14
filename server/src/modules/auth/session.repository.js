import { db } from "../../config/database.js";

export async function createSessionRecord({
  userId,
  sessionId,
  userDeviceId = null,
  userAgent = null,
  ipAddress = null,
  expiresAt = null,
}) {
  const [result] = await db.execute(
    `
      INSERT INTO user_sessions (
        user_id,
        user_device_id,
        session_id,
        user_agent,
        ip_address,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      userId,
      userDeviceId,
      sessionId,
      userAgent,
      ipAddress,
      expiresAt,
    ]
  );

  return result.insertId;
}

export async function findSessionById(sessionId) {
  const [rows] = await db.execute(
    `
      SELECT
        id,
        user_id,
        user_device_id,
        session_id,
        device_id,
        user_agent,
        ip_address,
        created_at,
        last_seen_at,
        expires_at,
        revoked_at
      FROM user_sessions
      WHERE session_id = ?
      LIMIT 1
    `,
    [sessionId]
  );

  return rows[0] || null;
}

export async function updateSessionLastSeen(sessionId) {
  await db.execute(
    `
      UPDATE user_sessions
      SET last_seen_at = UTC_TIMESTAMP(3)
      WHERE session_id = ?
        AND revoked_at IS NULL
    `,
    [sessionId]
  );
}

export async function revokeSession(sessionId) {
  await db.execute(
    `
      UPDATE user_sessions
      SET revoked_at = UTC_TIMESTAMP(3)
      WHERE session_id = ?
        AND revoked_at IS NULL
    `,
    [sessionId]
  );
}

export async function markSessionExpired(sessionId) {
  await db.execute(
    `
      UPDATE user_sessions
      SET revoked_at = UTC_TIMESTAMP(3)
      WHERE session_id = ?
        AND revoked_at IS NULL
    `,
    [sessionId]
  );
}

export async function revokeAllUserSessions(userId) {
  await db.execute(
    `
      UPDATE user_sessions
      SET revoked_at = UTC_TIMESTAMP(3)
      WHERE user_id = ?
        AND revoked_at IS NULL
    `,
    [userId]
  );
}

export async function revokeOtherUserSessions(userId, currentSessionId) {
  await db.execute(
    `
      UPDATE user_sessions
      SET revoked_at = UTC_TIMESTAMP(3)
      WHERE user_id = ?
        AND session_id <> ?
        AND revoked_at IS NULL
    `,
    [userId, currentSessionId]
  );
}