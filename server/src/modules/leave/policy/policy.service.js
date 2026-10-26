import { notFound, badRequest, conflict } from "../../../lib/appError.js";
import { LEAVE_ERROR_CODES, POLICY_STATUS } from "../leave.constants.js";
import * as policyRepo from "./policy.repository.js";
import * as calendarService from "../calendars/calendar.service.js";

export async function getPolicyById(policyId) {
  const policy = await policyRepo.findPolicyById(policyId);
  if (!policy) {
    throw notFound("Leave policy not found", { code: LEAVE_ERROR_CODES.LEAVE_POLICY_NOT_FOUND });
  }
  return policy;
}

export async function getPolicyByKey(key) {
  return policyRepo.findPolicyByKey(key);
}

export async function getAllPolicies() {
  return policyRepo.listPolicies();
}

export async function createNewPolicy(data, userId) {
  const existing = await policyRepo.findPolicyByKey(data.policyKey);
  if (existing) {
    throw conflict("A leave policy with this key already exists.", {
      code: LEAVE_ERROR_CODES.LEAVE_POLICY_VERSION_CONFLICT,
    });
  }

  await calendarService.getCalendarById(data.calendarId);

  const id = await policyRepo.createPolicy({ ...data, createdBy: userId });
  return getPolicyById(id);
}

export async function updateExistingPolicy(policyId, data, userId) {
  const current = await getPolicyById(policyId);

  if (current.status === POLICY_STATUS.ARCHIVED) {
    throw badRequest("Cannot modify an archived leave policy.", {
      code: LEAVE_ERROR_CODES.LEAVE_INVALID_STATE,
    });
  }

  if (data.calendarId) {
    await calendarService.getCalendarById(data.calendarId);
  }

  await policyRepo.updatePolicy(policyId, { ...data, updatedBy: userId });
  return getPolicyById(policyId);
}

export async function publishPolicy(policyId, userId) {
  const policy = await getPolicyById(policyId);

  // If changing version, increment
  const nextVersion = policy.version + 1;
  await policyRepo.updatePolicy(policyId, {
    status: POLICY_STATUS.PUBLISHED,
    version: nextVersion,
    updatedBy: userId,
  });

  return getPolicyById(policyId);
}

export async function archivePolicy(policyId, userId) {
  const policy = await getPolicyById(policyId);
  await policyRepo.updatePolicy(policyId, {
    status: POLICY_STATUS.ARCHIVED,
    updatedBy: userId,
  });
  return getPolicyById(policyId);
}

export async function getPolicyForUser(userId) {
  const policy = await policyRepo.resolvePolicyForUser(userId);
  if (!policy) {
    throw notFound("No applicable leave policy found for user.", {
      code: LEAVE_ERROR_CODES.LEAVE_NOT_ELIGIBLE,
    });
  }
  return policy;
}

export async function getPolicyAssignments(policyId) {
  await getPolicyById(policyId);
  return policyRepo.findPolicyAssignments(policyId);
}

export async function addPolicyAssignment(data) {
  await getPolicyById(data.policyId);
  const id = await policyRepo.createPolicyAssignment(data);
  return { id, ...data };
}

export async function removePolicyAssignment(assignmentId) {
  await policyRepo.deletePolicyAssignment(assignmentId);
  return { success: true };
}
