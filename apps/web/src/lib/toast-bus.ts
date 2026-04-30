"use client";

import type { ReactNode } from "react";
import type { ToastType } from "@/components/toast";

type ToastHandler = (message: ReactNode, type?: ToastType) => void;

let toastHandler: ToastHandler | null = null;

export function setToastHandler(handler: ToastHandler | null) {
  toastHandler = handler;
}

export function pushToast(message: ReactNode, type: ToastType = "info") {
  if (toastHandler) {
    toastHandler(message, type);
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    console.warn("[toast] handler not ready", message);
  }
}
