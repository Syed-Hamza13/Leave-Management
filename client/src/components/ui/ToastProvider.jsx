import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToastContext, useToast } from "./ToastContext.js";

export { useToast };

const TONES = {
  success: "border-l-success bg-success-soft text-success",
  info: "border-l-brand bg-brand-soft text-brand",
  warning: "border-l-warning bg-warning-soft text-warning",
  danger: "border-l-danger bg-danger-soft text-danger",
};

const DURATIONS = {
  success: 4000,
  info: 5000,
  warning: 7000,
  danger: 9000,
};

const MAX_VISIBLE = 4;

let nextToastId = 0;

/*
 * Toasts announce transient outcomes only. Field-level validation errors stay
 * beside their input so they survive the toast disappearing.
 */
export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);

    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }

    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message, tone = "info", duration) => {
      const text = typeof message === "string" ? message.trim() : "";

      if (!text) return null;

      const id = (nextToastId += 1);
      const millis = Number.isFinite(duration) ? duration : DURATIONS[tone] ?? DURATIONS.info;

      setToasts((current) => [
        ...current.slice(Math.max(0, current.length - (MAX_VISIBLE - 1))),
        { id, message: text, tone: TONES[tone] ? tone : "info" },
      ]);

      if (millis > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), millis)
        );
      }

      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    const pending = timers.current;

    return () => {
      for (const timer of pending.values()) clearTimeout(timer);

      pending.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      push,
      dismiss,
      notify: ({ tone = "info", message } = {}) => push(message, tone),
      success: (message, duration) => push(message, "success", duration),
      info: (message, duration) => push(message, "info", duration),
      warning: (message, duration) => push(message, "warning", duration),
      error: (message, duration) => push(message, "danger", duration),
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-control border border-line border-l-4 px-3 py-2.5 shadow-sm ${
              TONES[toast.tone]
            }`}
          >
            <p className="flex-1 text-sm font-medium">{toast.message}</p>

            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="-mr-1 shrink-0 rounded p-1 text-xs font-semibold opacity-70 transition-opacity hover:opacity-100"
            >
              <span aria-hidden="true">✕</span>
              <span className="sr-only">Dismiss notification</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
