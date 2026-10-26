import { notFound, badRequest } from "../../../lib/appError.js";
import { LEAVE_ERROR_CODES } from "../leave.constants.js";
import * as workflowRepo from "./workflow.repository.js";
import * as policyService from "../policy/policy.service.js";

export async function getWorkflowById(id) {
  const wf = await workflowRepo.findWorkflowById(id);
  if (!wf) {
    throw notFound("Leave workflow not found", { code: LEAVE_ERROR_CODES.LEAVE_WORKFLOW_NOT_FOUND });
  }
  const steps = await workflowRepo.listWorkflowSteps(id);
  return { ...wf, steps };
}

export async function getWorkflowsForPolicy(policyId) {
  await policyService.getPolicyById(policyId);
  const workflows = await workflowRepo.listWorkflowsForPolicy(policyId);
  const result = [];
  for (const wf of workflows) {
    const steps = await workflowRepo.listWorkflowSteps(wf.id);
    result.push({ ...wf, steps });
  }
  return result;
}

export async function createNewWorkflow(data) {
  await policyService.getPolicyById(data.policyId);
  const id = await workflowRepo.createWorkflow(data);
  return getWorkflowById(id);
}

export async function updateExistingWorkflow(id, data) {
  await getWorkflowById(id);
  await workflowRepo.updateWorkflow(id, data);
  return getWorkflowById(id);
}

export async function deleteWorkflow(id) {
  await getWorkflowById(id);
  await workflowRepo.deleteWorkflow(id);
  return { success: true };
}

export async function addWorkflowStep(data) {
  await getWorkflowById(data.workflowId);
  const id = await workflowRepo.createWorkflowStep(data);
  return { id, ...data };
}

export async function removeWorkflowStep(stepId) {
  await workflowRepo.deleteWorkflowStep(stepId);
  return { success: true };
}

/*
 * Resolves the applicable workflow definition for a leave application based on
 * duration tiers (e.g., 1-6, 7-29, 30+) and user categorization.
 */
export async function resolveWorkflowForApplication({ policyId, calculatedUnits, userCategory = null }) {
  const workflows = await getWorkflowsForPolicy(policyId);
  if (workflows.length === 0) return null;

  const units = Number(calculatedUnits || 1);

  // Look for exact tier match in conditions_json
  for (const wf of workflows) {
    const cond = wf.conditions_json || {};
    const min = cond.minDays ?? 0;
    const max = cond.maxDays ?? Infinity;

    const matchesDuration = units >= min && units <= max;
    const matchesCategory = !cond.category || !userCategory || cond.category.toLowerCase() === userCategory.toLowerCase();

    if (matchesDuration && matchesCategory) {
      return wf;
    }
  }

  // Fallback to first available workflow
  return workflows[0];
}

/*
 * Builds an immutable approval chain snapshot at submission time.
 */
export async function buildApprovalSnapshot(workflow, applicantUserId, connection) {
  const steps = workflow.steps || (await workflowRepo.listWorkflowSteps(workflow.id, connection));
  const snapshot = [];

  for (const step of steps) {
    const approvers = await workflowRepo.resolveStepApprovers(step, applicantUserId, connection);
    const primaryApprover = approvers[0] || null;

    snapshot.push({
      stepOrder: step.step_order,
      approverType: step.approver_type,
      approverUserId: primaryApprover ? primaryApprover.id : null,
      approverName: primaryApprover ? primaryApprover.name : "System / Administrator",
      approverEmail: primaryApprover ? primaryApprover.email : null,
      approverRoleKey: step.approver_config_json?.roleKey || null,
      approverEntityId: step.approver_config_json?.entityId || null,
      status: "PENDING",
    });
  }

  return snapshot;
}
