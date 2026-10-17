import { Builder } from "selenium-webdriver";
import { Options } from "selenium-webdriver/chrome.js";

import { config } from "../config.js";

/**
 * Installed into the page so every failed API call is attributed to the UI step
 * that triggered it, rather than only surfacing as a toast.
 */
const PROBE_SOURCE = `
(function installProbe() {
  if (window.__e2eProbe) {
    window.__e2eProbe.reset();
    return "reset";
  }

  var store = { network: [], errors: [] };

  window.__e2eProbe = {
    store: store,
    reset: function () {
      store.network = [];
      store.errors = [];
      return "ok";
    },
    drain: function () {
      var copy = { network: store.network.slice(), errors: store.errors.slice() };
      store.network = [];
      store.errors = [];
      return copy;
    },
    push: function (entry) {
      if (store.network.length < 200) {
        store.network.push(entry);
      }
    }
  };

  window.addEventListener("error", function (event) {
    store.errors.push({
      type: "error",
      message: String(event.message || event.error || "unknown error"),
      source: String(event.filename || "").split("/").pop(),
      line: event.lineno
    });
  });

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    store.errors.push({
      type: "unhandledrejection",
      message: String((reason && reason.message) || reason)
    });
  });

  var nativeFetch = window.fetch;

  window.fetch = function (input, init) {
    var request = typeof input === "string" ? { url: input } : {
      url: input.url,
      method: input.method,
      body: input.body
    };
    var options = init || {};
    var method = (options.method || request.method || "GET").toUpperCase();
    var body = typeof options.body === "string" ? options.body : request.body;

    return nativeFetch.apply(window, arguments).then(
      function (response) {
        var clone = response.clone();

        clone.text().then(function (text) {
          if (response.status >= 400) {
            window.__e2eProbe.push({
              kind: "fetch",
              method: method,
              url: response.url,
              status: response.status,
              body: text.slice(0, 600),
              requestBody: typeof body === "string" ? body.slice(0, 300) : null
            });
          }
        }).catch(function () {});

        return response;
      },
      function (error) {
        window.__e2eProbe.push({
          kind: "fetch",
          method: method,
          url: String(request.url),
          status: 0,
          body: String(error)
        });

        throw error;
      }
    );
  };

  var nativeOpen = XMLHttpRequest.prototype.open;
  var nativeSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__e2e = { method: String(method).toUpperCase(), url: String(url) };

    return nativeOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (payload) {
    var context = this;

    this.addEventListener("loadend", function () {
      if (context.status >= 400 && context.__e2e) {
        window.__e2eProbe.push({
          kind: "xhr",
          method: context.__e2e.method,
          url: context.__e2e.url,
          status: context.status,
          body: String(context.responseText || "").slice(0, 600),
          requestBody: typeof payload === "string" ? payload.slice(0, 300) : null
        });
      }
    });

    return nativeSend.apply(this, arguments);
  };

  return "installed";
})();
`;

export async function createDriver() {
  const options = new Options();

  options.excludeSwitches(["enable-automation"]);
  // chromedriver only accepts the uppercase severity name as a plain string.
  options.setLoggingPrefs({ browser: "WARNING" });
  options.setUserPreferences({
    credentials_enable_service: false,
    profile: { default_geolocation: { setting: 2 } },
  });

  if (config.headless) {
    options.addArguments("--headless=new");
    options.windowSize({ width: 1600, height: 1000 });
  } else {
    options.addArguments("--start-maximized");
  }

  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();

  driver.manage().setTimeouts({
    implicit: 0,
    pageLoad: config.timeouts.pageLoad,
    script: config.timeouts.pageLoad,
  });

  return driver;
}

export async function installProbe(driver) {
  try {
    await driver.executeScript(PROBE_SOURCE);
  } catch {
    // A navigation in flight can reject the script; the next call retries.
  }
}

export async function drainProbe(driver) {
  try {
    return await driver.executeScript("return window.__e2eProbe ? window.__e2eProbe.drain() : null;");
  } catch {
    return null;
  }
}

export async function drainConsole(driver) {
  try {
    const entries = await driver.manage().logs().get("browser");

    return entries
      .filter((entry) => entry.level.name === "SEVERE" || entry.level.name === "WARNING")
      .map((entry) => ({
        level: entry.level.name,
        message: String(entry.message).slice(0, 400),
      }));
  } catch {
    return [];
  }
}
