/*
 * Single application error shape.
 *
 * `statusCode` drives the HTTP response, `appCode` is a stable
 * machine-readable code the client can branch on, and `errors`
 * carries per-field messages in the same shape Zod produces.
 */
export function appError(statusCode, message, options = {}) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.appCode = options.code || null;
  error.errors = options.errors || null;
  error.details = options.details || null;

  return error;
}

export function badRequest(message, options = {}) {
  return appError(400, message, options);
}

export function unauthorized(message = "Authentication required", options = {}) {
  return appError(401, message, options);
}

export function forbidden(message = "You do not have access to this resource", options = {}) {
  return appError(403, message, options);
}

export function notFound(message = "Resource not found", options = {}) {
  return appError(404, message, options);
}

export function conflict(message, options = {}) {
  return appError(409, message, options);
}

export function unprocessable(message, options = {}) {
  return appError(422, message, options);
}
