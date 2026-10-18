import { useCallback, useEffect, useMemo, useState } from "react";

import { metadata as metadataApi } from "../../services/resources.js";
import { MetadataContext } from "./MetadataContext.js";

/*
 * The data type registry and the shared reference lists are server-owned, so
 * builder screens never hard-code a type list, an operator list or a dropdown
 * inventory. Both are loaded once per session and refreshed after a mutation
 * that can change them.
 */
export default function MetadataProvider({ children }) {
  const [state, setState] = useState({
    dataTypes: [],
    lookups: { dropdowns: [], tables: [], forms: [], entityTypes: [] },
    loading: true,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    Promise.all([metadataApi.dataTypes(), metadataApi.lookups()])
      .then(([types, lookups]) => {
        if (cancelled) return;

        setState({
          dataTypes: types?.data ?? [],
          lookups: {
            dropdowns: lookups?.data?.dropdowns ?? [],
            tables: lookups?.data?.tables ?? [],
            forms: lookups?.data?.forms ?? [],
            entityTypes: lookups?.data?.entityTypes ?? [],
          },
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) return;

        setState((current) => ({ ...current, loading: false, error }));
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const typesByKey = useMemo(
    () => new Map(state.dataTypes.map((type) => [type.key, type])),
    [state.dataTypes]
  );

  const getDataType = useCallback((key) => typesByKey.get(key) ?? null, [typesByKey]);

  const refresh = useCallback(() => setAttempt((current) => current + 1), []);

  const value = useMemo(
    () => ({
      dataTypes: state.dataTypes,
      lookups: state.lookups,
      loading: state.loading,
      error: state.error,
      getDataType,
      refresh,
    }),
    [state, getDataType, refresh]
  );

  return (
    <MetadataContext.Provider value={value}>{children}</MetadataContext.Provider>
  );
}
