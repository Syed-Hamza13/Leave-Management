import "dotenv/config";

const BASE_URL = `http://localhost:${process.env.PORT || 4000}`;

const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

let csrfToken = null;

// Simple cookie jar for the API test runner.
const cookies = new Map();

function updateCookies(response) {
  const setCookies = response.headers.getSetCookie?.() || [];

  for (const cookie of setCookies) {
    const firstPart = cookie.split(";")[0];
    const separatorIndex = firstPart.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const name = firstPart.slice(0, separatorIndex);
    const value = firstPart.slice(separatorIndex + 1);

    cookies.set(name, value);
  }
}

function getCookieHeader() {
  if (cookies.size === 0) {
    return null;
  }

  return [...cookies.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function printResult(name, passed, details = "") {
  const icon = passed ? "✅" : "❌";

  console.log(`${icon} ${name}`);

  if (details) {
    console.log(`   ${details}`);
  }
}

async function request(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };

  const cookieHeader = getCookieHeader();

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  updateCookies(response);

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    response,
    data,
  };
}

// --------------------------------------------------
// Health
// --------------------------------------------------

async function testHealth() {
  const { response, data } = await request("/api/v1/health");

  const passed =
    response.status === 200 &&
    data?.success === true;

  printResult(
    "Health API",
    passed,
    `HTTP ${response.status}`
  );

  return passed;
}

// --------------------------------------------------
// CSRF
// --------------------------------------------------

async function testCsrf() {
  const { response, data } = await request(
    "/api/v1/security/csrf"
  );

  const passed =
    response.status === 200 &&
    data?.success === true &&
    typeof data?.csrfToken === "string" &&
    data.csrfToken.length > 0;

  if (passed) {
    csrfToken = data.csrfToken;
  }

  const cookieNames = [...cookies.keys()];

  printResult(
    "CSRF Token API",
    passed,
    passed
      ? `Token received | Cookies: ${
          cookieNames.join(", ") || "none"
        }`
      : `HTTP ${response.status} - ${
          data?.message || "CSRF token request failed"
        }`
  );

  return passed;
}

// --------------------------------------------------
// Invalid login validation
// --------------------------------------------------

async function testInvalidLoginValidation() {
  const { response, data } = await request(
    "/api/v1/auth/login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({
        email: "invalid-email",
        password: "",
      }),
    }
  );

  const passed =
    response.status === 400 &&
    data?.success === false &&
    data?.message === "Validation failed" &&
    Array.isArray(data?.errors?.email) &&
    Array.isArray(data?.errors?.password);

  printResult(
    "Invalid Login Validation",
    passed,
    passed
      ? "Correctly rejected with HTTP 400"
      : `HTTP ${response.status} - ${
          data?.message || "Validation test failed"
        }`
  );

  return passed;
}

// --------------------------------------------------
// Invalid credentials
// --------------------------------------------------

async function testInvalidCredentials() {
  if (!TEST_EMAIL) {
    printResult(
      "Invalid Credentials",
      false,
      "TEST_EMAIL is missing from .env"
    );

    return false;
  }

  const { response, data } = await request(
    "/api/v1/auth/login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: "DefinitelyWrongPassword123!",
      }),
    }
  );

  const passed =
    response.status === 401 &&
    data?.success === false &&
    data?.message === "Invalid email or password";

  printResult(
    "Invalid Credentials",
    passed,
    passed
      ? "Correctly rejected with HTTP 401"
      : `HTTP ${response.status} - ${
          data?.message || "Authentication test failed"
        }`
  );

  return passed;
}

// --------------------------------------------------
// Successful login
// --------------------------------------------------

async function testLogin() {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    printResult(
      "Login API",
      false,
      "TEST_EMAIL and TEST_PASSWORD are missing from .env"
    );

    return false;
  }

  /*
   * IMPORTANT:
   * Failed login attempts do not regenerate the session,
   * but we intentionally get a fresh CSRF token before
   * the successful login so this test is independent.
   */
  const csrfPassed = await testCsrf();

  if (!csrfPassed) {
    printResult(
      "Login API",
      false,
      "Could not obtain fresh CSRF token before login"
    );

    return false;
  }

  const { response, data } = await request(
    "/api/v1/auth/login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    }
  );

  const passed =
    response.status === 200 &&
    data?.success === true &&
    Boolean(data?.user?.id);

  printResult(
    "Login API",
    passed,
    passed
      ? `Logged in as ${data.user.email}`
      : `HTTP ${response.status} - ${
          data?.message || "Login failed"
        }`
  );

  return passed;
}

// --------------------------------------------------
// Authenticated /me
// --------------------------------------------------

async function testMe() {
  const { response, data } = await request(
    "/api/v1/auth/me"
  );

  const passed =
    response.status === 200 &&
    data?.success === true &&
    Boolean(data?.user?.id);

  printResult(
    "Authenticated /me API",
    passed,
    passed
      ? `Current user: ${data.user.email}`
      : `HTTP ${response.status} - ${
          data?.message || "Failed"
        }`
  );

  return passed;
}

// --------------------------------------------------
// Invalid CSRF
// --------------------------------------------------

async function testInvalidCsrf() {
  const { response, data } = await request(
    "/api/v1/auth/logout",
    {
      method: "POST",
      headers: {
        "X-CSRF-Token": "invalid-csrf-token",
      },
    }
  );

  const passed =
    response.status === 403 &&
    data?.success === false &&
    data?.message === "Invalid CSRF token";

  printResult(
    "Invalid CSRF Protection",
    passed,
    passed
      ? "Correctly rejected with HTTP 403"
      : `HTTP ${response.status} - ${
          data?.message || "CSRF test failed"
        }`
  );

  return passed;
}

// --------------------------------------------------
// Logout
// --------------------------------------------------

async function testLogout() {
  const { response, data } = await request(
    "/api/v1/auth/logout",
    {
      method: "POST",
      headers: {
        "X-CSRF-Token": csrfToken,
      },
    }
  );

  const passed =
    response.status === 200 &&
    data?.success === true;

  printResult(
    "Logout API",
    passed,
    passed
      ? "Session destroyed"
      : `HTTP ${response.status} - ${
          data?.message || "Logout failed"
        }`
  );

  return passed;
}

// --------------------------------------------------
// /me after logout
// --------------------------------------------------

async function testMeAfterLogout() {
  const { response, data } = await request(
    "/api/v1/auth/me"
  );

  const passed =
    response.status === 401 &&
    data?.success === false;

  printResult(
    "/me after logout",
    passed,
    passed
      ? "Correctly rejected with HTTP 401"
      : `Expected 401, received ${response.status}`
  );

  return passed;
}

// --------------------------------------------------
// 404
// --------------------------------------------------

async function testNotFound() {
  const { response, data } = await request(
    "/api/v1/this-route-does-not-exist"
  );

  const passed =
    response.status === 404 &&
    data?.success === false &&
    typeof data?.message === "string";

  printResult(
    "404 Not Found",
    passed,
    passed
      ? "Correctly rejected with HTTP 404"
      : `HTTP ${response.status} - ${
          data?.message || "404 test failed"
        }`
  );

  return passed;
}

// --------------------------------------------------
// Main
// --------------------------------------------------

async function main() {
  console.log("");
  console.log("================================================");
  console.log("       LEAVE MANAGEMENT API TEST SUITE");
  console.log("================================================");
  console.log(`Base URL : ${BASE_URL}`);
  console.log("");

  const results = [];

  try {
    // --------------------------------------------------
    // 1. Basic health
    // --------------------------------------------------

    results.push(await testHealth());
    console.log("");

    // --------------------------------------------------
    // 2. Initial anonymous CSRF
    // --------------------------------------------------

    results.push(await testCsrf());
    console.log("");

    if (!csrfToken) {
      console.log("❌ Cannot continue without CSRF token.");
      process.exitCode = 1;
      return;
    }

    // --------------------------------------------------
    // 3. Failure-path tests
    // --------------------------------------------------

    results.push(await testInvalidLoginValidation());
    console.log("");

    results.push(await testInvalidCredentials());
    console.log("");

    // --------------------------------------------------
    // 4. Successful authentication
    // --------------------------------------------------

    const loginPassed = await testLogin();
    results.push(loginPassed);
    console.log("");

    if (loginPassed) {
      // ------------------------------------------------
      // 5. Authenticated /me
      // ------------------------------------------------

      results.push(await testMe());
      console.log("");

      // ------------------------------------------------
      // 6. Fresh CSRF after session regeneration
      // ------------------------------------------------

      /*
       * Login regenerates the session ID.
       * Therefore the old anonymous-session CSRF token
       * must not be reused for authenticated operations.
       */
      const csrfAfterLoginPassed = await testCsrf();
      results.push(csrfAfterLoginPassed);
      console.log("");

      if (csrfAfterLoginPassed) {
        // ----------------------------------------------
        // 7. Invalid CSRF protection
        // ----------------------------------------------

        results.push(await testInvalidCsrf());
        console.log("");

        // ----------------------------------------------
        // 8. Valid logout
        // ----------------------------------------------

        results.push(await testLogout());
        console.log("");

        // ----------------------------------------------
        // 9. Authentication must be gone
        // ----------------------------------------------

        results.push(await testMeAfterLogout());
        console.log("");
      } else {
        console.log(
          "⚠️ Could not get a fresh CSRF token after login."
        );
        console.log(
          "⚠️ Skipping authenticated logout tests."
        );
        console.log("");
      }
    } else {
      console.log(
        "⚠️ Login failed, skipping authenticated tests."
      );
      console.log("");
    }

    // --------------------------------------------------
    // 10. 404 handling
    // --------------------------------------------------

    results.push(await testNotFound());
    console.log("");

    // --------------------------------------------------
    // Summary
    // --------------------------------------------------

    const passed = results.filter(Boolean).length;
    const failed = results.length - passed;

    console.log("================================================");
    console.log("                    SUMMARY");
    console.log("================================================");
    console.log(`Passed : ${passed}`);
    console.log(`Failed : ${failed}`);
    console.log("================================================");
    console.log("");

    process.exitCode = failed > 0 ? 1 : 0;
  } catch (error) {
    console.log("");
    console.error("❌ Test runner failed:");
    console.error(error);
    console.log("");

    process.exitCode = 1;
  }
}

main();