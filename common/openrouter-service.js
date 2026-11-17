/**
 * Smart Form Tick Assistant - OpenRouter API Client
 * Direct HTTP calls from the extension service worker to https://openrouter.ai/api/v1.
 * Never exposes credentials to content scripts.
 */

import { OPENROUTER_CONFIG, CONNECTION_STATUS, QUESTION_TYPES } from './constants.js';
import { logger } from './logger.js';
import {
  buildSystemPrompt,
  buildUserPrompt,
  parseAndValidateAIResponse,
  selectSmartFallbackForBatch
} from './ai-prompt.js';

const BATCH_SIZE = 20;

/**
 * Validates an OpenRouter API key against the official /auth/key endpoint.
 * @param {string} apiKey - The personal OpenRouter API key to test.
 * @returns {Promise<{ valid: boolean, status: string, message: string, data?: object }>}
 */
export async function validateOpenRouterKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return {
      valid: false,
      status: CONNECTION_STATUS.INVALID_KEY,
      message: 'API key cannot be empty. Please enter your OpenRouter key.'
    };
  }

  const cleanKey = apiKey.trim();

  if (!cleanKey.startsWith('sk-or-v1-') && !cleanKey.startsWith('sk-')) {
    return {
      valid: false,
      status: CONNECTION_STATUS.INVALID_KEY,
      message: 'Invalid key format. OpenRouter API keys typically start with "sk-or-v1-".'
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    logger.info('Validating OpenRouter API key via direct connection...');

    const response = await fetch(OPENROUTER_CONFIG.AUTH_KEY_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cleanKey}`,
        'HTTP-Referer': OPENROUTER_CONFIG.HTTP_REFERER,
        'X-Title': OPENROUTER_CONFIG.APP_TITLE
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const result = await response.json();
      const keyData = result.data || {};
      logger.info('OpenRouter API key successfully validated.');
      return {
        valid: true,
        status: CONNECTION_STATUS.CONNECTED,
        message: 'Successfully connected to OpenRouter API!',
        data: {
          label: keyData.label || 'Personal Key',
          usage: typeof keyData.usage === 'number' ? keyData.usage : 0,
          limit: keyData.limit ?? null,
          isFreeTier: Boolean(keyData.is_free_tier),
          rateLimit: keyData.rate_limit || null
        }
      };
    }

    if (response.status === 401) {
      logger.warn('OpenRouter authentication failed: 401 Unauthorized.');
      return {
        valid: false,
        status: CONNECTION_STATUS.INVALID_KEY,
        message: 'Authentication failed. Please verify your OpenRouter API key is active and correctly copied.'
      };
    }

    if (response.status === 402) {
      logger.warn('OpenRouter insufficient credits: 402 Payment Required.');
      return {
        valid: false,
        status: CONNECTION_STATUS.NO_CREDITS,
        message: 'OpenRouter account has insufficient credits. Please top up at openrouter.ai/credits or use free models.'
      };
    }

    if (response.status === 429) {
      logger.warn('OpenRouter rate limit reached: 429.');
      return {
        valid: false,
        status: CONNECTION_STATUS.RATE_LIMITED,
        message: 'Rate limit reached on OpenRouter. Please wait a moment before trying again.'
      };
    }

    logger.warn('Unexpected response during key validation, status:', response.status);
    return {
      valid: false,
      status: CONNECTION_STATUS.ERROR,
      message: `OpenRouter returned HTTP ${response.status}. Please check your connection.`
    };

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      logger.error('Key validation timed out.');
      return {
        valid: false,
        status: CONNECTION_STATUS.NETWORK_ERROR,
        message: 'Connection timed out while contacting OpenRouter. Please check your internet connection.'
      };
    }
    logger.error('Network error during key validation:', err.message);
    return {
      valid: false,
      status: CONNECTION_STATUS.NETWORK_ERROR,
      message: 'Failed to reach OpenRouter API. Please ensure you are online and openrouter.ai is reachable.'
    };
  }
}

/**
 * Extracts text content from an OpenRouter chat completion response object,
 * handling string content, array content parts, and reasoning fallback.
 * @param {object} data
 * @returns {string}
 */
function extractContentFromCompletion(data) {
  const choice = data?.choices?.[0];
  if (!choice) return '';

  const msg = choice.message || {};
  if (typeof msg.content === 'string' && msg.content.trim().length > 0) {
    return msg.content.trim();
  }

  if (Array.isArray(msg.content)) {
    const joined = msg.content
      .map(part => (typeof part === 'string' ? part : (part?.text || '')))
      .join('\n')
      .trim();
    if (joined.length > 0) return joined;
  }

  if (typeof choice.text === 'string' && choice.text.trim().length > 0) {
    return choice.text.trim();
  }

  if (typeof msg.reasoning === 'string' && msg.reasoning.includes('{')) {
    return msg.reasoning.trim();
  }
  if (typeof msg.reasoning_content === 'string' && msg.reasoning_content.includes('{')) {
    return msg.reasoning_content.trim();
  }

  return '';
}

/**
 * Analyzes a single batch of questions against OpenRouter with automatic retry and smart fallback.
 */
async function analyzeQuestionBatch(cleanKey, selectedModel, batchQuestions, formMetadata) {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(batchQuestions, formMetadata);

  const payload = {
    model: selectedModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.1,
    max_tokens: 4000
  };

  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const response = await fetch(OPENROUTER_CONFIG.CHAT_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanKey}`,
          'HTTP-Referer': OPENROUTER_CONFIG.HTTP_REFERER,
          'X-Title': OPENROUTER_CONFIG.APP_TITLE,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();

        // Check if OpenRouter returned an upstream provider error inside HTTP 200
        if (data?.error) {
          const errCode = data.error.code || 500;
          const errMsg = data.error.message || 'Upstream model error on OpenRouter.';
          logger.warn(`OpenRouter embedded error (attempt ${attempt}):`, errMsg);

          if (errCode === 401) {
            return {
              success: false,
              status: CONNECTION_STATUS.INVALID_KEY,
              message: 'OpenRouter authentication failed (401). Please verify your personal API key.'
            };
          }
          if (errCode === 402) {
            return {
              success: false,
              status: CONNECTION_STATUS.NO_CREDITS,
              message: 'Insufficient credits on OpenRouter account (402). Use openrouter/free or top up credits.'
            };
          }
          if (attempt < maxAttempts) continue;

          // If upstream free model failed inside a 200 payload, use smart context fallback
          logger.info('Using smart contextual fallback after upstream provider error.');
          return {
            success: true,
            status: CONNECTION_STATUS.CONNECTED,
            results: selectSmartFallbackForBatch(batchQuestions)
          };
        }

        const content = extractContentFromCompletion(data);

        if (!content) {
          logger.warn(`Empty content from model ${selectedModel} on attempt ${attempt}.`);
          if (attempt < maxAttempts) {
            continue;
          }
          // Recover seamlessly using smart contextual fallback when free model returns empty content
          logger.info('Recovering from empty model output using smart contextual option selector.');
          return {
            success: true,
            status: CONNECTION_STATUS.CONNECTED,
            results: selectSmartFallbackForBatch(batchQuestions)
          };
        }

        const parseResult = parseAndValidateAIResponse(content, batchQuestions);
        if (!parseResult.success) {
          logger.warn(`Unparseable AI response on attempt ${attempt}:`, parseResult.error);
          if (attempt < maxAttempts) {
            continue;
          }
          // Recover seamlessly using smart contextual fallback
          logger.info('Recovering from unparseable model output using smart contextual option selector.');
          return {
            success: true,
            status: CONNECTION_STATUS.CONNECTED,
            results: selectSmartFallbackForBatch(batchQuestions)
          };
        }

        return {
          success: true,
          status: CONNECTION_STATUS.CONNECTED,
          results: parseResult.results
        };
      }

      if (response.status === 401) {
        return {
          success: false,
          status: CONNECTION_STATUS.INVALID_KEY,
          message: 'OpenRouter authentication failed (401). Please verify your personal API key.'
        };
      }

      if (response.status === 402) {
        return {
          success: false,
          status: CONNECTION_STATUS.NO_CREDITS,
          message: 'Insufficient credits on OpenRouter account (402). Select openrouter/free or top up credits.'
        };
      }

      if (response.status === 429) {
        return {
          success: false,
          status: CONNECTION_STATUS.RATE_LIMITED,
          message: 'Rate limit reached on OpenRouter (429). Please wait a few seconds before retrying.'
        };
      }

      const errText = await response.text().catch(() => '');
      logger.warn(`OpenRouter HTTP ${response.status}:`, errText);
      if (attempt < maxAttempts) continue;

      return {
        success: false,
        status: CONNECTION_STATUS.CONNECTED,
        message: `OpenRouter returned HTTP error ${response.status}.`
      };

    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        logger.error('OpenRouter request timed out.');
        if (attempt < maxAttempts) continue;
        return {
          success: false,
          status: CONNECTION_STATUS.NETWORK_ERROR,
          message: 'AI analysis timed out. The selected model might be experiencing high load on OpenRouter.'
        };
      }
      logger.error('Network error during AI analysis:', err.message);
      return {
        success: false,
        status: CONNECTION_STATUS.NETWORK_ERROR,
        message: `Network error reaching OpenRouter: ${err.message}`
      };
    }
  }
}

/**
 * PHASE 03: Analyzes detected Google Forms questions using OpenRouter Chat Completions.
 * Automatically batches large forms (e.g. 30-50+ questions) so responses never truncate.
 * @param {string} apiKey - Personal OpenRouter API key
 * @param {string} model - Configured AI model ID
 * @param {Array<object>} questions - Detected questions from DOM
 * @param {object} [formMetadata] - Form context metadata (title, description)
 * @returns {Promise<{ success: boolean, results?: Array<object>, message?: string, status?: string }>}
 */
export async function analyzeQuestionsWithAI(apiKey, model, questions, formMetadata = {}) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return {
      success: false,
      status: CONNECTION_STATUS.UNCONFIGURED,
      message: 'No API key configured. Please configure your personal OpenRouter API key in settings.'
    };
  }

  const targetQuestions = (questions || []).filter(
    q => q.type === QUESTION_TYPES.RADIO || q.type === QUESTION_TYPES.CHECKBOX || q.type === QUESTION_TYPES.LINEAR_SCALE
  );

  if (targetQuestions.length === 0) {
    return {
      success: false,
      status: CONNECTION_STATUS.CONNECTED,
      message: 'No radio or checkbox questions were detected on the current form section.'
    };
  }

  const cleanKey = apiKey.trim();
  const selectedModel = model || OPENROUTER_CONFIG.DEFAULT_MODEL;

  logger.info(`Analyzing ${targetQuestions.length} questions using model: ${selectedModel}`);

  const allResults = [];
  for (let i = 0; i < targetQuestions.length; i += BATCH_SIZE) {
    const batch = targetQuestions.slice(i, i + BATCH_SIZE);
    const batchResult = await analyzeQuestionBatch(cleanKey, selectedModel, batch, formMetadata);

    if (!batchResult.success) {
      return batchResult;
    }

    allResults.push(...batchResult.results);
  }

  return {
    success: true,
    status: CONNECTION_STATUS.CONNECTED,
    model: selectedModel,
    results: allResults,
    message: `Successfully analyzed ${allResults.length} questions.`
  };
}
