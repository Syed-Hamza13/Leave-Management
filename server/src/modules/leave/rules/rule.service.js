import { notFound } from "../../../lib/appError.js";
import { LEAVE_ERROR_CODES } from "../leave.constants.js";
import * as ruleRepo from "./rule.repository.js";
import * as policyService from "../policy/policy.service.js";

export async function getRuleById(id) {
  const rule = await ruleRepo.findRuleById(id);
  if (!rule) {
    throw notFound("Leave policy rule not found", { code: LEAVE_ERROR_CODES.LEAVE_RULE_NOT_FOUND });
  }
  return rule;
}

export async function getRulesForPolicy(policyId, leaveTypeId = null) {
  await policyService.getPolicyById(policyId);
  return ruleRepo.listRulesForPolicy(policyId, leaveTypeId);
}

export async function createNewRule(data) {
  await policyService.getPolicyById(data.policyId);
  const id = await ruleRepo.createRule(data);
  return getRuleById(id);
}

export async function updateExistingRule(id, data) {
  await getRuleById(id);
  await ruleRepo.updateRule(id, data);
  return getRuleById(id);
}

export async function deleteRule(id) {
  await getRuleById(id);
  await ruleRepo.deleteRule(id);
  return { success: true };
}
