import { useCallback, useEffect, useRef, useState } from "react";

/*
 * `requestKey` names everything the request depends on — resource, page, search,
 * filters — and is the only thing that re-runs it. The loader is read through a
 * ref so an inline function from the caller cannot restart the fetch on every
 * render.
 *
 * Loading is derived from the key that last settled instead of being stored,
 * which keeps the effect free of synchronous state writes.
 */
export default function useAsyncData(requestKey, loader, options = {}) {
  const { initialData = null } = options;

  const [data, setData] = useState(initialData);
  const [error, setError] = useState(null);
  const [settled, setSettled] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const task = useRef(loader);

  useEffect(() => {
    task.current = loader;
  });

  const stamp = `${requestKey}#${attempt}`;

  useEffect(() => {
    let cancelled = false;

    Promise.resolve()
      .then(() => task.current())
      .then((result) => {
        if (cancelled) return;

        setData(result ?? null);
        setError(null);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught);
      })
      .finally(() => {
        if (!cancelled) setSettled(stamp);
      });

    return () => {
      cancelled = true;
    };
  }, [stamp]);

  const reload = useCallback(() => setAttempt((current) => current + 1), []);

  return { data, error, loading: settled !== stamp, reload };
}
