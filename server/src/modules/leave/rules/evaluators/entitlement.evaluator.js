export async function evaluateEntitlementRule({ context, config }) {
  return {
    passed: true,
    violations: [],
    warnings: [],
    effects: {
      annualQuota: config.annualQuota || 0,
      accrualFrequency: config.accrual || "annual",
      unit: config.unit || "day",
    },
  };
}
