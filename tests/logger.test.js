import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitive, maskKey, logger } from '../common/logger.js';

describe('SafeLogger & Key Sanitization', () => {
  test('maskKey properly masks OpenRouter API keys', () => {
    const rawKey = 'sk-or-v1-abcdef1234567890abcdef1234567890abcd';
    const masked = maskKey(rawKey);

    assert.ok(masked.startsWith('sk-or-v1-'));
    assert.ok(masked.endsWith('abcd'));
    assert.ok(masked.includes('••••••••'));
    assert.strictEqual(masked.includes('abcdef1234567890'), false);
  });

  test('maskKey handles short or invalid keys gracefully', () => {
    assert.strictEqual(maskKey(''), '');
    assert.strictEqual(maskKey('12345'), '••••••••');
    assert.strictEqual(maskKey(null), '');
  });

  test('redactSensitive strips raw OpenRouter tokens from string logs', () => {
    const rawLog = 'Sending prompt with key sk-or-v1-0123456789abcdef0123456789abcdef to endpoint';
    const sanitized = redactSensitive(rawLog);

    assert.strictEqual(sanitized.includes('0123456789abcdef'), false);
    assert.ok(sanitized.includes('sk-or-v1-••••[REDACTED]'));
  });

  test('redactSensitive redacts Bearer tokens', () => {
    const headerLog = 'Headers: { Authorization: "Bearer sk-or-v1-9876543210fedcba9876543210fedcba" }';
    const sanitized = redactSensitive(headerLog);

    assert.strictEqual(sanitized.includes('9876543210fedcba'), false);
    assert.ok(sanitized.includes('Bearer [REDACTED_TOKEN]'));
  });

  test('redactSensitive masks sensitive keys inside nested objects', () => {
    const payload = {
      user: 'test-user',
      apiKey: 'sk-or-v1-11223344556677889900aabbccddeeff',
      nested: {
        token: 'secret-token-123456789'
      }
    };
    const sanitized = redactSensitive(payload);

    assert.strictEqual(sanitized.apiKey.includes('112233445566'), false);
    assert.ok(sanitized.apiKey.startsWith('sk-or-v1-'));
    assert.ok(sanitized.nested.token.includes('••••'));
  });

  test('logger methods execute without throwing', () => {
    assert.doesNotThrow(() => {
      logger.info('Test info message with key sk-or-v1-12345678901234567890');
      logger.warn('Test warn message');
      logger.error('Test error message', new Error('Dummy error'));
      logger.debug('Test debug message');
    });
  });
});
