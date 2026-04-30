let getter: (() => string | null) | null = null;

export function setWalletAddressGetter(fn: (() => string | null) | null) {
  getter = fn;
}

export function getWalletAddressGetter(): (() => string | null) | null {
  return getter;
}
