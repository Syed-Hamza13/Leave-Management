import { getEvaluator } from "./rule.registry.js";
import { evaluateBalanceRule } from "./evaluators/balance.evaluator.js";

export async function evaluatePolicyRules(rules, context) {
  const allViolations = [];
  const allWarnings = [];
  const ruleResults = [];

  for (const rule of rules) {
    const evaluator = getEvaluator(rule.rule_type);
    if (!evaluator) continue;

    try {
      const result = await evaluator({
        context,
        config: rule.config_json || {},
      });

      ruleResults.push({
        ruleId: rule.id,
        ruleKey: rule.rule_key,
        ruleType: rule.rule_type,
        passed: result.passed,
        violations: result.violations || [],
        warnings: result.warnings || [],
        effects: result.effects || {},
      });

      if (!result.passed && result.violations) {
        allViolations.push(...result.violations);
      }
      if (result.warnings) {
        allWarnings.push(...result.warnings);
      }
    } catch (err) {
      allViolations.push(`Rule evaluation error (${rule.rule_key}): ${err.message}`);
    }
  }

  // Always evaluate balance rule if balance context is supplied
  if (context.balance !== undefined) {
    const balanceResult = await evaluateBalanceRule({ context, config: {} });
    ruleResults.push({
      ruleKey: "SYSTEM_BALANCE_CHECK",
      ruleType: "BALANCE",
      passed: balanceResult.passed,
      violations: balanceResult.violations || [],
      warnings: balanceResult.warnings || [],
      effects: balanceResult.effects || {},
    });
    if (!balanceResult.passed) {
      allViolations.push(...balanceResult.violations);
    }
  }

  return {
    passed: allViolations.length === 0,
    violations: allViolations,
    warnings: allWarnings,
    ruleResults,
  };
}
