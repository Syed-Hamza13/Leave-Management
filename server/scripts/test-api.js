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

async function testHealth() {
  const { response, data } = await request("/api/v1/health");

  const passed = response.status === 200 && data?.success === true;

  printResult("Health API", passed, `HTTP ${response.status}`);

  return passed;
}

async function testCsrf() {
  const { response, data } = await request("/api/v1/security/csrf");

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
      ? `Token received | Cookies: ${cookieNames.join(", ") || "none"}`
      : `HTTP ${response.status}`,
  );

  return passed;
}

async function testLogin() {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    printResult(
      "Login API",
      false,
      "TEST_EMAIL and TEST_PASSWORD are missing from .env",
    );

    return false;
  }

  const { response, data } = await request("/api/v1/auth/login", {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },

    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    }),
  });

  const passed =
    response.status === 200 && data?.success === true && data?.user?.id;

  printResult(
    "Login API",
    passed,
    passed
      ? `Logged in as ${data.user.email}`
      : `HTTP ${response.status} - ${data?.message || "Login failed"}`,
  );

  return passed;
}

async function testMe() {
  const { response, data } = await request("/api/v1/auth/me");

  const passed =
    response.status === 200 && data?.success === true && data?.user?.id;

  printResult(
    "Authenticated /me API",
    passed,
    passed
      ? `Current user: ${data.user.email}`
      : `HTTP ${response.status} - ${data?.message || "Failed"}`,
  );

  return passed;
}

async function testLogout() {
  const { response, data } = await request("/api/v1/auth/logout", {
    method: "POST",

    headers: {
      "X-CSRF-Token": csrfToken,
    },
  });

  const passed = response.status === 200 && data?.success === true;

  printResult(
    "Logout API",
    passed,
    passed
      ? "Session destroyed"
      : `HTTP ${response.status} - ${data?.message || "Logout failed"}`,
  );

  return passed;
}

async function testMeAfterLogout() {
  const { response, data } = await request("/api/v1/auth/me");

  const passed = response.status === 401 && data?.success === false;

  printResult(
    "/me after logout",
    passed,
    passed
      ? "Correctly rejected with 401"
      : `Expected 401, received ${response.status}`,
  );

  return passed;
}

async function main() {
  console.log("");
  console.log("================================================");
  console.log("       LEAVE MANAGEMENT API TEST SUITE");
  console.log("================================================");
  console.log(`Base URL : ${BASE_URL}`);
  console.log("");

  const results = [];

  try {
    results.push(await testHealth());
    console.log("");

    results.push(await testCsrf());
    console.log("");

    if (!csrfToken) {
      console.log("❌ Cannot continue without CSRF token.");
      process.exitCode = 1;
      return;
    }

    const loginPassed = await testLogin();
    results.push(loginPassed);
    console.log("");

    if (loginPassed) {
      results.push(await testMe());
      console.log("");

      // Login regenerates the session, so get a fresh CSRF token.
      const csrfAfterLoginPassed = await testCsrf();
      results.push(csrfAfterLoginPassed);
      console.log("");

      if (csrfAfterLoginPassed) {
        results.push(await testLogout());
        console.log("");

        results.push(await testMeAfterLogout());
        console.log("");
      } else {
        console.log("⚠️ Could not get a fresh CSRF token after login.");
        console.log("⚠️ Skipping logout tests.");
        console.log("");
      }
    } else {
      console.log("⚠️ Login failed, skipping authenticated tests.");
      console.log("");
    }

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
