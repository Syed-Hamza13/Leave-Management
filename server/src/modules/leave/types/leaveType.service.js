import { notFound, conflict, badRequest } from "../../../lib/appError.js";
import { LEAVE_ERROR_CODES } from "../leave.constants.js";
import * as leaveTypeRepo from "./leaveType.repository.js";
import * as policyService from "../policy/policy.service.js";

export async function getLeaveTypeById(id) {
  const type = await leaveTypeRepo.findLeaveTypeById(id);
  if (!type) {
    throw notFound("Leave type not found", { code: LEAVE_ERROR_CODES.LEAVE_TYPE_NOT_FOUND });
  }
  return type;
}

export async function getLeaveTypesForPolicy(policyId) {
  await policyService.getPolicyById(policyId);
  return leaveTypeRepo.listLeaveTypesByPolicy(policyId);
}

export async function createNewLeaveType(data) {
  await policyService.getPolicyById(data.policyId);

  const existing = await leaveTypeRepo.findLeaveTypeByKey(data.policyId, data.typeKey);
  if (existing) {
    throw conflict("A leave type with this key already exists in this policy.", {
      code: LEAVE_ERROR_CODES.LEAVE_TYPE_IN_USE,
    });
  }

  const id = await leaveTypeRepo.createLeaveType(data);
  return getLeaveTypeById(id);
}

export async function updateExistingLeaveType(id, data) {
  await getLeaveTypeById(id);
  await leaveTypeRepo.updateLeaveType(id, data);
  return getLeaveTypeById(id);
}

export async function archiveLeaveType(id) {
  await getLeaveTypeById(id);
  await leaveTypeRepo.updateLeaveType(id, { status: "archived" });
  return { success: true };
}
