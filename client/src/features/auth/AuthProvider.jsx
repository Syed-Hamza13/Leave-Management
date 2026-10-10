import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import api from "../../services/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadCurrentUser() {
    try {
      const data = await api("/auth/me");

      if (data?.success && data?.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      if (error.status === 401) {
        setUser(null);
      } else {
        console.error("Failed to load current user:", error);
        setUser(null);
      }
    } finally {
      setLoading(false);
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
      }),
    });

    if (data?.success && data?.user) {
      setUser(data.user);
    }

    return data;
  }

  async function logout() {
    try {
      await api("/auth/logout", {
        method: "POST",
      });
    } finally {
      setUser(null);
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
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
}