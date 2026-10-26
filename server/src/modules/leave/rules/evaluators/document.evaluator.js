export async function evaluateDocumentRule({ context, config }) {
  const { calculatedUnits, customData } = context;

  const requiredAfter = config.requiredAfterDays ?? 2;
  const isRequired = calculatedUnits >= requiredAfter;

  const hasAttachment = Boolean(
    customData?.documentUrl ||
    customData?.attachment ||
    customData?.medicalCertificate ||
    context.hasAttachment
  );

  if (isRequired && !hasAttachment) {
    return {
      passed: false,
      violations: [
        `Supporting document (${config.documentType || "certificate"}) is required for leave of ${requiredAfter} day(s) or more.`,
      ],
      warnings: [],
      effects: { documentRequired: true },
    };
  }

  return {
    passed: true,
    violations: [],
    warnings: [],
    effects: { documentRequired: isRequired },
  };
}
