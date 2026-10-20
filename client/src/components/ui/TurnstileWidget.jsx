import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

const TurnstileWidget = forwardRef(function TurnstileWidget(
  { siteKey, action = "login", onSuccess, onError, onExpire, className = "" },
  ref
) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);

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
      const interval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(interval);
          renderWidget();
        }
      }, 50);

      const timeout = setTimeout(() => {
        clearInterval(interval);
      }, 10000);

      return () => {
        isCancelled = true;
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }

    return () => {
      isCancelled = true;
      if (widgetIdRef.current !== null && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        } catch {}
      }
    };
  }, [siteKey, action]);

  return (
    <div
      ref={containerRef}
      id="cf-turnstile-container"
      data-testid="turnstile-widget"
      style={{ minWidth: 300, minHeight: 65 }}
      className={`flex items-center justify-center ${className}`}
    />
  );
});

export default TurnstileWidget;
