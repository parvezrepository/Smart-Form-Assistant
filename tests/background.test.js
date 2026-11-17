import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGE_ACTIONS, CONNECTION_STATUS, OPENROUTER_CONFIG } from '../common/constants.js';

// In-memory mock storage
function createMockStorage() {
  let store = {};
  return {
    get(keys, callback) {
      const result = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) {
        if (k in store) result[k] = store[k];
      }
      callback(result);
    },
    set(items, callback) {
      Object.assign(store, items);
      if (callback) callback();
    },
    remove(keys, callback) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) delete store[k];
      if (callback) callback();
    }
  };
}

describe('Background Worker Message Dispatching & Key Security', () => {
  const originalFetch = globalThis.fetch;
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();
    globalThis._mockStorageLocal = mockStorage;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('VALIDATE_AND_SAVE validates key and persists it when valid', async () => {
    const testKey = 'sk-or-v1-testkey123456789012345678901234567890';
    globalThis.fetch = async () => new Response(JSON.stringify({
      data: { label: 'MyKey', usage: 0, is_free_tier: true }
    }), { status: 200 });

    const { validateOpenRouterKey } = await import('../common/openrouter-service.js');
    const { saveStoredApiKey, saveStoredModel, saveApiStatus, getSafeConfig } = await import('../common/storage.js');

    // Simulate VALIDATE_AND_SAVE handler flow
    const validation = await validateOpenRouterKey(testKey);
    assert.strictEqual(validation.valid, true);

    await saveStoredApiKey(testKey);
    await saveStoredModel('openrouter/free');
    await saveApiStatus(CONNECTION_STATUS.CONNECTED, validation.data);

    const safeConfig = await getSafeConfig();
    assert.strictEqual(safeConfig.hasKey, true);
    assert.ok(safeConfig.maskedKey.startsWith('sk-or-v1-'));
    assert.strictEqual(safeConfig.status, CONNECTION_STATUS.CONNECTED);
  });

  test('VALIDATE_AND_SAVE rejects invalid key and does not save it', async () => {
    const invalidKey = 'sk-or-v1-badkey000000000000000000000000000000';
    globalThis.fetch = async () => new Response(JSON.stringify({
      error: { message: 'Invalid API key', code: 401 }
    }), { status: 401 });

    const { validateOpenRouterKey } = await import('../common/openrouter-service.js');
    const { getStoredApiKey } = await import('../common/storage.js');

    const validation = await validateOpenRouterKey(invalidKey);
    assert.strictEqual(validation.valid, false);
    assert.strictEqual(validation.status, CONNECTION_STATUS.INVALID_KEY);

    // Stored key must remain null
    const stored = await getStoredApiKey();
    assert.strictEqual(stored, null);
  });

  test('REMOVE_KEY zeroes out stored credentials completely', async () => {
    const testKey = 'sk-or-v1-testkey123456789012345678901234567890';
    const { saveStoredApiKey, removeStoredApiKey, getStoredApiKey, getSafeConfig } = await import('../common/storage.js');

    await saveStoredApiKey(testKey);
    assert.strictEqual(await getStoredApiKey(), testKey);

    await removeStoredApiKey();
    assert.strictEqual(await getStoredApiKey(), null);

    const config = await getSafeConfig();
    assert.strictEqual(config.hasKey, false);
    assert.strictEqual(config.maskedKey, '');
  });
});
