export async function evaluateNoticeRule({ context, config }) {
  const { submissionDate, startDate, calculatedUnits, emergencyFlag } = context;

  if (emergencyFlag) {
    return {
      passed: true,
      warnings: ["Emergency application: notice period requirement waived."],
      violations: [],
      effects: { emergencyWaived: true },
    };
  }

  const sub = new Date(submissionDate);
  const start = new Date(startDate);
  const diffTime = start.getTime() - sub.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  let requiredNotice = config.noticeDays || 0;

  if (Array.isArray(config.tiers)) {
    for (const tier of config.tiers) {
      const min = tier.minDuration ?? 0;
      const max = tier.maxDuration ?? Infinity;
      if (calculatedUnits >= min && calculatedUnits <= max) {
        requiredNotice = tier.noticeDays;
        break;
      }
    }
  }

  if (diffDays < requiredNotice) {
    return {
      passed: false,
      violations: [
        `Leave requires at least ${requiredNotice} day(s) advance notice. Requested start is in ${diffDays < 0 ? 0 : diffDays} day(s).`,
      ],
      warnings: [],
      effects: { requiredNotice, diffDays },
    };
  }

  return {
    passed: true,
    violations: [],
    warnings: [],
    effects: { requiredNotice, diffDays },
  };
}
