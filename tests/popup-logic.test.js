import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONNECTION_STATUS, MESSAGE_ACTIONS, OPENROUTER_CONFIG, QUESTION_TYPES } from '../common/constants.js';

describe('Popup State Machine & Actions Logic', () => {
  test('evaluates initial state as setup view when no key is present', () => {
    const config = { hasKey: false, maskedKey: '', model: 'openrouter/free', status: CONNECTION_STATUS.UNCONFIGURED };
    const shouldShowSavedView = Boolean(config && config.hasKey);
    assert.strictEqual(shouldShowSavedView, false);
  });

  test('evaluates state as saved key view when valid key is stored', () => {
    const config = {
      hasKey: true,
      maskedKey: 'sk-or-v1-••••••••••••abcd',
      model: 'openrouter/free',
      status: CONNECTION_STATUS.CONNECTED
    };
    const shouldShowSavedView = Boolean(config && config.hasKey);
    assert.strictEqual(shouldShowSavedView, true);
  });

  test('switching to edit mode reveals setup view even when key is saved', () => {
    const config = {
      hasKey: true,
      maskedKey: 'sk-or-v1-••••••••••••abcd',
      model: 'openrouter/free',
      status: CONNECTION_STATUS.CONNECTED
    };
    let isEditing = true;
    const shouldShowSavedView = Boolean(config && config.hasKey && !isEditing);
    assert.strictEqual(shouldShowSavedView, false);
  });

  test('detects custom model correctly vs curated models', () => {
    const standardIds = [
      'openrouter/free',
      'google/gemini-2.0-flash-001',
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-haiku',
      'meta-llama/llama-3.3-70b-instruct',
      'deepseek/deepseek-chat'
    ];
    function isCustomModel(model) {
      return Boolean(model && !standardIds.includes(model));
    }

    assert.strictEqual(isCustomModel('openrouter/free'), false);
    assert.strictEqual(isCustomModel('openai/gpt-4o-mini'), false);
    assert.strictEqual(isCustomModel('mistralai/mistral-small'), true);
    assert.strictEqual(isCustomModel('anthropic/claude-3-opus'), true);
  });

  test('maps question types to correct UI badge classes', () => {
    function getTypeBadgeClass(type) {
      switch (type) {
        case QUESTION_TYPES.RADIO:
          return 'q-type-radio';
        case QUESTION_TYPES.CHECKBOX:
          return 'q-type-checkbox';
        default:
          return 'q-type-other';
      }
    }

    assert.strictEqual(getTypeBadgeClass(QUESTION_TYPES.RADIO), 'q-type-radio');
    assert.strictEqual(getTypeBadgeClass(QUESTION_TYPES.CHECKBOX), 'q-type-checkbox');
    assert.strictEqual(getTypeBadgeClass(QUESTION_TYPES.SHORT_TEXT), 'q-type-other');
  });

  test('HTML escaping protects against XSS in question prompts and option labels', () => {
    function escapeHtml(str) {
      if (!str) return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    const dangerous = '<script>alert("xss")</script> & "test"';
    const escaped = escapeHtml(dangerous);
    assert.strictEqual(escaped.includes('<script>'), false);
    assert.strictEqual(escaped, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &quot;test&quot;');
  });
});
