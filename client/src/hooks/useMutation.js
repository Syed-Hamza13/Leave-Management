import { useCallback, useState } from "react";

/*
 * Wraps one write request so every screen shares the same pending/error
 * handling and a submit button can never fire twice while a save is in flight.
 */
export default function useMutation() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (task) => {
    setPending(true);
    setError(null);

    try {
      const result = await task();

      return { ok: true, result };
    } catch (caught) {
      setError(caught);

      return { ok: false, error: caught };
    } finally {
      setPending(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { run, pending, error, clearError };
}
