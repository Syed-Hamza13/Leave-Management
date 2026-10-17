/*
 * Zod request validation middleware factory.
 *
 * Every write endpoint declares its schema here so parsing stays out of
 * controllers and failures reach the shared error handler with a consistent
 * field-error shape.
 */
export function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        errors: result.error.flatten().fieldErrors,
      });
    }

    req[source] = result.data;

    if (source === "query") {
      req.validatedQuery = result.data;
    }

    next();
  };
}

export function validateBody(schema) {
  return validate(schema, "body");
}

export function validateQuery(schema) {
  return validate(schema, "query");
}

export function validateParams(schema) {
  return validate(schema, "params");
}
