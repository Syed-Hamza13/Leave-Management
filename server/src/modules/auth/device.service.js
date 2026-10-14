import crypto from "node:crypto";

import {
  createDeviceRecord,
  findActiveDeviceByTokenHash,
  findActiveDeviceById,
  updateDeviceLastSeen,
  revokeDevice,
  revokeAllUserDevices,
} from "./device.repository.js";

const DEVICE_TOKEN_BYTES = 32;

export function generateDeviceToken() {
  return crypto.randomBytes(DEVICE_TOKEN_BYTES).toString("base64url");
}

export function hashDeviceToken(deviceToken) {
  return crypto
    .createHash("sha256")
    .update(deviceToken, "utf8")
    .digest("hex");
}

export async function registerDevice({
  userId,
  deviceToken,
  userAgent,
}) {
  const deviceTokenHash = hashDeviceToken(deviceToken);

  const deviceId = await createDeviceRecord({
    userId,
    deviceTokenHash,
    userAgent,
  });

  return {
    deviceId,
    deviceToken,
  };
}

export async function getDeviceByToken(deviceToken) {
  if (!deviceToken) {
    return null;
  }

  const deviceTokenHash = hashDeviceToken(deviceToken);

  return findActiveDeviceByTokenHash(deviceTokenHash);
}

export async function getActiveDeviceById(deviceId) {
  if (!deviceId) {
    return null;
  }

  return findActiveDeviceById(deviceId);
}

export async function touchDevice(deviceId) {
  return updateDeviceLastSeen(deviceId);
}

export async function revokeDeviceById(deviceId) {
  return revokeDevice(deviceId);
}

export async function revokeAllDevices(userId) {
  return revokeAllUserDevices(userId);
}