import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  saveStoredApiKey,
  getStoredApiKey,
  removeStoredApiKey,
  getStoredModel,
  saveStoredModel,
  saveApiStatus,
  getSafeConfig
} from '../common/storage.js';
import { OPENROUTER_CONFIG, CONNECTION_STATUS } from '../common/constants.js';

// In-memory mock for chrome.storage.local
function createMockStorage() {
  let store = {};
  return {
    get(keys, callback) {
      const result = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) {
        if (k in store) {
          result[k] = store[k];
        }
      }
      callback(result);
    },
    set(items, callback) {
      Object.assign(store, items);
      if (callback) callback();
    },
    remove(keys, callback) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) {
        delete store[k];
      }
      if (callback) callback();
    },
    _getRaw() {
      return store;
    },
    _reset() {
      store = {};
    }
  };
}

describe('chrome.storage.local Isolation & Persistence', () => {
  beforeEach(() => {
    globalThis._mockStorageLocal = createMockStorage();
  });

  test('saves and retrieves API key correctly in profile storage', async () => {
    const testKey = 'sk-or-v1-abcdef0123456789abcdef0123456789abcd';
    await saveStoredApiKey(testKey);

    const retrieved = await getStoredApiKey();
    assert.strictEqual(retrieved, testKey);
  });

  test('rejects empty or whitespace-only keys', async () => {
    await assert.rejects(async () => {
      await saveStoredApiKey('');
    }, /API key must be a non-empty string/);

    await assert.rejects(async () => {
      await saveStoredApiKey('   ');
    }, /API key must be a non-empty string/);
  });

  test('removes stored API key completely from storage', async () => {
    const testKey = 'sk-or-v1-abcdef0123456789abcdef0123456789abcd';
    await saveStoredApiKey(testKey);
    await saveApiStatus(CONNECTION_STATUS.CONNECTED);

    await removeStoredApiKey();

    const retrieved = await getStoredApiKey();
    assert.strictEqual(retrieved, null);

    const safeConfig = await getSafeConfig();
    assert.strictEqual(safeConfig.hasKey, false);
    assert.strictEqual(safeConfig.maskedKey, '');
  });

  test('defaults to openrouter/free model when none is configured', async () => {
    const modelConfig = await getStoredModel();
    assert.strictEqual(modelConfig.model, OPENROUTER_CONFIG.DEFAULT_MODEL);
    assert.strictEqual(modelConfig.model, 'openrouter/free');
  });

  test('saves and retrieves custom or selected model', async () => {
    await saveStoredModel('openai/gpt-4o-mini', null);
    let current = await getStoredModel();
    assert.strictEqual(current.model, 'openai/gpt-4o-mini');

    await saveStoredModel('custom', 'mistralai/mistral-large');
    current = await getStoredModel();
    assert.strictEqual(current.model, 'custom');
    assert.strictEqual(current.customModel, 'mistralai/mistral-large');
  });

  test('getSafeConfig returns masked key and never exposes raw key', async () => {
    const rawKey = 'sk-or-v1-00112233445566778899aabbccddeeff9988';
    await saveStoredApiKey(rawKey);
    await saveStoredModel('google/gemini-2.0-flash-001');
    await saveApiStatus(CONNECTION_STATUS.CONNECTED, { label: 'TestKey' });

    const safeConfig = await getSafeConfig();

    assert.strictEqual(safeConfig.hasKey, true);
    assert.ok(safeConfig.maskedKey.startsWith('sk-or-v1-'));
    assert.ok(safeConfig.maskedKey.endsWith('9988'));
    assert.strictEqual(safeConfig.maskedKey.includes('00112233445566778899'), false);
    assert.strictEqual(safeConfig.model, 'google/gemini-2.0-flash-001');
    assert.strictEqual(safeConfig.status, CONNECTION_STATUS.CONNECTED);
    assert.strictEqual(safeConfig.metadata?.label, 'TestKey');
  });
});
