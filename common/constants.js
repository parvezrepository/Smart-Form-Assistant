/**
 * Smart Form Tick Assistant - Application Constants
 */

export const OPENROUTER_CONFIG = {
  BASE_URL: 'https://openrouter.ai/api/v1',
  AUTH_KEY_URL: 'https://openrouter.ai/api/v1/auth/key',
  CHAT_URL: 'https://openrouter.ai/api/v1/chat/completions',
  MODELS_URL: 'https://openrouter.ai/api/v1/models',
  DEFAULT_MODEL: 'openrouter/free',
  HTTP_REFERER: 'https://smart-form-tick-assistant.local',
  APP_TITLE: 'Smart Form Tick Assistant'
};

export const POPULAR_MODELS = [
  { id: 'openrouter/free', name: 'OpenRouter Free (Default - Free)' },
  { id: 'google/gemini-2.0-flash-001', name: 'Google Gemini 2.0 Flash (Fast)' },
  { id: 'openai/gpt-4o-mini', name: 'OpenAI GPT-4o Mini (Smart & Fast)' },
  { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku (High Accuracy)' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat (V3)' }
];

export const STORAGE_KEYS = {
  API_KEY: 'sfta_api_key',
  MODEL: 'sfta_model',
  CUSTOM_MODEL: 'sfta_custom_model',
  LAST_STATUS: 'sfta_last_status',
  LAST_CHECKED: 'sfta_last_checked',
  KEY_METADATA: 'sfta_key_metadata'
};

export const MESSAGE_ACTIONS = {
  VALIDATE_AND_SAVE: 'SFTA_VALIDATE_AND_SAVE',
  TEST_CONNECTION: 'SFTA_TEST_CONNECTION',
  REMOVE_KEY: 'SFTA_REMOVE_KEY',
  GET_CONFIG: 'SFTA_GET_CONFIG',
  SAVE_MODEL: 'SFTA_SAVE_MODEL',
  DETECT_FORM: 'SFTA_DETECT_FORM',
  ANALYZE_QUESTIONS: 'SFTA_ANALYZE_QUESTIONS',
  APPLY_SELECTIONS: 'SFTA_APPLY_SELECTIONS'
};

export const CONNECTION_STATUS = {
  UNCONFIGURED: 'UNCONFIGURED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  INVALID_KEY: 'INVALID_KEY',
  RATE_LIMITED: 'RATE_LIMITED',
  NO_CREDITS: 'NO_CREDITS',
  NETWORK_ERROR: 'NETWORK_ERROR',
  ERROR: 'ERROR'
};

export const QUESTION_TYPES = {
  RADIO: 'RADIO',
  CHECKBOX: 'CHECKBOX',
  SHORT_TEXT: 'SHORT_TEXT',
  PARAGRAPH: 'PARAGRAPH',
  DROPDOWN: 'DROPDOWN',
  LINEAR_SCALE: 'LINEAR_SCALE',
  GRID: 'GRID',
  OTHER: 'OTHER'
};
