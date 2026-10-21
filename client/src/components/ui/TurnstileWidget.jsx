import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

const TurnstileWidget = forwardRef(function TurnstileWidget(
  { siteKey, action = "login", onSuccess, onError, onExpire, className = "" },
  ref
) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [renderError, setRenderError] = useState(null);

  // Store callbacks in refs to avoid re-triggering effects when functions re-create on render
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
    onExpireRef.current = onExpire;
  });

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current !== null && window.turnstile?.reset) {
        try {
          window.turnstile.reset(widgetIdRef.current);
          setRenderError(null);
        } catch (e) {
          console.warn("Turnstile reset error:", e);
        }
      }
    },
    remove: () => {
      if (widgetIdRef.current !== null && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        } catch (e) {
          console.warn("Turnstile remove error:", e);
        }
      }
    },
  }));

  // Ensure Cloudflare Turnstile script is present in the DOM
  useEffect(() => {
    if (window.turnstile) return;

    let existingScript = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
    if (!existingScript) {
      existingScript = document.createElement("script");
      existingScript.src = SCRIPT_URL;
      existingScript.async = true;
      existingScript.defer = true;
      document.head.appendChild(existingScript);
    }
  }, []);

  // Render Turnstile widget once container and siteKey are available
  useEffect(() => {
    let isCancelled = false;
    let pollInterval = null;
    let pollTimeout = null;

    function renderWidget() {
      if (isCancelled || !containerRef.current || !siteKey || !window.turnstile) {
        return;
      }

      // If already rendered, do not re-render
      if (widgetIdRef.current !== null) {
        return;
      }

      try {
        containerRef.current.innerHTML = "";

        const widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: action || undefined,
          callback: (token) => {
            if (!isCancelled) {
              setRenderError(null);
              onSuccessRef.current?.(token);
            }
          },
          "expired-callback": () => {
            if (!isCancelled) {
              onExpireRef.current?.();
            }
          },
          "error-callback": (error) => {
            console.warn("[Cloudflare Turnstile Error]", error);
            if (!isCancelled) {
              setRenderError(String(error || "unknown"));
              onErrorRef.current?.(error);
            }
          },
          theme: "light",
        });

        widgetIdRef.current = widgetId;
      } catch (err) {
        console.error("Turnstile render error:", err);
      }
    }

    if (window.turnstile) {
      renderWidget();
    } else {
      pollInterval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(pollInterval);
          pollInterval = null;
          renderWidget();
        }
      }, 50);

      pollTimeout = setTimeout(() => {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
        if (!window.turnstile && !isCancelled) {
          setRenderError("Script load timeout. Check internet connection.");
        }
      }, 10000);
    }

    return () => {
      isCancelled = true;
      if (pollInterval) clearInterval(pollInterval);
      if (pollTimeout) clearTimeout(pollTimeout);

      if (widgetIdRef.current !== null && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, action]);

  return (
    <div className="flex flex-col items-center justify-center space-y-2">
      <div
        ref={containerRef}
        id="cf-turnstile-container"
        data-testid="turnstile-widget"
        style={{ minWidth: 300, minHeight: 65 }}
        className={`flex items-center justify-center ${className}`}
      />
      {renderError ? (
        <div className="w-full max-w-sm rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
          <p className="font-medium">⚠️ Security check could not load ({renderError})</p>
          <p className="mt-1 text-amber-700">
            {renderError === "110200"
              ? "Domain not allowed: Ensure 'localhost' is added to Allowed Domains in Cloudflare Turnstile dashboard, or use testing keys."
              : renderError === "110100"
              ? "Invalid site key: Check your Turnstile SITE_KEY in server environment."
              : "Unable to complete Turnstile check. Please check network connection or Cloudflare settings."}
          </p>
        </div>
      ) : null}
    </div>
  );
});

export default TurnstileWidget;
