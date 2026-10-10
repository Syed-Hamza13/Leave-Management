import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "./AuthProvider.jsx";

function LoginPage() {
  const { login, isAuthenticated } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setFieldErrors({});
    setSubmitting(true);

    try {
      await login(email, password);

      const destination =
        location.state?.from?.pathname || "/";

      navigate(destination, { replace: true });
    } catch (error) {
      if (error.status === 400 && error.data?.errors) {
        setFieldErrors(error.data.errors);
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
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
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