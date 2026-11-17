/**
 * Smart Form Tick Assistant - Popup Controller (Phases 01, 02, 03, 04)
 * Manages API setup, key validation, model configuration, live Google Forms detection,
 * direct OpenRouter AI question analysis, and safe DOM selection application & verification.
 */

import { MESSAGE_ACTIONS, CONNECTION_STATUS, OPENROUTER_CONFIG, QUESTION_TYPES } from '../common/constants.js';

// DOM Elements - Status & Notifications
const statusBadge = document.getElementById('statusBadge');
const statusBadgeText = document.getElementById('statusBadgeText');
const notificationAlert = document.getElementById('notificationAlert');
const notificationMessage = document.getElementById('notificationMessage');
const notificationIcon = document.getElementById('notificationIcon');

// Setup View Elements
const setupView = document.getElementById('setupView');
const apiSetupForm = document.getElementById('apiSetupForm');
const apiKeyInput = document.getElementById('apiKeyInput');
const toggleKeyVisibilityBtn = document.getElementById('toggleKeyVisibility');
const eyeIcon = document.getElementById('eyeIcon');
const modelSelect = document.getElementById('modelSelect');
const customModelGroup = document.getElementById('customModelGroup');
const customModelInput = document.getElementById('customModelInput');
const btnConnect = document.getElementById('btnConnect');
const connectSpinner = document.getElementById('connectSpinner');
const connectBtnText = document.getElementById('connectBtnText');
const btnCancelEdit = document.getElementById('btnCancelEdit');

// Saved Key View Elements
const savedKeyView = document.getElementById('savedKeyView');
const maskedKeyText = document.getElementById('maskedKeyText');
const activeModelLabel = document.getElementById('activeModelLabel');
const connectionStatusText = document.getElementById('connectionStatusText');
const savedModelSelect = document.getElementById('savedModelSelect');
const btnUseSaved = document.getElementById('btnUseSaved');
const useSavedSpinner = document.getElementById('useSavedSpinner');
const btnTestApi = document.getElementById('btnTestApi');
const testSpinner = document.getElementById('testSpinner');
const btnChangeApi = document.getElementById('btnChangeApi');
const btnRemoveApi = document.getElementById('btnRemoveApi');

// Phase 02: Google Form Detection Elements
const formStatusBadge = document.getElementById('formStatusBadge');
const detectedFormPanel = document.getElementById('detectedFormPanel');
const noFormPanel = document.getElementById('noFormPanel');
const formTitleText = document.getElementById('formTitleText');
const sectionIndicatorBadge = document.getElementById('sectionIndicatorBadge');
const statRadioCount = document.getElementById('statRadioCount');
const statCheckboxCount = document.getElementById('statCheckboxCount');
const statTotalCount = document.getElementById('statTotalCount');
const toggleQuestionsList = document.getElementById('toggleQuestionsList');
const accordionArrow = document.getElementById('accordionArrow');
const detectedCountLabel = document.getElementById('detectedCountLabel');
const questionsListContainer = document.getElementById('questionsListContainer');
const btnRescanForm = document.getElementById('btnRescanForm');
const rescanSpinner = document.getElementById('rescanSpinner');

// Phase 03 & 04: AI Analysis & Application Elements
const btnAnalyzeForm = document.getElementById('btnAnalyzeForm');
const analyzeSpinner = document.getElementById('analyzeSpinner');
const btnAnalyzeAndApply = document.getElementById('btnAnalyzeAndApply');
const analyzeApplySpinner = document.getElementById('analyzeApplySpinner');
const aiResultsPanel = document.getElementById('aiResultsPanel');
const aiModelBadge = document.getElementById('aiModelBadge');
const aiSuggestionsList = document.getElementById('aiSuggestionsList');
const btnApplySelections = document.getElementById('btnApplySelections');
const applySpinner = document.getElementById('applySpinner');
const applyStatusBox = document.getElementById('applyStatusBox');
const applyStatusIcon = document.getElementById('applyStatusIcon');
const applyStatusText = document.getElementById('applyStatusText');

// State
let isEditing = false;
let currentConfig = null;
let lastDetectedFormData = null;
let isQuestionsListExpanded = true;
let lastAiAnalysisResults = null;

/**
 * Initializes the popup on every opening.
 */
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadAndRenderConfiguration();
});

/**
 * Sets up all UI event listeners.
 */
function setupEventListeners() {
  // Password visibility toggle
  toggleKeyVisibilityBtn.addEventListener('click', toggleKeyVisibility);

  // Model select change handlers
  modelSelect.addEventListener('change', handleModelSelectChange);
  savedModelSelect.addEventListener('change', handleSavedModelChange);

  // Setup form submission (Connect API)
  apiSetupForm.addEventListener('submit', handleFormSubmit);

  // Cancel edit button
  btnCancelEdit.addEventListener('click', () => {
    isEditing = false;
    showSavedKeyView(currentConfig);
    clearNotification();
  });

  // Saved view actions
  btnUseSaved.addEventListener('click', handleUseSavedApi);
  btnTestApi.addEventListener('click', handleTestApi);
  btnChangeApi.addEventListener('click', handleChangeApi);
  btnRemoveApi.addEventListener('click', handleRemoveApi);

  // Phase 02: Form Rescan & Accordion Toggle
  btnRescanForm.addEventListener('click', () => scanActiveTabForForm(true));
  toggleQuestionsList.addEventListener('click', toggleQuestionsAccordion);

  // Phase 03: AI Analysis Action
  btnAnalyzeForm.addEventListener('click', () => handleRunAnalysis(false));

  // Phase 04: Fast Analyze & Apply Action
  btnAnalyzeAndApply.addEventListener('click', () => handleRunAnalysis(true));

  // Phase 04: Apply Approved Selections Action
  btnApplySelections.addEventListener('click', handleApplyApprovedSelections);
}

/**
 * Loads current configuration from service worker / storage and renders appropriate view.
 */
async function loadAndRenderConfiguration() {
  try {
    const response = await sendMessageToBackground({ action: MESSAGE_ACTIONS.GET_CONFIG });
    if (response && response.success && response.config) {
      currentConfig = response.config;
      renderState(currentConfig);
      if (currentConfig.hasKey) {
        await scanActiveTabForForm(false);
      }
    } else {
      showSetupView(null);
      updateStatusBadge(CONNECTION_STATUS.UNCONFIGURED);
    }
  } catch (err) {
    showSetupView(null);
    updateStatusBadge(CONNECTION_STATUS.ERROR);
    showNotification('Unable to read local configuration: ' + err.message, 'error');
  }
}

/**
 * Decides whether to show the Setup Screen or Saved Key Screen.
 */
function renderState(config) {
  if (config && config.hasKey && !isEditing) {
    showSavedKeyView(config);
  } else {
    showSetupView(config);
  }
}

/**
 * Renders the Setup View (initial or change key).
 */
function showSetupView(config) {
  setupView.classList.remove('hidden');
  savedKeyView.classList.add('hidden');

  if (isEditing) {
    btnCancelEdit.classList.remove('hidden');
    connectBtnText.textContent = 'Save & Connect';
  } else {
    btnCancelEdit.classList.add('hidden');
    connectBtnText.textContent = 'Connect API';
  }

  if (config && config.model) {
    if (isCustomModel(config.model)) {
      modelSelect.value = 'custom';
      customModelGroup.classList.remove('hidden');
      customModelInput.value = config.model;
    } else {
      modelSelect.value = config.model;
      customModelGroup.classList.add('hidden');
    }
  } else {
    modelSelect.value = OPENROUTER_CONFIG.DEFAULT_MODEL;
    customModelGroup.classList.add('hidden');
  }

  apiKeyInput.value = '';
  apiKeyInput.focus();

  if (!isEditing) {
    updateStatusBadge(config?.status || CONNECTION_STATUS.UNCONFIGURED);
  }
}

/**
 * Renders the Saved Key View.
 */
function showSavedKeyView(config) {
  setupView.classList.add('hidden');
  savedKeyView.classList.remove('hidden');

  maskedKeyText.textContent = config.maskedKey || '••••••••';
  activeModelLabel.textContent = config.model || OPENROUTER_CONFIG.DEFAULT_MODEL;

  if (isCustomModel(config.model)) {
    let opt = Array.from(savedModelSelect.options).find(o => o.value === config.model);
    if (!opt) {
      opt = document.createElement('option');
      opt.value = config.model;
      opt.textContent = `Custom (${config.model})`;
      savedModelSelect.appendChild(opt);
    }
    savedModelSelect.value = config.model;
  } else {
    savedModelSelect.value = config.model || OPENROUTER_CONFIG.DEFAULT_MODEL;
  }

  updateStatusBadge(config.status || CONNECTION_STATUS.CONNECTED);
  connectionStatusText.textContent = getStatusText(config.status);
}

/**
 * PHASE 02: Scans active browser tab to detect Google Forms questions and options.
 * @param {boolean} isManualRescan
 */
async function scanActiveTabForForm(isManualRescan = false) {
  if (isManualRescan) {
    btnRescanForm.disabled = true;
    rescanSpinner.classList.remove('hidden');
  }

  formStatusBadge.className = 'badge-tag badge-tag-neutral';
  formStatusBadge.textContent = 'Scanning...';

  try {
    const tabs = await getActiveTabs();
    const activeTab = tabs && tabs[0] ? tabs[0] : null;

    if (!activeTab || !activeTab.url) {
      renderNoFormView('No active tab found.');
      return;
    }

    if (!/docs\.google\.com\/forms\//i.test(activeTab.url)) {
      renderNoFormView('Current tab is not a Google Form.');
      return;
    }

    // Ensure the latest content script handler is active in the tab
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['content/content.js']
      });
    } catch (injectErr) {
      // Ignore if already injected or restricted
    }

    let formResponse = await sendTabMessage(activeTab.id, { action: MESSAGE_ACTIONS.DETECT_FORM });

    if (formResponse && formResponse.success && formResponse.data) {
      lastDetectedFormData = formResponse.data;
      renderDetectedFormView(lastDetectedFormData);
      if (isManualRescan) {
        showNotification(`Form rescanned: found ${lastDetectedFormData.targetQuestionsCount} choice questions.`, 'success');
      }
    } else {
      renderNoFormView('Unable to extract questions from this page.');
    }
  } catch (err) {
    console.error('Error scanning active tab for Google Form:', err);
    renderNoFormView('Scanning error: ' + err.message);
  } finally {
    if (isManualRescan) {
      btnRescanForm.disabled = false;
      rescanSpinner.classList.add('hidden');
    }
  }
}

/**
 * Renders the detected Google Form details into the popup UI.
 */
function renderDetectedFormView(formData) {
  noFormPanel.classList.add('hidden');
  detectedFormPanel.classList.remove('hidden');

  formStatusBadge.className = 'badge-tag badge-tag-success';
  formStatusBadge.textContent = `Form Detected (${formData.targetQuestionsCount} Choices)`;

  formTitleText.textContent = formData.title || 'Google Form';

  if (formData.section && formData.section.isMultiSection) {
    sectionIndicatorBadge.textContent = `Section ${formData.section.current} of ${formData.section.total}`;
    sectionIndicatorBadge.classList.remove('hidden');
  } else {
    sectionIndicatorBadge.textContent = 'Single Section';
    sectionIndicatorBadge.classList.remove('hidden');
  }

  statRadioCount.textContent = formData.radioCount || 0;
  statCheckboxCount.textContent = formData.checkboxCount || 0;
  statTotalCount.textContent = formData.totalQuestions || 0;
  detectedCountLabel.textContent = formData.questions.length;

  renderQuestionsList(formData.questions);

  if (formData.targetQuestionsCount > 0) {
    btnAnalyzeForm.disabled = false;
    btnAnalyzeAndApply.disabled = false;
  } else {
    btnAnalyzeForm.disabled = true;
    btnAnalyzeAndApply.disabled = true;
  }
}

/**
 * Renders individual question preview rows with options.
 */
function renderQuestionsList(questions) {
  questionsListContainer.innerHTML = '';

  if (!questions || questions.length === 0) {
    questionsListContainer.innerHTML = '<p class="no-form-subtext">No visible questions on current section.</p>';
    return;
  }

  for (const q of questions) {
    const card = document.createElement('div');
    card.className = 'question-item-card';

    const header = document.createElement('div');
    header.className = 'question-item-header';

    const titleSpan = document.createElement('div');
    titleSpan.className = 'q-title-text';
    titleSpan.innerHTML = `<span class="q-index-tag">Q${q.index}.</span> ${escapeHtml(q.title)}${q.required ? '<span class="q-required-star">*</span>' : ''}`;

    const typeBadge = document.createElement('span');
    typeBadge.className = `q-type-badge ${getTypeBadgeClass(q.type)}`;
    typeBadge.textContent = q.type;

    header.appendChild(titleSpan);
    header.appendChild(typeBadge);
    card.appendChild(header);

    if (q.options && q.options.length > 0) {
      const optionsRow = document.createElement('div');
      optionsRow.className = 'options-preview-row';

      for (const opt of q.options) {
        const pill = document.createElement('span');
        pill.className = `option-mini-pill ${opt.isChecked ? 'is-checked' : ''}`;
        pill.title = opt.label;
        pill.textContent = `${opt.isChecked ? '✓ ' : ''}${opt.label}`;
        optionsRow.appendChild(pill);
      }

      card.appendChild(optionsRow);
    }

    questionsListContainer.appendChild(card);
  }
}

/**
 * PHASE 03 & 04: Executes AI analysis, with optional immediate application if autoApply=true.
 * @param {boolean} autoApply - If true, immediately applies confident choices to the form.
 */
async function handleRunAnalysis(autoApply = false) {
  if (!lastDetectedFormData || !lastDetectedFormData.questions || lastDetectedFormData.questions.length === 0) {
    showNotification('No questions available to analyze. Please open a Google Form.', 'error');
    return;
  }

  clearNotification();
  hideApplyStatus();

  if (autoApply) {
    setAnalyzeAndApplyLoading(true);
  } else {
    setAnalyzeLoading(true);
  }

  const modelToUse = currentConfig?.model || OPENROUTER_CONFIG.DEFAULT_MODEL;
  aiModelBadge.textContent = modelToUse;

  try {
    const response = await sendMessageToBackground({
      action: MESSAGE_ACTIONS.ANALYZE_QUESTIONS,
      payload: {
        questions: lastDetectedFormData.questions,
        formMetadata: {
          title: lastDetectedFormData.title,
          description: lastDetectedFormData.description
        }
      }
    });

    if (response && response.success && response.results) {
      lastAiAnalysisResults = response.results;
      // Initialize approval state: all confident choices approved by default
      for (const item of lastAiAnalysisResults) {
        // Heuristic fallback picks are never auto-approved; only genuine AI answers are.
        item.isApproved = !item.needsUserInput && !item.isFallback &&
          item.selectedOptionIds && item.selectedOptionIds.length > 0;
      }

      renderAiSuggestions(lastAiAnalysisResults);

      if (autoApply) {
        await executeApplySelections(lastAiAnalysisResults.filter(r => r.isApproved));
      } else {
        showNotification(`Analysis complete: analyzed ${response.results.length} questions. Review below.`, 'success');
      }
    } else {
      showNotification(response?.message || 'AI analysis could not be completed.', 'error');
      if (response?.status) {
        updateStatusBadge(response.status);
      }
    }
  } catch (err) {
    showNotification(`Analysis failed: ${err.message}`, 'error');
  } finally {
    setAnalyzeLoading(false);
    setAnalyzeAndApplyLoading(false);
  }
}

/**
 * PHASE 03 & 04: Renders structured AI suggestion cards with review & approval checkboxes.
 * @param {Array<object>} results
 */
function renderAiSuggestions(results) {
  aiSuggestionsList.innerHTML = '';
  aiResultsPanel.classList.remove('hidden');

  if (!results || results.length === 0) {
    aiSuggestionsList.innerHTML = '<p class="no-form-subtext">No suggestions generated.</p>';
    return;
  }

  for (const item of results) {
    const card = document.createElement('div');
    card.className = `ai-suggestion-card ${item.needsUserInput ? 'is-unclear' : ''} ${item.isApproved ? 'is-approved' : ''}`;

    // Header
    const header = document.createElement('div');
    header.className = 'suggestion-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'suggestion-header-left';

    // Approval Checkbox
    const approveCheckbox = document.createElement('input');
    approveCheckbox.type = 'checkbox';
    approveCheckbox.className = 'approval-checkbox';
    approveCheckbox.title = 'Approve this question selection';
    approveCheckbox.checked = Boolean(item.isApproved);
    approveCheckbox.addEventListener('change', () => {
      item.isApproved = approveCheckbox.checked;
      card.classList.toggle('is-approved', item.isApproved);
    });

    const title = document.createElement('div');
    title.className = 'suggestion-q-title';
    title.innerHTML = `<span class="q-index-tag">Q${item.index}.</span> ${escapeHtml(item.title)}`;

    headerLeft.appendChild(approveCheckbox);
    headerLeft.appendChild(title);

    const confBadge = document.createElement('span');
    confBadge.className = `badge-confidence ${item.needsUserInput ? 'unclear' : 'high'}`;
    confBadge.textContent = item.needsUserInput
      ? 'Needs Input'
      : (item.isFallback ? 'NOT AI' : `${item.confidence} CONF`);
    if (item.isFallback) confBadge.className = 'badge-confidence unclear';

    header.appendChild(headerLeft);
    header.appendChild(confBadge);
    card.appendChild(header);

    // If Unclear / Personal Question -> User Input Mode
    if (item.needsUserInput) {
      const note = document.createElement('span');
      note.className = 'unclear-prompt-note';
      note.textContent = `⚠️ ${item.userPromptMessage || 'Personal or subjective question. Please choose:'}`;
      card.appendChild(note);

      const origQ = (lastDetectedFormData?.questions || []).find(q => q.id === item.questionId);
      if (origQ && origQ.options) {
        const choiceContainer = document.createElement('div');
        choiceContainer.className = 'user-choice-selector';

        const inputType = origQ.type === QUESTION_TYPES.CHECKBOX ? 'checkbox' : 'radio';
        const groupName = `manual_choice_${item.questionId}`;

        for (const opt of origQ.options) {
          const label = document.createElement('label');
          label.className = 'manual-choice-label';

          const input = document.createElement('input');
          input.type = inputType;
          input.name = groupName;
          input.value = opt.id;
          input.checked = (item.selectedOptionIds || []).includes(opt.id);

          input.addEventListener('change', () => {
            if (inputType === 'radio') {
              item.selectedOptionIds = [opt.id];
              item.selectedOptionLabels = [opt.label];
            } else {
              if (input.checked) {
                if (!item.selectedOptionIds.includes(opt.id)) {
                  item.selectedOptionIds.push(opt.id);
                  item.selectedOptionLabels.push(opt.label);
                }
              } else {
                item.selectedOptionIds = item.selectedOptionIds.filter(id => id !== opt.id);
                item.selectedOptionLabels = item.selectedOptionLabels.filter(l => l !== opt.label);
              }
            }
            // Once user chooses, automatically mark as approved
            item.isApproved = item.selectedOptionIds.length > 0;
            approveCheckbox.checked = item.isApproved;
            card.classList.toggle('is-approved', item.isApproved);
          });

          label.appendChild(input);
          const optText = document.createTextNode(` ${opt.label}`);
          label.appendChild(optText);
          choiceContainer.appendChild(label);
        }

        card.appendChild(choiceContainer);
      }
    } else {
      // Confident AI choice pills
      const choicesBox = document.createElement('div');
      choicesBox.className = 'suggested-choices-box';

      for (const labelText of (item.selectedOptionLabels || [])) {
        const pill = document.createElement('span');
        pill.className = 'suggested-choice-pill';
        pill.textContent = `✓ ${labelText}`;
        choicesBox.appendChild(pill);
      }

      card.appendChild(choicesBox);
    }

    // Reasoning
    if (item.reasoning) {
      const reasonEl = document.createElement('div');
      reasonEl.className = 'suggestion-reasoning';
      reasonEl.textContent = `Reason: ${item.reasoning}`;
      card.appendChild(reasonEl);
    }

    aiSuggestionsList.appendChild(card);
  }
}

/**
 * PHASE 04: Handles "Apply Approved Choices" button click.
 */
async function handleApplyApprovedSelections() {
  if (!lastAiAnalysisResults || lastAiAnalysisResults.length === 0) {
    showNotification('No suggestions to apply. Please run analysis first.', 'error');
    return;
  }

  const approvedItems = lastAiAnalysisResults.filter(
    item => item.isApproved && item.selectedOptionIds && item.selectedOptionIds.length > 0
  );

  if (approvedItems.length === 0) {
    showNotification('No approved selections. Please check the boxes for questions you want to apply.', 'error');
    return;
  }

  await executeApplySelections(approvedItems);
}

/**
 * PHASE 04: Dispatches approved selections to content script and displays verification results.
 * @param {Array<object>} selections
 */
async function executeApplySelections(selections) {
  setApplyLoading(true);
  hideApplyStatus();

  try {
    const tabs = await getActiveTabs();
    const activeTab = tabs && tabs[0] ? tabs[0] : null;

    if (!activeTab || !activeTab.id) {
      showNotification('Active tab not found.', 'error');
      return;
    }

    const response = await sendTabMessage(activeTab.id, {
      action: MESSAGE_ACTIONS.APPLY_SELECTIONS,
      payload: { selections }
    });

    if (response && response.success && response.data) {
      const data = response.data;
      showApplyStatus(
        true,
        `✓ ${data.message || `Applied and verified ${data.totalVerified} options in Google Form!`}`,
        data.allSucceeded ? 'success' : 'partial'
      );
      showNotification(`Applied ${data.totalVerified} selection(s) directly to form!`, 'success');
    } else {
      showApplyStatus(false, response?.error || 'Failed to apply selections to the page.', 'partial');
      showNotification('Could not apply choices to the page.', 'error');
    }
  } catch (err) {
    showNotification(`Error applying selections: ${err.message}`, 'error');
  } finally {
    setApplyLoading(false);
  }
}

/**
 * Displays DOM application status banner.
 */
function showApplyStatus(isSuccess, message, type = 'success') {
  applyStatusBox.className = `apply-status-box mt-2 ${type}`;
  applyStatusIcon.textContent = isSuccess ? '✓' : '⚠️';
  applyStatusText.textContent = message;
  applyStatusBox.classList.remove('hidden');
}

function hideApplyStatus() {
  applyStatusBox.classList.add('hidden');
}

/**
 * Returns CSS class for question type badge.
 */
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

/**
 * Renders the view when no Google Form is detected in current tab.
 */
function renderNoFormView(message) {
  detectedFormPanel.classList.add('hidden');
  noFormPanel.classList.remove('hidden');
  formStatusBadge.className = 'badge-tag badge-tag-neutral';
  formStatusBadge.textContent = 'No Form Open';
  aiResultsPanel.classList.add('hidden');
}

/**
 * Toggles question list accordion body.
 */
function toggleQuestionsAccordion() {
  isQuestionsListExpanded = !isQuestionsListExpanded;
  if (isQuestionsListExpanded) {
    questionsListContainer.classList.remove('hidden');
    accordionArrow.innerHTML = '&blacktriangledown;';
  } else {
    questionsListContainer.classList.add('hidden');
    accordionArrow.innerHTML = '&blacktriangleright;';
  }
}

/**
 * Toggles API key input visibility (password vs text).
 */
function toggleKeyVisibility() {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';

  if (isPassword) {
    eyeIcon.innerHTML = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    `;
    toggleKeyVisibilityBtn.title = 'Hide API Key';
  } else {
    eyeIcon.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    `;
    toggleKeyVisibilityBtn.title = 'Show API Key';
  }
}

/**
 * Handles model dropdown change in setup view.
 */
function handleModelSelectChange() {
  if (modelSelect.value === 'custom') {
    customModelGroup.classList.remove('hidden');
    customModelInput.focus();
  } else {
    customModelGroup.classList.add('hidden');
  }
}

/**
 * Handles inline model changes in saved view.
 */
async function handleSavedModelChange() {
  const newModel = savedModelSelect.value;
  try {
    const res = await sendMessageToBackground({
      action: MESSAGE_ACTIONS.SAVE_MODEL,
      payload: { model: newModel }
    });
    if (res && res.success) {
      activeModelLabel.textContent = newModel;
      showNotification(`Active model updated to ${newModel}`, 'success');
    }
  } catch (err) {
    showNotification('Failed to update model: ' + err.message, 'error');
  }
}

/**
 * Handles API Setup / Change form submission.
 */
async function handleFormSubmit(e) {
  e.preventDefault();
  clearNotification();

  const enteredKey = apiKeyInput.value.trim();
  if (!enteredKey) {
    showNotification('Please enter an OpenRouter API key.', 'error');
    apiKeyInput.focus();
    return;
  }

  let selectedModel = modelSelect.value;
  let customModel = null;
  if (selectedModel === 'custom') {
    customModel = customModelInput.value.trim();
    if (!customModel) {
      showNotification('Please enter a valid custom model identifier.', 'error');
      customModelInput.focus();
      return;
    }
    selectedModel = customModel;
  }

  setConnectingState(true);
  updateStatusBadge(CONNECTION_STATUS.CONNECTING);

  try {
    const response = await sendMessageToBackground({
      action: MESSAGE_ACTIONS.VALIDATE_AND_SAVE,
      payload: {
        apiKey: enteredKey,
        model: selectedModel,
        customModel: customModel
      }
    });

    if (response && response.success) {
      isEditing = false;
      currentConfig = response.config;
      showSavedKeyView(currentConfig);
      showNotification('Successfully connected! API key saved locally in this profile.', 'success');
      await scanActiveTabForForm(false);
    } else {
      updateStatusBadge(response?.status || CONNECTION_STATUS.INVALID_KEY);
      showNotification(response?.message || 'Key validation failed. Please check your key.', 'error');
    }
  } catch (err) {
    updateStatusBadge(CONNECTION_STATUS.NETWORK_ERROR);
    showNotification('Connection failed: ' + err.message, 'error');
  } finally {
    setConnectingState(false);
  }
}

/**
 * Handles "Use Saved API" button.
 */
async function handleUseSavedApi() {
  clearNotification();
  setButtonLoading(btnUseSaved, useSavedSpinner, true);
  updateStatusBadge(CONNECTION_STATUS.CONNECTING);

  try {
    const res = await sendMessageToBackground({ action: MESSAGE_ACTIONS.TEST_CONNECTION });
    if (res && res.success) {
      updateStatusBadge(CONNECTION_STATUS.CONNECTED);
      connectionStatusText.textContent = 'Active & Ready';
      showNotification('API connection active and ready for Google Forms!', 'success');
      await scanActiveTabForForm(false);
    } else {
      updateStatusBadge(res?.status || CONNECTION_STATUS.ERROR);
      showNotification(res?.message || 'Connection check failed.', 'error');
    }
  } catch (err) {
    updateStatusBadge(CONNECTION_STATUS.NETWORK_ERROR);
    showNotification('Error verifying connection: ' + err.message, 'error');
  } finally {
    setButtonLoading(btnUseSaved, useSavedSpinner, false);
  }
}

/**
 * Handles "Test API" button.
 */
async function handleTestApi() {
  clearNotification();
  setButtonLoading(btnTestApi, testSpinner, true);
  updateStatusBadge(CONNECTION_STATUS.CONNECTING);

  const startTime = Date.now();
  try {
    const res = await sendMessageToBackground({ action: MESSAGE_ACTIONS.TEST_CONNECTION });
    const latency = Date.now() - startTime;

    if (res && res.success) {
      updateStatusBadge(CONNECTION_STATUS.CONNECTED);
      const usageInfo = res.data?.usage !== undefined ? ` (Usage: $${res.data.usage.toFixed(4)})` : '';
      connectionStatusText.textContent = `Verified (${latency}ms)`;
      showNotification(`Test passed in ${latency}ms! OpenRouter is reachable.${usageInfo}`, 'success');
    } else {
      updateStatusBadge(res?.status || CONNECTION_STATUS.ERROR);
      connectionStatusText.textContent = 'Failed';
      showNotification(`Test failed: ${res?.message || 'Unable to connect to OpenRouter.'}`, 'error');
    }
  } catch (err) {
    updateStatusBadge(CONNECTION_STATUS.NETWORK_ERROR);
    connectionStatusText.textContent = 'Network Error';
    showNotification(`Test error: ${err.message}`, 'error');
  } finally {
    setButtonLoading(btnTestApi, testSpinner, false);
  }
}

/**
 * Handles "Change API Key" button.
 */
function handleChangeApi() {
  clearNotification();
  isEditing = true;
  showSetupView(currentConfig);
}

/**
 * Handles "Remove API Key" button.
 */
async function handleRemoveApi() {
  const confirmed = confirm(
    'Are you sure you want to remove your OpenRouter API key?\n\n' +
    'This will delete the key from this browser profile\'s local storage. AI features will be deactivated until a new key is added.'
  );

  if (!confirmed) return;

  clearNotification();
  try {
    const res = await sendMessageToBackground({ action: MESSAGE_ACTIONS.REMOVE_KEY });
    if (res && res.success) {
      currentConfig = res.config;
      isEditing = false;
      showSetupView(null);
      updateStatusBadge(CONNECTION_STATUS.UNCONFIGURED);
      showNotification('API key removed from this browser profile.', 'info');
    }
  } catch (err) {
    showNotification('Failed to remove API key: ' + err.message, 'error');
  }
}

/**
 * Helpers & Utilities
 */

function sendMessageToBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      resolve(response);
    });
  });
}

function getActiveTabs() {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      return resolve([]);
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime?.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      resolve(tabs || []);
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime?.lastError) {
        return resolve(null);
      }
      resolve(response);
    });
  });
}

function updateStatusBadge(status) {
  statusBadge.className = 'status-badge';

  switch (status) {
    case CONNECTION_STATUS.CONNECTED:
      statusBadge.classList.add('badge-connected');
      statusBadgeText.textContent = 'Connected';
      break;
    case CONNECTION_STATUS.CONNECTING:
      statusBadge.classList.add('badge-connecting');
      statusBadgeText.textContent = 'Testing...';
      break;
    case CONNECTION_STATUS.INVALID_KEY:
      statusBadge.classList.add('badge-error');
      statusBadgeText.textContent = 'Invalid Key';
      break;
    case CONNECTION_STATUS.RATE_LIMITED:
      statusBadge.classList.add('badge-error');
      statusBadgeText.textContent = 'Rate Limit';
      break;
    case CONNECTION_STATUS.NO_CREDITS:
      statusBadge.classList.add('badge-error');
      statusBadgeText.textContent = 'No Credits';
      break;
    case CONNECTION_STATUS.NETWORK_ERROR:
      statusBadge.classList.add('badge-error');
      statusBadgeText.textContent = 'Offline';
      break;
    case CONNECTION_STATUS.ERROR:
      statusBadge.classList.add('badge-error');
      statusBadgeText.textContent = 'Error';
      break;
    case CONNECTION_STATUS.UNCONFIGURED:
    default:
      statusBadge.classList.add('badge-unconfigured');
      statusBadgeText.textContent = 'Not Set';
      break;
  }
}

function getStatusText(status) {
  switch (status) {
    case CONNECTION_STATUS.CONNECTED:
      return 'Connected & Verified';
    case CONNECTION_STATUS.INVALID_KEY:
      return 'Invalid Key';
    case CONNECTION_STATUS.RATE_LIMITED:
      return 'Rate Limited';
    case CONNECTION_STATUS.NO_CREDITS:
      return 'Insufficient Credits';
    case CONNECTION_STATUS.NETWORK_ERROR:
      return 'Network Unreachable';
    default:
      return 'Ready';
  }
}

function showNotification(message, type = 'info') {
  notificationAlert.className = `notification-alert ${type}`;
  notificationMessage.textContent = message;

  switch (type) {
    case 'success':
      notificationIcon.textContent = '✓';
      break;
    case 'error':
      notificationIcon.textContent = '✕';
      break;
    default:
      notificationIcon.textContent = 'ℹ';
      break;
  }

  notificationAlert.classList.remove('hidden');
}

function clearNotification() {
  notificationAlert.classList.add('hidden');
  notificationMessage.textContent = '';
}

function setConnectingState(isConnecting) {
  btnConnect.disabled = isConnecting;
  apiKeyInput.disabled = isConnecting;
  modelSelect.disabled = isConnecting;
  customModelInput.disabled = isConnecting;

  if (isConnecting) {
    connectSpinner.classList.remove('hidden');
    connectBtnText.textContent = 'Connecting...';
  } else {
    connectSpinner.classList.add('hidden');
    connectBtnText.textContent = isEditing ? 'Save & Connect' : 'Connect API';
  }
}

function setButtonLoading(button, spinner, isLoading) {
  button.disabled = isLoading;
  if (isLoading) {
    spinner.classList.remove('hidden');
  } else {
    spinner.classList.add('hidden');
  }
}

function setAnalyzeLoading(isLoading) {
  btnAnalyzeForm.disabled = isLoading;
  if (isLoading) {
    analyzeSpinner.classList.remove('hidden');
  } else {
    analyzeSpinner.classList.add('hidden');
  }
}

function setAnalyzeAndApplyLoading(isLoading) {
  btnAnalyzeAndApply.disabled = isLoading;
  if (isLoading) {
    analyzeApplySpinner.classList.remove('hidden');
  } else {
    analyzeApplySpinner.classList.add('hidden');
  }
}

function setApplyLoading(isLoading) {
  btnApplySelections.disabled = isLoading;
  if (isLoading) {
    applySpinner.classList.remove('hidden');
  } else {
    applySpinner.classList.add('hidden');
  }
}

function isCustomModel(model) {
  if (!model) return false;
  const standardIds = [
    'openrouter/free',
    'google/gemini-2.0-flash-001',
    'openai/gpt-4o-mini',
    'anthropic/claude-3.5-haiku',
    'meta-llama/llama-3.3-70b-instruct',
    'deepseek/deepseek-chat'
  ];
  return !standardIds.includes(model);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
