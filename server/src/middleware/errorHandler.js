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
   * Client/application errors
   */
  return res.status(statusCode).json({
    success: false,
    message: err?.message || "Request failed",
  });
}