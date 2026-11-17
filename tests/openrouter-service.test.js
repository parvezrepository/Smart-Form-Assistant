import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { validateOpenRouterKey, analyzeQuestionsWithAI } from '../common/openrouter-service.js';
import { CONNECTION_STATUS, OPENROUTER_CONFIG, QUESTION_TYPES } from '../common/constants.js';

describe('OpenRouter Direct API Validation Service', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('rejects empty or whitespace keys immediately without network call', async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response();
    };

    const res1 = await validateOpenRouterKey('');
    assert.strictEqual(res1.valid, false);
    assert.strictEqual(res1.status, CONNECTION_STATUS.INVALID_KEY);

    const res2 = await validateOpenRouterKey('   ');
    assert.strictEqual(res2.valid, false);

    assert.strictEqual(fetchCalled, false, 'Fetch must not be called for empty keys');
  });

  test('rejects non-OpenRouter formatted keys immediately', async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response();
    };

    const res = await validateOpenRouterKey('invalid-random-string-12345');
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.status, CONNECTION_STATUS.INVALID_KEY);
    assert.ok(res.message.includes('sk-or-v1-'));
    assert.strictEqual(fetchCalled, false);
  });

  test('successfully validates key against OpenRouter /auth/key with 200 OK', async () => {
    const testKey = 'sk-or-v1-0123456789abcdef0123456789abcdef01234567';
    let interceptedUrl = null;
    let interceptedHeaders = null;

    globalThis.fetch = async (url, options) => {
      interceptedUrl = url;
      interceptedHeaders = options.headers;
      return new Response(JSON.stringify({
        data: {
          label: 'Personal Production Key',
          usage: 0.125,
          limit: null,
          is_free_tier: false,
          rate_limit: {
            requests: 50,
            interval: '10s'
          }
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const res = await validateOpenRouterKey(testKey);

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.status, CONNECTION_STATUS.CONNECTED);
    assert.strictEqual(interceptedUrl, OPENROUTER_CONFIG.AUTH_KEY_URL);
    assert.strictEqual(interceptedHeaders['Authorization'], `Bearer ${testKey}`);
    assert.strictEqual(interceptedHeaders['HTTP-Referer'], OPENROUTER_CONFIG.HTTP_REFERER);
    assert.strictEqual(interceptedHeaders['X-Title'], OPENROUTER_CONFIG.APP_TITLE);
    assert.strictEqual(res.data.label, 'Personal Production Key');
    assert.strictEqual(res.data.usage, 0.125);
    assert.strictEqual(res.data.isFreeTier, false);
  });

  test('handles 401 Unauthorized as invalid API key', async () => {
    const testKey = 'sk-or-v1-invalidkey00000000000000000000000000000';

    globalThis.fetch = async () => {
      return new Response(JSON.stringify({
        error: {
          message: 'Invalid API key',
          code: 401
        }
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const res = await validateOpenRouterKey(testKey);

    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.status, CONNECTION_STATUS.INVALID_KEY);
    assert.ok(res.message.includes('Authentication failed'));
  });

  test('handles 402 Payment Required as insufficient credits', async () => {
    const testKey = 'sk-or-v1-validkeywithoutcredits1234567890123456';

    globalThis.fetch = async () => {
      return new Response(JSON.stringify({
        error: {
          message: 'Insufficient credits',
          code: 402
        }
      }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const res = await validateOpenRouterKey(testKey);

    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.status, CONNECTION_STATUS.NO_CREDITS);
    assert.ok(res.message.includes('credits'));
  });

  test('handles 429 Rate Limit', async () => {
    const testKey = 'sk-or-v1-validkeyratelimited123456789012345678';

    globalThis.fetch = async () => {
      return new Response(JSON.stringify({
        error: {
          message: 'Rate limit exceeded',
          code: 429
        }
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const res = await validateOpenRouterKey(testKey);

    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.status, CONNECTION_STATUS.RATE_LIMITED);
    assert.ok(res.message.includes('Rate limit'));
  });

  test('handles network failure gracefully', async () => {
    const testKey = 'sk-or-v1-validkeynetworkdown123456789012345678';

    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };

    const res = await validateOpenRouterKey(testKey);

    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.status, CONNECTION_STATUS.NETWORK_ERROR);
    assert.ok(res.message.includes('Failed to reach OpenRouter API'));
  });
});

describe('OpenRouter AI Question Analysis Service (Phase 03)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const sampleQuestions = [
    {
      id: 'sfta_q_1',
      index: 1,
      type: QUESTION_TYPES.RADIO,
      title: 'Do you agree to the standard terms?',
      required: true,
      options: [
        { id: 'sfta_opt_0', label: 'I Agree' },
        { id: 'sfta_opt_1', label: 'I Disagree' }
      ]
    }
  ];

  test('returns error when API key is missing', async () => {
    const res = await analyzeQuestionsWithAI('', 'openrouter/free', sampleQuestions);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, CONNECTION_STATUS.UNCONFIGURED);
  });

  test('returns error when no radio or checkbox questions exist', async () => {
    const textOnly = [
      { id: 'sfta_q_1', type: QUESTION_TYPES.SHORT_TEXT, title: 'Name', options: [] }
    ];
    const res = await analyzeQuestionsWithAI('sk-or-v1-validkey12345678901234567890', 'openrouter/free', textOnly);
    assert.strictEqual(res.success, false);
    assert.ok(res.message.includes('No radio or checkbox questions'));
  });

  test('successfully executes chat completions call with OpenRouter and returns validated analysis', async () => {
    const testKey = 'sk-or-v1-validkey12345678901234567890';
    let interceptedUrl = null;
    let interceptedBody = null;

    globalThis.fetch = async (url, options) => {
      interceptedUrl = url;
      interceptedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                analysis: [
                  {
                    questionId: 'sfta_q_1',
                    type: 'RADIO',
                    needsUserInput: false,
                    confidence: 'HIGH',
                    selectedOptionIds: ['sfta_opt_0'],
                    reasoning: 'Standard affirmative agreement.'
                  }
                ]
              })
            }
          }
        ]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const res = await analyzeQuestionsWithAI(testKey, 'openrouter/free', sampleQuestions, { title: 'Terms Form' });

    assert.strictEqual(res.success, true);
    assert.strictEqual(interceptedUrl, OPENROUTER_CONFIG.CHAT_URL);
    assert.strictEqual(interceptedBody.model, 'openrouter/free');
    assert.strictEqual(interceptedBody.messages.length, 2);
    assert.strictEqual(res.results.length, 1);
    assert.strictEqual(res.results[0].selectedOptionIds[0], 'sfta_opt_0');
    assert.strictEqual(res.results[0].selectedOptionLabels[0], 'I Agree');
  });

  test('handles 429 rate limit during chat completions', async () => {
    const testKey = 'sk-or-v1-validkey12345678901234567890';
    globalThis.fetch = async () => new Response(JSON.stringify({
      error: { message: 'Rate limit exceeded', code: 429 }
    }), { status: 429 });

    const res = await analyzeQuestionsWithAI(testKey, 'openrouter/free', sampleQuestions);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, CONNECTION_STATUS.RATE_LIMITED);
    assert.ok(res.message.includes('Rate limit'));
  });

  test('handles 402 insufficient credits during chat completions', async () => {
    const testKey = 'sk-or-v1-validkey12345678901234567890';
    globalThis.fetch = async () => new Response(JSON.stringify({
      error: { message: 'Out of credits', code: 402 }
    }), { status: 402 });

    const res = await analyzeQuestionsWithAI(testKey, 'openrouter/free', sampleQuestions);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, CONNECTION_STATUS.NO_CREDITS);
    assert.ok(res.message.includes('credits'));
  });
});
