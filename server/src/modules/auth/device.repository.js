import { db } from "../../config/database.js";

export async function createDeviceRecord({
  userId,
  deviceTokenHash,
  userAgent = null,
}) {
  const [result] = await db.execute(
    `
      INSERT INTO user_devices (
        user_id,
        device_token_hash,
        user_agent
      )
      VALUES (?, ?, ?)
    `,
    [
      userId,
      deviceTokenHash,
      userAgent,
    ]
  );

  return result.insertId;
}

export async function findActiveDeviceByTokenHash(deviceTokenHash) {
  const [rows] = await db.execute(
    `
      SELECT
        id,
        user_id,
        device_token_hash,
        user_agent,
        created_at,
        last_seen_at,
        revoked_at
      FROM user_devices
      WHERE device_token_hash = ?
        AND revoked_at IS NULL
      LIMIT 1
    `,
    [deviceTokenHash]
  );

  return rows[0] || null;
}

export async function findActiveDeviceById(deviceId) {
  const [rows] = await db.execute(
    `
      SELECT
        id,
        user_id,
        device_token_hash,
        user_agent,
        created_at,
        last_seen_at,
        revoked_at
      FROM user_devices
      WHERE id = ?
        AND revoked_at IS NULL
      LIMIT 1
    `,
    [deviceId]
  );

  return rows[0] || null;
}

export async function updateDeviceLastSeen(deviceId) {
  await db.execute(
    `
      UPDATE user_devices
      SET last_seen_at = UTC_TIMESTAMP(3)
      WHERE id = ?
        AND revoked_at IS NULL
    `,
    [deviceId] 
  );
}

export async function revokeDevice(deviceId) {
  await db.execute(
    `
      UPDATE user_devices
      SET revoked_at = UTC_TIMESTAMP(3)
      WHERE id = ?
        AND revoked_at IS NULL
    `,
    [deviceId]
  );
}

export async function revokeAllUserDevices(userId) {
  await db.execute(
    `
      UPDATE user_devices
      SET revoked_at = UTC_TIMESTAMP(3)
      WHERE user_id = ?
        AND revoked_at IS NULL
    `,
    [userId]
  );
}