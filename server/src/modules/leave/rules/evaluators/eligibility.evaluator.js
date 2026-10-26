export async function evaluateEligibilityRule({ context, config }) {
  const { user, userAttributes } = context;

  const violations = [];

  if (config.requiredRole && user?.role !== config.requiredRole) {
    violations.push(`User role '${user?.role}' does not match required role '${config.requiredRole}'.`);
  }

  if (config.minTenureDays && user?.created_at) {
    const tenureDays = Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24));
    if (tenureDays < config.minTenureDays) {
      violations.push(`Requires at least ${config.minTenureDays} days of service (current tenure: ${tenureDays} days).`);
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    warnings: [],
    effects: { eligible: violations.length === 0 },
  };
}
