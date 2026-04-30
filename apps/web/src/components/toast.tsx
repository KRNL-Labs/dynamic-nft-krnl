"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { setToastHandler } from "@/lib/toast-bus";

export type ToastType = "success" | "error" | "info";

export type Toast = {
  id: number;
  message: ReactNode;
  type: ToastType;
};

type ToastContextValue = {
  addToast: (message: ReactNode, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: ReactNode, type: ToastType = "info") => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), message, type }]);
  };

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((toast) =>
      setTimeout(() => removeToast(toast.id), 4000),
    );
    return () => timers.forEach((t) => clearTimeout(t));
  }, [toasts]);

  const value = useMemo(() => ({ addToast }), []);

  useEffect(() => {
    setToastHandler(addToast);
    return () => {
      setToastHandler(null);
    };
  }, [addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-xl border px-4 py-3 text-sm shadow-lg ${
              toast.type === "success"
                ? "border-green-500/50 bg-green-900/30 text-green-100"
                : toast.type === "error"
                  ? "border-red-500/50 bg-red-900/30 text-red-100"
                  : "border-zinc-500/50 bg-zinc-900/70 text-zinc-100"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
