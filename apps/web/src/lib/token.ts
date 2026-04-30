let getter: (() => Promise<string | null>) | null = null;

export function setAccessTokenGetter(fn: (() => Promise<string | null>) | null) {
  getter = fn;
}

export function getAccessTokenGetter(): (() => Promise<string | null>) | null {
  return getter;
}
