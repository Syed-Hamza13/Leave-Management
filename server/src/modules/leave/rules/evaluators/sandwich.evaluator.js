export async function evaluateSandwichRule({ context, config }) {
  const { spanCalendarDays, nonWorkingDaysInRange } = context;

  const threshold = config.thresholdDays ?? 7;
  const includeSandwich = spanCalendarDays > threshold;

  return {
    passed: true,
    violations: [],
    warnings: includeSandwich
      ? [
          `Leave span is ${spanCalendarDays} calendar days (exceeds ${threshold} days). Intervening Sundays and holidays are counted as leave under the sandwich rule.`,
        ]
      : [],
    effects: {
      sandwichApplied: includeSandwich,
      threshold,
      interveningNonWorkingDaysCount: nonWorkingDaysInRange?.length || 0,
      countNonWorkingDaysAsLeave: includeSandwich,
    },
  };
}
