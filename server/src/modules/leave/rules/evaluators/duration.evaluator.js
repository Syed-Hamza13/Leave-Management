export async function evaluateDurationRule({ context, config }) {
  const { requestedUnits, calculatedUnits, leaveType } = context;
  const units = calculatedUnits ?? requestedUnits;

  const minDuration = config.minDuration ?? config.minimum;
  const maxDuration = config.maxDuration ?? config.maximum;

  const violations = [];

  if (minDuration !== undefined && units < minDuration) {
    violations.push(
      `Minimum leave duration is ${minDuration} ${config.unit || leaveType?.unit || "day"}(s). Requested: ${units}.`
    );
  }

  if (maxDuration !== undefined && units > maxDuration) {
    violations.push(
      `Maximum leave duration is ${maxDuration} ${config.unit || leaveType?.unit || "day"}(s). Requested: ${units}.`
    );
  }

  return {
    passed: violations.length === 0,
    violations,
    warnings: [],
    effects: { minDuration, maxDuration, units },
  };
}
