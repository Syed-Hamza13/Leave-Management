import {
  useEffect,
  useRef,
  useState,
} from "react";

import api from "../../services/api.js";
import { AuthContext } from "./AuthContext.js";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  /*
   * Every successful login increments this value.
   *
   * An older /auth/me request is not allowed to overwrite
   * the state created by a newer login.
   */
  const authGeneration = useRef(0);

  async function loadCurrentUser() {
    const generationAtStart = authGeneration.current;

    try {
      const data = await api("/auth/me");

      /*
       * Ignore stale responses.
       */
      if (generationAtStart !== authGeneration.current) {
        return;
      }

      if (data?.success && data?.user) {
        setUser(data.user);
        setAuthError(null);
      } else {
        setUser(null);
      }
    } catch (error) {
      /*
       * Ignore stale responses.
       */
      if (generationAtStart !== authGeneration.current) {
        return;
      }

      if (error.status === 401) {
        if (error.code === "SESSION_INVALID") {
          setUser(null);
          setAuthError(null);
          return;
        }

        if (error.code === "DEVICE_VALIDATION_FAILED") {
          /*
           * The server-side session may still be valid.
           *
           * Do not immediately destroy local auth state here.
           *
           * The UI can later use this state to ask the user
           * to authenticate this browser/device again.
           */
          setAuthError({
            code: "DEVICE_VALIDATION_FAILED",
            message:
              "This browser needs to be authenticated again.",
          });

          return;
        }

        /*
         * Unknown 401:
         * Fail closed on the client.
         */
        setUser(null);
        setAuthError(null);
        return;
      }

      console.error("Failed to load current user:", error);
      setAuthError({
        code: "AUTH_CHECK_FAILED",
        message: "Unable to verify your session.",
      });
    } finally {
      /*
       * Only the latest auth initialization should control loading.
       */
      if (generationAtStart === authGeneration.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    /*
     * Started from a microtask: the session check only writes state once the
     * request settles, and this keeps the mount effect itself free of state
     * writes.
     */
    void Promise.resolve().then(loadCurrentUser);
  }, []);

  async function login(email, password) {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
      }),
    });

    if (data?.success && data?.user) {
      /*
       * Invalidate all older auth/me requests.
       */
      authGeneration.current += 1;

      setUser(data.user);
      setAuthError(null);
      setLoading(false);
    }

    return data;
  }

  async function logout() {
    /*
     * Invalidate any old auth/me request first.
     */
    authGeneration.current += 1;

    try {
      await api("/auth/logout", {
        method: "POST",
      });
    } finally {
      setUser(null);
      setAuthError(null);
      setLoading(false);
    }
  }

  const value = {
    user,
    loading,
    authError,
    isAuthenticated: Boolean(user),
    login,
    logout,
    refreshUser: loadCurrentUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
 