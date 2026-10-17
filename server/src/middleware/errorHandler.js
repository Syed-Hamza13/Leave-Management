import { ZodError } from "zod";

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  /*
   * Zod validation errors
   */
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: err.flatten().fieldErrors,
    });
  }

  /*
   * CSRF errors
   */
  if (err?.code === "EBADCSRFTOKEN") {
    return res.status(403).json({
      success: false,
      message: "Invalid CSRF token",
    });
  }

  /*
   * Database integrity violations are translated to a safe 409 so unique-key
   * and foreign-key failures never leak SQL text to the client.
   */
  if (err?.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      code: "DUPLICATE_ENTRY",
      message: "That value is already in use.",
    });
  }

  if (
    err?.code === "ER_ROW_IS_REFERENCED_2" ||
    err?.code === "ER_NO_REFERENCED_ROW_2"
  ) {
    return res.status(409).json({
      success: false,
      code: "REFERENCE_CONFLICT",
      message: "This item is referenced elsewhere and cannot be changed.",
    });
  }

  /*
   * Explicit application errors
   */
  const statusCode = Number.isInteger(err?.statusCode)
    ? err.statusCode
    : 500;

  /*
   * Never expose internal error details for 500 responses.
   */
  if (statusCode >= 500) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }

  /*
   * Client/application errors.
   *
   * `appCode` is a stable machine-readable code the client branches on, and
   * `errors` carries per-field messages. Internal identifiers are never
   * forwarded.
   */
  const payload = {
    success: false,
    message: err?.message || "Request failed",
  };

  if (typeof err?.appCode === "string") {
    payload.code = err.appCode;
  }

  if (err?.errors && typeof err.errors === "object") {
    payload.errors = err.errors;
  }

  if (err?.details && typeof err.details === "object") {
    payload.details = err.details;
  }

  return res.status(statusCode).json(payload);
}