import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { getDeviceId } from "../../lib/deviceId.js";
import api from "../../services/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
        setUser(null);
      } else {
        console.error("Failed to load current user:", error);
        setUser(null);
      }
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
    loadCurrentUser();
  }, []);

  async function login(email, password) {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        deviceId: getDeviceId(),
      }),
    });

    if (data?.success && data?.user) {
      /*
       * Invalidate all older auth/me requests.
       */
      authGeneration.current += 1;

      setUser(data.user);
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
      setLoading(false);
    }
  }

  const value = {
    user,
    loading,
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

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
} 