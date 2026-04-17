/**
 * Safe wrappers around localStorage / sessionStorage.
 *
 * Why: Safari (Private Mode), iOS WebViews, and some embedded browsers throw
 * SecurityError / QuotaExceededError when accessing storage. A throw inside a
 * useState initializer crashes the whole React tree → "Algo salió mal".
 *
 * These helpers always succeed (return null / false on failure) so the app
 * keeps rendering even when storage is unavailable.
 */

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

export const safeLocalStorage = {
  getItem(key: string): string | null {
    if (!hasWindow()) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): boolean {
    if (!hasWindow()) return false;
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  removeItem(key: string): boolean {
    if (!hasWindow()) return false;
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
};

export const safeSessionStorage = {
  getItem(key: string): string | null {
    if (!hasWindow()) return null;
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): boolean {
    if (!hasWindow()) return false;
    try {
      window.sessionStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  removeItem(key: string): boolean {
    if (!hasWindow()) return false;
    try {
      window.sessionStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * Cross-browser UUID generator.
 * crypto.randomUUID() requires a secure context (HTTPS) AND Safari ≥ 15.4.
 * Falls back to crypto.getRandomValues, then Math.random.
 */
export function safeRandomUUID(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  try {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      // RFC 4122 v4
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
      return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
    }
  } catch {
    // fall through
  }
  // Last-resort (non-cryptographic) fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
