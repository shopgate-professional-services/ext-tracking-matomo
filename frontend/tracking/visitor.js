const STORAGE_KEY = 'matomoVisitorId';

let cachedId = null;

/**
 * Generates a Matomo-compatible visitor id (16 lowercase hex chars).
 * @returns {string}
 */
function generateVisitorId() {
  const bytes = new Uint8Array(8);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      // eslint-disable-next-line no-bitwise
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Returns a stable per-device visitor id, creating and persisting one on first use.
 * Persisted in localStorage; falls back to an in-memory id if storage is unavailable.
 * @returns {string}
 */
export function getVisitorId() {
  if (cachedId) {
    return cachedId;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && /^[0-9a-f]{16}$/.test(stored)) {
      cachedId = stored;
      return cachedId;
    }
  } catch (e) {
    // localStorage not available – fall through to a session-only id
  }

  cachedId = generateVisitorId();

  try {
    window.localStorage.setItem(STORAGE_KEY, cachedId);
  } catch (e) {
    // ignore – cachedId stays in memory for this session
  }

  return cachedId;
}
