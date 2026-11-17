/**
 * Smart Form Tick Assistant - Background Service Worker (Manifest V3)
 * Direct communication gateway to OpenRouter API.
 * Keeps API keys securely in local storage and never exposes them to content scripts.
 */

import { MESSAGE_ACTIONS, CONNECTION_STATUS } from './common/constants.js';
import { logger } from './common/logger.js';
import {
  getStoredApiKey,
  saveStoredApiKey,
  removeStoredApiKey,
  saveStoredModel,
  getStoredModel,
  saveApiStatus,
  getSafeConfig
} from './common/storage.js';
import { validateOpenRouterKey, analyzeQuestionsWithAI } from './common/openrouter-service.js';

logger.info('Smart Form Tick Assistant background service worker initialized.');

/**
 * Handles incoming runtime messages from popup and content scripts.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.action) {
    return false;
  }

  handleMessage(request, sender)
    .then(response => {
      sendResponse(response);
    })
    .catch(error => {
      logger.error('Error handling background message:', error.message);
      sendResponse({
        success: false,
        error: error.message || 'An unexpected error occurred in background service worker.'
      });
    });

  return true;
});

/**
 * Message router & dispatcher.
 * @param {object} request
 * @param {object} sender
 * @returns {Promise<object>}
 */
async function handleMessage(request, sender) {
  switch (request.action) {
    case MESSAGE_ACTIONS.GET_CONFIG: {
      const config = await getSafeConfig();
      return { success: true, config };
    }

    case MESSAGE_ACTIONS.VALIDATE_AND_SAVE: {
      const { apiKey, model, customModel } = request.payload || {};
      logger.info('Validating and saving personal API key...');

      const validation = await validateOpenRouterKey(apiKey);
      if (!validation.valid) {
        await saveApiStatus(validation.status, null);
        return {
          success: false,
          status: validation.status,
          message: validation.message
        };
      }

      await saveStoredApiKey(apiKey);
      if (model) {
        await saveStoredModel(model, customModel || null);
      }
      await saveApiStatus(CONNECTION_STATUS.CONNECTED, validation.data);

      const safeConfig = await getSafeConfig();
      return {
        success: true,
        status: CONNECTION_STATUS.CONNECTED,
        message: validation.message,
        config: safeConfig,
        data: validation.data
      };
    }

    case MESSAGE_ACTIONS.TEST_CONNECTION: {
      logger.info('Testing existing saved API connection...');
      const savedKey = await getStoredApiKey();

      if (!savedKey) {
        await saveApiStatus(CONNECTION_STATUS.UNCONFIGURED, null);
        return {
          success: false,
          status: CONNECTION_STATUS.UNCONFIGURED,
          message: 'No API key is currently saved. Please configure your key.'
        };
      }

      const validation = await validateOpenRouterKey(savedKey);
      await saveApiStatus(validation.status, validation.data || null);

      return {
        success: validation.valid,
        status: validation.status,
        message: validation.message,
        data: validation.data || null
      };
    }

    case MESSAGE_ACTIONS.REMOVE_KEY: {
      logger.info('Removing saved API key from local storage...');
      await removeStoredApiKey();
      await saveApiStatus(CONNECTION_STATUS.UNCONFIGURED, null);
      const safeConfig = await getSafeConfig();
      return {
        success: true,
        message: 'Personal API key has been removed from this browser profile.',
        config: safeConfig
      };
    }

    case MESSAGE_ACTIONS.SAVE_MODEL: {
      const { model, customModel } = request.payload || {};
      logger.info('Updating chosen AI model...');
      await saveStoredModel(model, customModel || null);
      return {
        success: true,
        message: 'AI Model preference saved.'
      };
    }

    case MESSAGE_ACTIONS.ANALYZE_QUESTIONS: {
      logger.info('Received question analysis request from popup...');
      const savedKey = await getStoredApiKey();

      if (!savedKey) {
        return {
          success: false,
          status: CONNECTION_STATUS.UNCONFIGURED,
          message: 'No API key configured. Please configure your personal OpenRouter API key first.'
        };
      }

      const modelConfig = await getStoredModel();
      const effectiveModel = modelConfig.customModel || modelConfig.model;
      const { questions, formMetadata } = request.payload || {};

      const analysis = await analyzeQuestionsWithAI(savedKey, effectiveModel, questions, formMetadata);

      // Only update stored API status if key authentication/billing status changed
      if (
        analysis.status === CONNECTION_STATUS.INVALID_KEY ||
        analysis.status === CONNECTION_STATUS.NO_CREDITS ||
        analysis.status === CONNECTION_STATUS.RATE_LIMITED ||
        analysis.status === CONNECTION_STATUS.CONNECTED
      ) {
        await saveApiStatus(analysis.status, null);
      }

      return analysis;
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${request.action}`
      };
  }
}
