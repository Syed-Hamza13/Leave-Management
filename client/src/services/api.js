const API_PREFIX = "/api/v1";

let csrfToken = null;

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text || null;
  } catch {
    return null;
  }
}

async function getCsrfToken() {
  const response = await fetch(`${API_PREFIX}/security/csrf`, {
    method: "GET",
    credentials: "include",
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    const error = new Error(
      data?.message || "Unable to initialize CSRF protection"
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  if (
    !data?.csrfToken ||
    typeof data.csrfToken !== "string"
  ) {
    const error = new Error("Invalid CSRF token response");

    error.status = response.status;
    error.data = data;

    throw error;
  }

  csrfToken = data.csrfToken;

  return csrfToken;
}

async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();

  const headers = {
    ...(options.headers || {}),
  };

  /*
   * Only send JSON Content-Type when a body exists.
   * This avoids unnecessarily sending Content-Type on GET requests.
   */
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  /*
   * Cookie/session based authentication requires credentials.
   */
  const requestOptions = {
    ...options,
    method,
    credentials: "include",
    headers,
  };

  /*
   * All state-changing requests require CSRF protection.
   *
   * GET, HEAD and OPTIONS are treated as safe methods.
   */
  const requiresCsrf = !["GET", "HEAD", "OPTIONS"].includes(method);

  if (requiresCsrf) {
    if (!csrfToken) {
      await getCsrfToken();
    }

    requestOptions.headers = {
      ...requestOptions.headers,
      "X-CSRF-Token": csrfToken,
    };
  }

  let response = await fetch(
    `${API_PREFIX}${path}`,
    requestOptions
  );

  let data = await parseResponse(response);

  /*
   * If the CSRF token became invalid/stale, refresh it once
   * and retry the original request.
   *
   * This is especially useful after login because the backend
   * regenerates the session.
   */
  if (
    requiresCsrf &&
    response.status === 403 &&
    data?.message === "Invalid CSRF token"
  ) {
    await getCsrfToken();

    requestOptions.headers = {
      ...requestOptions.headers,
      "X-CSRF-Token": csrfToken,
    };

    response = await fetch(
      `${API_PREFIX}${path}`,
      requestOptions
    );

    data = await parseResponse(response);
  }

  if (!response.ok) {
    const error = new Error(
      data?.message || "Request failed"
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}

export { getCsrfToken };

export default api;