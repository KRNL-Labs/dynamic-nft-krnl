"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthContext } from "./auth";
import { getAccessTokenGetter } from "./token";
import { getWalletAddressGetter } from "./wallet";
import { getPortalType } from "./portal-state";
import { pushToast } from "./toast-bus";

export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export type ApiRequestOptions = {
  method?: string;
  body?: Record<string, unknown> | FormData | null;
  headers?: Record<string, string>;
  auth?: Pick<AuthContext, "userId" | "walletAddress">;
  getAccessToken?: () => Promise<string | null>;
  getWalletAddress?: () => string | null;
  requireWallet?: boolean;
  __portalRetry?: boolean;
};

function shouldRequireWallet(path: string, override?: boolean) {
  if (override !== undefined) return override;
  let normalizedPath = path;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      normalizedPath = new URL(path).pathname;
    } catch {
      normalizedPath = path;
    }
  }
  if (normalizedPath.startsWith("/api/system")) return false;
  return normalizedPath.startsWith("/api/");
}

function warnWrongPortal(path: string) {
  if (process.env.NODE_ENV === "production") return;
  let normalizedPath = path;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      normalizedPath = new URL(path).pathname;
    } catch {
      normalizedPath = path;
    }
  }
  const portal = getPortalType();
  if (!portal) return;
  if (normalizedPath.startsWith("/api/me") && portal !== "owner") {
    console.warn("[api] owner endpoint called from brand portal", normalizedPath);
  }
  if (normalizedPath.startsWith("/api/brands") && portal !== "brand") {
    console.warn("[api] brand endpoint called from owner portal", normalizedPath);
  }
}

function resolveApiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) {
    throw new ApiError("Missing NEXT_PUBLIC_API_BASE_URL", 0, {
      error: "Missing NEXT_PUBLIC_API_BASE_URL",
    });
  }
  const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${normalizedPath}`;
}

function logRequestDebug(
  url: string,
  init: RequestInit,
  walletAddress: string | null,
) {
  if (process.env.NODE_ENV === "production") return;
  const method = init.method ?? "GET";
  console.debug("[api]", method, url, {
    walletHeader: Boolean(walletAddress),
    walletAddress: walletAddress ?? null,
  });
}

function logWalletBlocked(path: string) {
  if (process.env.NODE_ENV === "production") return;
  console.warn("[api] blocked request, wallet missing", path);
}

async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const message =
      err instanceof TypeError && err.message === "Failed to fetch"
        ? "Network error: backend unreachable or CORS blocked. Check API URL and CORS headers."
        : err instanceof Error
          ? err.message
          : "Network error";
    console.error("[apiFetch] request failed", {
      url,
      method: init.method ?? "GET",
    });
    throw new ApiError(message, 0, { error: message });
  }
}

type PortalSelectPayload = { portalType: "brand" | "owner"; brandId?: string };

async function performPortalSelect(
  payload: PortalSelectPayload,
  headers: Record<string, string>,
): Promise<void> {
  const url = resolveApiUrl("/api/auth/select-portal");
  const response = await safeFetch(url, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    const message =
      (typeof data === "object" && data && "message" in data
        ? (data as { message?: string }).message
        : null) ||
      (typeof data === "object" && data && "error" in data
        ? (data as { error?: string }).error
        : null) ||
      (typeof data === "string" ? data : null) ||
      "Failed to select portal";
    throw new ApiError(message, response.status, data);
  }
}

function handleAuthRedirect(
  status: number,
  errorText?: string | null,
  hasAuthorizationHeader = true,
) {
  if (typeof window === "undefined") return;
  if (status === 401) {
    if (!hasAuthorizationHeader) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[api] 401 received without Authorization header; skipping login redirect");
      }
      return;
    }
    window.location.href = "/login";
  }
}

function resolvePortalTypeForRetry(): "brand" | "owner" | null {
  if (typeof window === "undefined") return getPortalType();
  const path = window.location.pathname;
  if (path.startsWith("/dashboard/owner") || path.startsWith("/owner")) {
    return "owner";
  }
  if (path.startsWith("/dashboard")) {
    return "brand";
  }
  return getPortalType();
}

function normalizePath(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      return new URL(path).pathname;
    } catch {
      return path;
    }
  }
  return path;
}

function extractBrandIdFromPath(path: string): string | null {
  const normalizedPath = normalizePath(path);
  const match = normalizedPath.match(/^\/api\/brands\/([^/?#]+)(?:\/|$)/);
  if (!match) return null;
  const id = match[1];
  if (!id || id === "me") return null;
  return id;
}

export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  warnWrongPortal(path);
  const url = resolveApiUrl(path);

  const headers: Record<string, string> = {
    ...(options.headers || {}),
  };

  const tokenGetter = options.getAccessToken ?? getAccessTokenGetter();
  if (tokenGetter) {
    const token = await tokenGetter();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const walletGetter = options.getWalletAddress ?? getWalletAddressGetter();
  const walletAddress = walletGetter ? walletGetter() : null;
  const requireWallet = shouldRequireWallet(path, options.requireWallet);
  if (requireWallet && !walletAddress) {
    logWalletBlocked(path);
    pushToast("Wallet not ready", "error");
    throw new ApiError("Wallet required", 400, { error: "Wallet required" });
  }
  if (walletAddress) {
    headers["X-Wallet-Address"] = walletAddress.toLowerCase();
  }

  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
  };

  if (options.body) {
    if (options.body instanceof FormData) {
      init.body = options.body;
    } else {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
  }

  logRequestDebug(url, init, walletAddress);
  const response = await safeFetch(url, init);
  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      (typeof data === "object" && data && "message" in data
        ? (data as { message?: string }).message
        : null) ||
      (typeof data === "object" && data && "error" in data
        ? (data as { error?: string }).error
        : null) ||
      (typeof data === "string" ? data : null) ||
      `Request failed with status ${response.status}`;
    if (
      response.status === 409 &&
      (message === "Portal not selected" ||
        (typeof data === "object" &&
          data &&
          "error" in data &&
          (data as { error?: string }).error === "Portal not selected")) &&
      !options.__portalRetry
    ) {
      const normalizedPath = normalizePath(path);
      const isBrandsPath = normalizedPath.startsWith("/api/brands");
      const brandId = extractBrandIdFromPath(path);
      if (brandId && walletAddress) {
        await performPortalSelect({ portalType: "brand", brandId }, headers);
        return apiFetch<T>(path, { ...options, __portalRetry: true });
      }
      if (!isBrandsPath) {
        const portalType = resolvePortalTypeForRetry();
        if (portalType === "owner" && walletAddress) {
          await performPortalSelect({ portalType }, headers);
          return apiFetch<T>(path, { ...options, __portalRetry: true });
        }
      }
    }
    if (
      response.status === 403 &&
      (message === "Wrong portal" ||
        (typeof data === "object" &&
          data &&
          "error" in data &&
          (data as { error?: string }).error === "Wrong portal")) &&
      !options.__portalRetry
    ) {
      const normalizedPath = normalizePath(path);
      const isBrandsPath = normalizedPath.startsWith("/api/brands");
      const brandId = extractBrandIdFromPath(path);
      if (brandId && walletAddress) {
        await performPortalSelect({ portalType: "brand", brandId }, headers);
        return apiFetch<T>(path, { ...options, __portalRetry: true });
      }
      if (!isBrandsPath) {
        const portalType = resolvePortalTypeForRetry();
        if (portalType === "owner" && walletAddress) {
          await performPortalSelect({ portalType }, headers);
          return apiFetch<T>(path, { ...options, __portalRetry: true });
        }
      }
    }
    if (message === "Wallet required") {
      pushToast("Wallet not ready", "error");
    }
    if (
      response.status !== 409 ||
      (message !== "Portal not selected" &&
        !(
          typeof data === "object" &&
          data &&
          "error" in data &&
          (data as { error?: string }).error === "Portal not selected"
        ))
    ) {
      handleAuthRedirect(
        response.status,
        message,
        Boolean(headers.Authorization),
      );
    }
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

export async function apiUpload<T>(
  path: string,
  body: FormData,
  options: ApiRequestOptions = {},
): Promise<T> {
  warnWrongPortal(path);
  const url = resolveApiUrl(path);

  const headers: Record<string, string> = {
    ...(options.headers || {}),
  };

  const tokenGetter = options.getAccessToken ?? getAccessTokenGetter();
  if (tokenGetter) {
    const token = await tokenGetter();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const walletGetter = options.getWalletAddress ?? getWalletAddressGetter();
  const walletAddress = walletGetter ? walletGetter() : null;
  const requireWallet = shouldRequireWallet(path, options.requireWallet);
  if (requireWallet && !walletAddress) {
    logWalletBlocked(path);
    pushToast("Wallet not ready", "error");
    throw new ApiError("Wallet required", 400, { error: "Wallet required" });
  }
  if (walletAddress) {
    headers["X-Wallet-Address"] = walletAddress.toLowerCase();
  }

  const init: RequestInit = {
    method: options.method ?? "POST",
    headers,
    body,
  };

  logRequestDebug(url, init, walletAddress);
  const response = await safeFetch(url, init);
  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      (typeof data === "object" && data && "message" in data
        ? (data as { message?: string }).message
        : null) ||
      (typeof data === "object" && data && "error" in data
        ? (data as { error?: string }).error
        : null) ||
      (typeof data === "string" ? data : null) ||
      `Request failed with status ${response.status}`;
    if (
      response.status === 409 &&
      (message === "Portal not selected" ||
        (typeof data === "object" &&
          data &&
          "error" in data &&
          (data as { error?: string }).error === "Portal not selected")) &&
      !options.__portalRetry
    ) {
      const normalizedPath = normalizePath(path);
      const isBrandsPath = normalizedPath.startsWith("/api/brands");
      const brandId = extractBrandIdFromPath(path);
      if (brandId && walletAddress) {
        await performPortalSelect({ portalType: "brand", brandId }, headers);
        return apiUpload<T>(path, body, { ...options, __portalRetry: true });
      }
      if (!isBrandsPath) {
        const portalType = resolvePortalTypeForRetry();
        if (portalType === "owner" && walletAddress) {
          await performPortalSelect({ portalType }, headers);
          return apiUpload<T>(path, body, { ...options, __portalRetry: true });
        }
      }
    }
    if (
      response.status === 403 &&
      (message === "Wrong portal" ||
        (typeof data === "object" &&
          data &&
          "error" in data &&
          (data as { error?: string }).error === "Wrong portal")) &&
      !options.__portalRetry
    ) {
      const normalizedPath = normalizePath(path);
      const isBrandsPath = normalizedPath.startsWith("/api/brands");
      const brandId = extractBrandIdFromPath(path);
      if (brandId && walletAddress) {
        await performPortalSelect({ portalType: "brand", brandId }, headers);
        return apiUpload<T>(path, body, { ...options, __portalRetry: true });
      }
      if (!isBrandsPath) {
        const portalType = resolvePortalTypeForRetry();
        if (portalType === "owner" && walletAddress) {
          await performPortalSelect({ portalType }, headers);
          return apiUpload<T>(path, body, { ...options, __portalRetry: true });
        }
      }
    }
    if (message === "Wallet required") {
      pushToast("Wallet not ready", "error");
    }
    if (
      response.status !== 409 ||
      (message !== "Portal not selected" &&
        !(
          typeof data === "object" &&
          data &&
          "error" in data &&
          (data as { error?: string }).error === "Portal not selected"
        ))
    ) {
      handleAuthRedirect(
        response.status,
        message,
        Boolean(headers.Authorization),
      );
    }
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

export async function apiFetchRaw(
  path: string,
  options: ApiRequestOptions = {},
): Promise<Response> {
  warnWrongPortal(path);
  const url = resolveApiUrl(path);

  const headers: Record<string, string> = {
    ...(options.headers || {}),
  };

  const tokenGetter = options.getAccessToken ?? getAccessTokenGetter();
  if (tokenGetter) {
    const token = await tokenGetter();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const walletGetter = options.getWalletAddress ?? getWalletAddressGetter();
  const walletAddress = walletGetter ? walletGetter() : null;
  const requireWallet = shouldRequireWallet(path, options.requireWallet);
  if (requireWallet && !walletAddress) {
    logWalletBlocked(path);
    pushToast("Wallet not ready", "error");
    throw new ApiError("Wallet required", 400, { error: "Wallet required" });
  }
  if (walletAddress) {
    headers["X-Wallet-Address"] = walletAddress.toLowerCase();
  }

  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
  };

  if (options.body) {
    if (options.body instanceof FormData) {
      init.body = options.body;
    } else {
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
      init.body = JSON.stringify(options.body);
    }
  }

  logRequestDebug(url, init, walletAddress);
  const response = await safeFetch(url, init);
  if (response.ok || response.status === 402) {
    return response;
  }
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  const message =
    (typeof data === "object" && data && "message" in data
      ? (data as { message?: string }).message
      : null) ||
    (typeof data === "object" && data && "error" in data
      ? (data as { error?: string }).error
      : null) ||
    (typeof data === "string" ? data : null) ||
    `Request failed with status ${response.status}`;
  if (
    response.status === 409 &&
    (message === "Portal not selected" ||
      (typeof data === "object" &&
        data &&
        "error" in data &&
        (data as { error?: string }).error === "Portal not selected")) &&
    !options.__portalRetry
  ) {
    const normalizedPath = normalizePath(path);
    const isBrandsPath = normalizedPath.startsWith("/api/brands");
    const brandId = extractBrandIdFromPath(path);
    if (brandId && walletAddress) {
      await performPortalSelect({ portalType: "brand", brandId }, headers);
      return apiFetchRaw(path, { ...options, __portalRetry: true });
    }
    if (!isBrandsPath) {
      const portalType = resolvePortalTypeForRetry();
      if (portalType === "owner" && walletAddress) {
        await performPortalSelect({ portalType }, headers);
        return apiFetchRaw(path, { ...options, __portalRetry: true });
      }
    }
  }
  if (
    response.status === 403 &&
    (message === "Wrong portal" ||
      (typeof data === "object" &&
        data &&
        "error" in data &&
        (data as { error?: string }).error === "Wrong portal")) &&
    !options.__portalRetry
  ) {
    const normalizedPath = normalizePath(path);
    const isBrandsPath = normalizedPath.startsWith("/api/brands");
    const brandId = extractBrandIdFromPath(path);
    if (brandId && walletAddress) {
      await performPortalSelect({ portalType: "brand", brandId }, headers);
      return apiFetchRaw(path, { ...options, __portalRetry: true });
    }
    if (!isBrandsPath) {
      const portalType = resolvePortalTypeForRetry();
      if (portalType === "owner" && walletAddress) {
        await performPortalSelect({ portalType }, headers);
        return apiFetchRaw(path, { ...options, __portalRetry: true });
      }
    }
  }
  if (message === "Wallet required") {
    pushToast("Wallet not ready", "error");
  }
  if (
    response.status !== 409 ||
    (message !== "Portal not selected" &&
      !(
        typeof data === "object" &&
        data &&
        "error" in data &&
        (data as { error?: string }).error === "Portal not selected"
      ))
  ) {
    handleAuthRedirect(
      response.status,
      message,
      Boolean(headers.Authorization),
    );
  }
  throw new ApiError(message, response.status, data);
}

type UseApiOptions = ApiRequestOptions & {
  immediate?: boolean;
  dependencies?: unknown[];
};

export function useApi<T>(
  path?: string | null,
  options: UseApiOptions = {},
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { immediate = true, dependencies = [], ...fetchOptions } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(path && immediate));
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (targetPath?: string) => {
      if (!targetPath) return;
      setLoading(true);
      setError(null);
      try {
        const result = await apiFetch<T>(targetPath, fetchOptions);
        setData(result);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [fetchOptions],
  );

  useEffect(() => {
    if (path && immediate) {
      void execute(path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, immediate, execute, ...dependencies]);

  return {
    data,
    loading,
    error,
    refetch: () => execute(path ?? undefined),
  };
}
