import { useCallback, useEffect, useMemo, useState } from "react";

import { session } from "../../services/resources.js";
import { PermissionsContext } from "./PermissionsContext.js";

/*
 * Mirrors the signed-in user's permission set so navigation can hide what they
 * may not use. This is presentation only: every route re-checks the same
 * permission on the server.
 */
export default function PermissionsProvider({ children }) {
  const [state, setState] = useState({
    permissions: [],
    roles: [],
    loading: true,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    session
      .permissions()
      .then((response) => {
        if (cancelled) return;

        setState({
          permissions: response?.data?.permissions ?? [],
          roles: response?.data?.roles ?? [],
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) return;

        setState({ permissions: [], roles: [], loading: false, error });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const held = useMemo(() => new Set(state.permissions), [state.permissions]);

  const can = useCallback((key) => held.has(key), [held]);

  const canAny = useCallback(
    (keys = []) => keys.some((key) => held.has(key)),
    [held]
  );

  const canAll = useCallback(
    (keys = []) => keys.every((key) => held.has(key)),
    [held]
  );

  const refresh = useCallback(() => setAttempt((current) => current + 1), []);

  const value = useMemo(
    () => ({
      permissions: state.permissions,
      roles: state.roles,
      loading: state.loading,
      error: state.error,
      can,
      canAny,
      canAll,
      refresh,
    }),
    [state, can, canAny, canAll, refresh]
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}
