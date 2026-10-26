import { RULE_TYPE } from "../leave.constants.js";
import { evaluateNoticeRule } from "./evaluators/notice.evaluator.js";
import { evaluateDurationRule } from "./evaluators/duration.evaluator.js";
import { evaluateSandwichRule } from "./evaluators/sandwich.evaluator.js";
import { evaluateDocumentRule } from "./evaluators/document.evaluator.js";
import { evaluateBalanceRule } from "./evaluators/balance.evaluator.js";
import { evaluateEntitlementRule } from "./evaluators/entitlement.evaluator.js";
import { evaluateEligibilityRule } from "./evaluators/eligibility.evaluator.js";

const EVALUATORS = {
  [RULE_TYPE.NOTICE_PERIOD]: evaluateNoticeRule,
  [RULE_TYPE.MIN_DURATION]: evaluateDurationRule,
  [RULE_TYPE.MAX_DURATION]: evaluateDurationRule,
  [RULE_TYPE.SANDWICH]: evaluateSandwichRule,
  [RULE_TYPE.DOCUMENT_REQUIRED]: evaluateDocumentRule,
  [RULE_TYPE.ENTITLEMENT]: evaluateEntitlementRule,
  [RULE_TYPE.ELIGIBILITY]: evaluateEligibilityRule,
};

export function getEvaluator(ruleType) {
  return EVALUATORS[ruleType] || null;
}
