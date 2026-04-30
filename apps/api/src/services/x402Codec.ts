export function decodeB64Json<T>(b64: string): T {
  const trimmed = b64.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as T;
  }
  const decoded = Buffer.from(trimmed, "base64").toString("utf8");
  return JSON.parse(decoded) as T;
}

export function encodeB64Json(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}
