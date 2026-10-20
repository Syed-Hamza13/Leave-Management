import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import TurnstileWidget from "../../components/ui/TurnstileWidget.jsx";
import useAsyncData from "../../hooks/useAsyncData.js";
import { auth as authApi } from "../../services/resources.js";
import { useAuth } from "./AuthContext.js";

function LoginPage() {
  const { login, isAuthenticated } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Cloudflare Turnstile state
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef(null);

  const { data: turnstileData } = useAsyncData("auth:turnstile", () => authApi.turnstile());
  const turnstileConfig = turnstileData?.data ?? null;
  const isTurnstileEnabled = Boolean(turnstileConfig?.enabled && turnstileConfig?.siteKey);

  const handleTurnstileSuccess = useCallback((token) => {
    setTurnstileToken(token);
    setError("");
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken("");
  }, []);

  const handleTurnstileError = useCallback((code) => {
    console.warn("[LoginPage] Turnstile error:", code);
    setTurnstileToken("");
  }, []);

  // Expose test helper in non-production for automated testing
  useEffect(() => {
    window.__setTurnstileTokenForTesting = (token) => {
      setTurnstileToken(token);
    };

    return () => {
      delete window.__setTurnstileTokenForTesting;
    };
  }, []);

  const destination = location.state?.from?.pathname || "/";

  /*
   * Signing in flips the authenticated flag while the submit handler is still
   * running. Navigating to the dashboard here would win that race and drop the
   * screen the person was working on, so an already-signed-in visitor returns to
   * the address they came from instead.
   */
  if (isAuthenticated) {
    return <Navigate to={destination} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setFieldErrors({});

    const nextFieldErrors = {};
    if (!password) {
      nextFieldErrors.password = ["Password is required"];
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    if (isTurnstileEnabled && !turnstileToken) {
      setError("Please complete the security check before signing in.");
      return;
    }

    setSubmitting(true);

    try {
      await login(email, password, turnstileToken || undefined);

      navigate(destination, { replace: true });
    } catch (error) {
      // Reset Turnstile on any failed login attempt
      turnstileRef.current?.reset();
      setTurnstileToken("");

      if (error.status === 400 && error.data?.errors) {
        setFieldErrors(error.data.errors);
        if (error.data.errors.turnstile) {
          setError(error.data.errors.turnstile);
        }
      } else if (error.status === 401) {
        setError("Invalid email or password.");
      } else {
        setError(
          error.message || "Unable to login. Please try again."
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">
            Leave Management System
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            Sign in to continue.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
          noValidate
        >
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Email
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              autoComplete="email"
              disabled={submitting}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-500"
            />

            {fieldErrors.email?.[0] && (
              <p className="mt-1 text-sm text-red-600">
                {fieldErrors.email[0]}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Password
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              autoComplete="current-password"
              disabled={submitting}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-500"
            />

            {fieldErrors.password?.[0] && (
              <p className="mt-1 text-sm text-red-600">
                {fieldErrors.password[0]}
              </p>
            )}
          </div>

          {isTurnstileEnabled ? (
            <div className="pt-1">
              <TurnstileWidget
                ref={turnstileRef}
                siteKey={turnstileConfig.siteKey}
                action="login"
                onSuccess={handleTurnstileSuccess}
                onExpire={handleTurnstileExpire}
                onError={handleTurnstileError}
              />
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default LoginPage;