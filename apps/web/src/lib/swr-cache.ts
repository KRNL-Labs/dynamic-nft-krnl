"use client";

import { mutate } from "swr";

export function clearSWRCache() {
  try {
    void mutate(() => true, undefined, { revalidate: false });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[swr] failed to clear cache", err);
    }
  }
}
