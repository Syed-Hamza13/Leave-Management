import { config } from "../config.js";

/** Seconds until the shared rate-limit window refills, read from the refusal itself. */
function windowPause(response) {
  const header = response.headers.get("ratelimit") || "";
  const retryAfter = Number(response.headers.get("retry-after"));
  const reset = Number((header.match(/t=(\d+)/) || [])[1]);

  const seconds = retryAfter > 0 ? retryAfter : reset;

  return Math.min(Math.max(seconds > 0 ? seconds : 30, 5) + 3, 16 * 60);
}

/**
 * A thin cookie-jar REST client used for test setup and for asserting server
 * state that the browser cannot see (audit rows, list totals, cleanup).
 */
export class ApiClient {
  constructor(base = config.apiBaseUrl) {
    this.base = base;
    this.cookies = new Map();
    this.csrfToken = null;
  }

  cookieHeader() {
    if (!this.cookies.size) {
      return undefined;
    }

    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  storeCookies(response) {
    for (const raw of response.headers.getSetCookie?.() || []) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");

      this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }

  async raw(method, path, body, retry = true, budgetRetries = 2) {
    if (method !== "GET" && !this.csrfToken) {
      await this.csrf();
    }

    // The server rotates the double-submit token, so the live cookie value wins
    // whenever it differs from the one this client last read.
    const token = this.cookies.get("csrf-token") || this.csrfToken;

    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(this.cookieHeader() ? { cookie: this.cookieHeader() } : {}),
        ...(method === "GET" || !token ? {} : { "x-csrf-token": token }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    this.storeCookies(response);

    /*
     * A 429 says the shared 15-minute window ran out, which is a property of the
     * harness's own traffic rather than of the product. Waiting the window out and
     * replaying the request keeps a fixture or an assertion from failing on it.
     */
    if (response.status === 429 && budgetRetries > 0) {
      const pause = windowPause(response);

      console.log(`  ! api budget exhausted on ${method} ${path}; sleeping ${pause}s`);

      await new Promise((resolve) => setTimeout(resolve, pause * 1000));

      return this.raw(method, path, body, retry, budgetRetries - 1);
    }

    const payload = await response.json().catch(() => null);

    if (
      retry &&
      method !== "GET" &&
      response.status === 403 &&
      String(payload?.message || "").toLowerCase().includes("csrf")
    ) {
      this.csrfToken = null;

      return this.raw(method, path, body, false);
    }

    return { status: response.status, body: payload };
  }

  async csrf() {
    const { status, body } = await this.raw("GET", "/security/csrf", undefined, false);

    if (status >= 400) {
      throw new Error(`CSRF bootstrap failed with ${status}`);
    }

    this.csrfToken = body.csrfToken;

    return this.csrfToken;
  }

  get(path) {
    return this.raw("GET", path);
  }

  post(path, body) {
    return this.raw("POST", path, body);
  }

  put(path, body) {
    return this.raw("PUT", path, body);
  }

  patch(path, body) {
    return this.raw("PATCH", path, body);
  }

  del(path, body) {
    return this.raw("DELETE", path, body);
  }

  async login({ email, password }) {
    await this.csrf();

    const result = await this.raw("POST", "/auth/login", { email, password });

    if (result.status !== 200) {
      throw new Error(
        `E2E login failed for ${email}: ${result.status} ${JSON.stringify(result.body)}`
      );
    }

    return result.body.user;
  }

  async me() {
    const { status, body } = await this.get("/auth/me");

    if (status >= 400) {
      return { status, user: null, permissions: [], roles: [] };
    }

    const granted = await this.get("/authorization/permissions");

    return {
      status,
      user: body?.user ?? null,
      permissions: granted.body?.data?.permissions ?? [],
      roles: granted.body?.data?.roles ?? [],
    };
  }

  /** Throws unless the response is 2xx, reporting the API's own error message. */
  async expectOk(promise, label) {
    const result = await promise;

    if (result.status >= 400) {
      throw new Error(
        `${label} failed: ${result.status} ${JSON.stringify(result.body).slice(0, 400)}`
      );
    }

    return result.body?.data ?? result.body;
  }
}
