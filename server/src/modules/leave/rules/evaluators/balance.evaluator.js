export async function evaluateBalanceRule({ context, config }) {
  const { balance, calculatedUnits, leaveType } = context;

  if (leaveType && leaveType.requires_balance === 0) {
    return {
      passed: true,
      violations: [],
      warnings: [],
      effects: { balanceRequired: false },
    };
  }

  const available = Number(balance?.closing_balance ?? 0);
  const needed = Number(calculatedUnits ?? 0);

  if (available < needed) {
    return {
      passed: false,
      violations: [
        `Insufficient leave balance. Available: ${available} ${leaveType?.unit || "day"}(s), requested: ${needed}.`,
      ],
      warnings: [],
      effects: { available, needed, deficit: needed - available },
    };
  }

  return {
    passed: true,
    violations: [],
    warnings: [],
    effects: { available, needed, remainingAfter: available - needed },
  };
}
