"use client";

import { ReactNode, useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  side?: "right" | "center";
};

export default function Modal({
  open,
  onClose,
  title,
  children,
  side = "center",
}: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/60 backdrop-blur">
      <div
        className={`h-full w-full max-w-2xl transform transition ${
          side === "right" ? "translate-x-0" : ""
        }`}
      >
        <div
          className={`relative h-full overflow-y-auto bg-zinc-950 p-6 shadow-xl ${
            side === "right" ? "ml-auto w-full max-w-xl" : "m-auto max-h-[90vh] max-w-2xl rounded-2xl"
          }`}
        >
          <button
            className="absolute right-4 top-4 text-zinc-500 hover:text-zinc-300"
            onClick={onClose}
          >
            ✕
          </button>
          {title && (
            <h3 className="mb-4 text-lg font-semibold text-white">{title}</h3>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
