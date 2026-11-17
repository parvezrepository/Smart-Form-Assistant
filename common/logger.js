/**
 * Smart Form Tick Assistant - Safe Logger
 * Enforces zero-leak policy: redacts API keys and Bearer tokens before logging.
 */

// Regex patterns for OpenRouter, Bearer headers, and generic API keys
const BEARER_AUTH_PATTERN = /Bearer\s+([^\s",}]+)/gi;
const OPENROUTER_KEY_PATTERN = /sk-or-v1-[a-zA-Z0-9]{16,128}/gi;
const GENERIC_KEY_PATTERN = /sk-[a-zA-Z0-9_\-]{20,128}/gi;

/**
 * Redacts any detected API key or authentication token from a string or object.
 * @param {any} input
 * @returns {any}
 */
export function redactSensitive(input) {
  if (typeof input === 'string') {
    return input
      .replace(BEARER_AUTH_PATTERN, 'Bearer [REDACTED_TOKEN]')
      .replace(OPENROUTER_KEY_PATTERN, 'sk-or-v1-••••[REDACTED]')
      .replace(GENERIC_KEY_PATTERN, 'sk-••••[REDACTED]');
  }

  if (input instanceof Error) {
    const safeError = new Error(redactSensitive(input.message));
    if (input.stack) {
      safeError.stack = redactSensitive(input.stack);
    }
    return safeError;
  }

  if (Array.isArray(input)) {
    return input.map(item => redactSensitive(item));
  }

  if (input !== null && typeof input === 'object') {
    const sanitizedObj = {};
    for (const [key, val] of Object.entries(input)) {
      // If the field name itself suggests a secret, redact entirely if it's a string
      if (/api_?key|token|auth|secret|authorization/i.test(key) && typeof val === 'string') {
        sanitizedObj[key] = maskKey(val);
      } else {
        sanitizedObj[key] = redactSensitive(val);
      }
    }
    return sanitizedObj;
  }

  return input;
}

/**
 * Creates a display-safe masked version of an API key.
 * Shows prefix and last 4 characters; everything in between is masked.
 * @param {string} key
 * @returns {string}
 */
export function maskKey(key) {
  if (!key || typeof key !== 'string') return '';
  const cleanKey = key.trim();
  if (cleanKey.length <= 8) {
    return '••••••••';
  }
  const prefix = cleanKey.startsWith('sk-or-v1-') ? 'sk-or-v1-' : cleanKey.slice(0, 4);
  const suffix = cleanKey.slice(-4);
  return `${prefix}••••••••••••${suffix}`;
}

export const logger = {
  info(...args) {
    const sanitized = args.map(arg => redactSensitive(arg));
    console.info('[SmartFormAssistant:INFO]', ...sanitized);
  },
  warn(...args) {
    const sanitized = args.map(arg => redactSensitive(arg));
    console.warn('[SmartFormAssistant:WARN]', ...sanitized);
  },
  error(...args) {
    const sanitized = args.map(arg => redactSensitive(arg));
    console.error('[SmartFormAssistant:ERROR]', ...sanitized);
  },
  debug(...args) {
    const sanitized = args.map(arg => redactSensitive(arg));
    console.debug('[SmartFormAssistant:DEBUG]', ...sanitized);
  }
};
