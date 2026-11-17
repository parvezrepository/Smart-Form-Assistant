/**
 * Smart Form Tick Assistant - Local Storage Manager
 * Uses chrome.storage.local for per-profile data isolation.
 * Never uses chrome.storage.sync to prevent transmitting API keys to cloud accounts.
 */

import { STORAGE_KEYS, OPENROUTER_CONFIG, CONNECTION_STATUS } from './constants.js';
import { maskKey } from './logger.js';

/**
 * Accesses chrome.storage.local safely with Promise support.
 */
function getStorageBackend() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return chrome.storage.local;
  }
  // In-memory fallback for unit testing environments where chrome.* is not globally mocked
  if (typeof globalThis !== 'undefined' && globalThis._mockStorageLocal) {
    return globalThis._mockStorageLocal;
  }
  throw new Error('chrome.storage.local is unavailable in this context.');
}

/**
 * Safe helper to check chrome.runtime.lastError without ReferenceError.
 */
function checkLastError() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.lastError) {
    return new Error(chrome.runtime.lastError.message);
  }
  return null;
}

/**
 * Retrieves the stored OpenRouter API key.
 * @returns {Promise<string|null>}
 */
export async function getStoredApiKey() {
  const backend = getStorageBackend();
  return new Promise((resolve, reject) => {
    backend.get([STORAGE_KEYS.API_KEY], (result) => {
      const err = checkLastError();
      if (err) return reject(err);
      resolve(result[STORAGE_KEYS.API_KEY] || null);
    });
  });
}

/**
 * Saves the OpenRouter API key to chrome.storage.local.
 * @param {string} apiKey
 * @returns {Promise<void>}
 */
export async function saveStoredApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('API key must be a non-empty string.');
  }
  const backend = getStorageBackend();
  const trimmed = apiKey.trim();
  return new Promise((resolve, reject) => {
    backend.set({ [STORAGE_KEYS.API_KEY]: trimmed }, () => {
      const err = checkLastError();
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Removes the stored OpenRouter API key and associated metadata.
 * @returns {Promise<void>}
 */
export async function removeStoredApiKey() {
  const backend = getStorageBackend();
  return new Promise((resolve, reject) => {
    backend.remove([
      STORAGE_KEYS.API_KEY,
      STORAGE_KEYS.LAST_STATUS,
      STORAGE_KEYS.LAST_CHECKED,
      STORAGE_KEYS.KEY_METADATA
    ], () => {
      const err = checkLastError();
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Retrieves the configured model. Defaults to 'openrouter/free'.
 * @returns {Promise<{ model: string, customModel: string|null }>}
 */
export async function getStoredModel() {
  const backend = getStorageBackend();
  return new Promise((resolve, reject) => {
    backend.get([STORAGE_KEYS.MODEL, STORAGE_KEYS.CUSTOM_MODEL], (result) => {
      const err = checkLastError();
      if (err) return reject(err);
      const model = result[STORAGE_KEYS.MODEL] || OPENROUTER_CONFIG.DEFAULT_MODEL;
      const customModel = result[STORAGE_KEYS.CUSTOM_MODEL] || null;
      resolve({ model, customModel });
    });
  });
}

/**
 * Saves the chosen AI model.
 * @param {string} model
 * @param {string|null} customModel
 * @returns {Promise<void>}
 */
export async function saveStoredModel(model, customModel = null) {
  const backend = getStorageBackend();
  return new Promise((resolve, reject) => {
    backend.set({
      [STORAGE_KEYS.MODEL]: model,
      [STORAGE_KEYS.CUSTOM_MODEL]: customModel
    }, () => {
      const err = checkLastError();
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Saves status and metadata from API verification.
 * @param {string} status
 * @param {object} [metadata]
 * @returns {Promise<void>}
 */
export async function saveApiStatus(status, metadata = null) {
  const backend = getStorageBackend();
  return new Promise((resolve, reject) => {
    backend.set({
      [STORAGE_KEYS.LAST_STATUS]: status,
      [STORAGE_KEYS.LAST_CHECKED]: Date.now(),
      [STORAGE_KEYS.KEY_METADATA]: metadata
    }, () => {
      const err = checkLastError();
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Retrieves full configuration for popup display without exposing the raw API key.
 * Content scripts or popup UI can call this safely.
 * @returns {Promise<{ hasKey: boolean, maskedKey: string, model: string, customModel: string|null, status: string, lastChecked: number|null, metadata: object|null }>}
 */
export async function getSafeConfig() {
  const backend = getStorageBackend();
  return new Promise((resolve, reject) => {
    backend.get([
      STORAGE_KEYS.API_KEY,
      STORAGE_KEYS.MODEL,
      STORAGE_KEYS.CUSTOM_MODEL,
      STORAGE_KEYS.LAST_STATUS,
      STORAGE_KEYS.LAST_CHECKED,
      STORAGE_KEYS.KEY_METADATA
    ], (result) => {
      const err = checkLastError();
      if (err) return reject(err);

      const rawKey = result[STORAGE_KEYS.API_KEY];
      const hasKey = Boolean(rawKey && typeof rawKey === 'string' && rawKey.trim().length > 0);
      const maskedKey = hasKey ? maskKey(rawKey) : '';
      const model = result[STORAGE_KEYS.MODEL] || OPENROUTER_CONFIG.DEFAULT_MODEL;
      const customModel = result[STORAGE_KEYS.CUSTOM_MODEL] || null;
      const rawStatus = result[STORAGE_KEYS.LAST_STATUS];
      const status = (hasKey && (!rawStatus || rawStatus === CONNECTION_STATUS.ERROR))
        ? CONNECTION_STATUS.CONNECTED
        : (rawStatus || (hasKey ? CONNECTION_STATUS.CONNECTED : CONNECTION_STATUS.UNCONFIGURED));
      const lastChecked = result[STORAGE_KEYS.LAST_CHECKED] || null;
      const metadata = result[STORAGE_KEYS.KEY_METADATA] || null;

      resolve({
        hasKey,
        maskedKey,
        model,
        customModel,
        status,
        lastChecked,
        metadata
      });
    });
  });
}
