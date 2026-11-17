/**
 * Smart Form Tick Assistant - Google Forms Parser
 * Robust, resilient DOM extractor for Google Forms.
 * Handles questions, options, radio/checkbox identification, and sections.
 */

import { QUESTION_TYPES } from './constants.js';

/**
 * Checks if the current document is an active Google Form.
 * @param {Document} doc
 * @returns {boolean}
 */
export function isGoogleForm(doc = document) {
  if (!doc) return false;

  const url = doc.location ? doc.location.href : '';
  if (/docs\.google\.com\/forms\//i.test(url)) {
    return true;
  }

  // Fallback DOM check for Google Forms signature elements
  const hasFormAction = Boolean(doc.querySelector('form[action*="formResponse"]'));
  const hasFormContent = Boolean(doc.querySelector('.freebirdFormviewcvFormContent, [jsmodel*="CP1oW"]'));
  const hasFormList = Boolean(doc.querySelector('div[role="list"][aria-label*="questions" i], div[role="list"] div[role="listitem"]'));

  return hasFormAction || hasFormContent || hasFormList;
}

/**
 * Extracts form metadata, current section details, and all visible questions.
 * @param {Document} doc
 * @returns {object}
 */
export function extractGoogleFormData(doc = document) {
  if (!doc) {
    return {
      isForm: false,
      title: '',
      description: '',
      section: null,
      totalQuestions: 0,
      targetQuestionsCount: 0,
      questions: []
    };
  }

  const isForm = isGoogleForm(doc);
  const title = extractFormTitle(doc);
  const description = extractFormDescription(doc);
  const section = extractSectionInfo(doc);
  const questions = extractQuestions(doc);

  // Target questions are Checkbox and Radio questions (primary focus of this assistant)
  const targetQuestions = questions.filter(
    q => q.type === QUESTION_TYPES.RADIO || q.type === QUESTION_TYPES.CHECKBOX || q.type === QUESTION_TYPES.LINEAR_SCALE
  );

  return {
    isForm,
    title,
    description,
    section,
    totalQuestions: questions.length,
    targetQuestionsCount: targetQuestions.length,
    radioCount: questions.filter(q => q.type === QUESTION_TYPES.RADIO || q.type === QUESTION_TYPES.LINEAR_SCALE).length,
    checkboxCount: questions.filter(q => q.type === QUESTION_TYPES.CHECKBOX).length,
    questions
  };
}

/**
 * Extracts the form main title.
 * @param {Document} doc
 * @returns {string}
 */
export function extractFormTitle(doc = document) {
  const headingEl = doc.querySelector('div[role="heading"][aria-level="1"], .F9iAGc, .freebirdFormviewcvHeaderTitle');
  if (headingEl && headingEl.textContent.trim()) {
    return cleanText(headingEl.textContent);
  }

  if (doc.title) {
    return doc.title.replace(/\s*-\s*Google Forms\s*$/i, '').trim();
  }

  return 'Google Form';
}

/**
 * Extracts form header description if present.
 * @param {Document} doc
 * @returns {string}
 */
export function extractFormDescription(doc = document) {
  const descEl = doc.querySelector('.freebirdFormviewcvHeaderDescription, .cBDRqd, .I42dpf');
  return descEl ? cleanText(descEl.textContent) : '';
}

/**
 * Extracts information about sections (e.g., "Page 1 of 3", Next/Back/Submit buttons).
 * @param {Document} doc
 * @returns {object}
 */
export function extractSectionInfo(doc = document) {
  let currentSection = 1;
  let totalSections = 1;
  let sectionTitle = '';

  const allTextElements = doc.querySelectorAll('.D29tje, .k3E5ec, [role="progressbar"]');
  for (const el of allTextElements) {
    const text = el.textContent || '';
    const match = text.match(/(?:Page|Section)\s+(\d+)\s+of\s+(\d+)/i);
    if (match) {
      currentSection = parseInt(match[1], 10);
      totalSections = parseInt(match[2], 10);
      break;
    }
  }

  const sectionHeaderEl = doc.querySelector('.D29tje, .freebirdFormviewcvHeaderTitle:not([aria-level="1"])');
  if (sectionHeaderEl && sectionHeaderEl.textContent.trim()) {
    sectionTitle = cleanText(sectionHeaderEl.textContent);
  }

  const hasNextButton = Boolean(doc.querySelector('div[role="button"][aria-label*="Next" i], div[role="button"] span.NPEfkd'));
  const hasBackButton = Boolean(doc.querySelector('div[role="button"][aria-label*="Back" i]'));
  const hasSubmitButton = Boolean(doc.querySelector('div[role="button"][aria-label*="Submit" i], [type="submit"]'));

  return {
    current: currentSection,
    total: totalSections,
    title: sectionTitle,
    isMultiSection: totalSections > 1 || hasNextButton || hasBackButton,
    hasNextButton,
    hasBackButton,
    hasSubmitButton
  };
}

/**
 * Scans DOM and extracts all visible top-level questions.
 * Filters out nested role="listitem" elements (which Google Forms uses for individual checkbox rows).
 * @param {Document} doc
 * @returns {Array<object>}
 */
export function extractQuestions(doc = document) {
  // Strategy 1: Select top-level question containers by role="listitem"
  let rawContainers = Array.from(doc.querySelectorAll('div[role="listitem"]'));

  // Exclude nested role="listitem" elements (e.g., checkbox option wrappers inside a question)
  let questionContainers = rawContainers.filter(el => {
    if (!el.parentElement || typeof el.parentElement.closest !== 'function') return true;
    return !el.parentElement.closest('div[role="listitem"]');
  });

  // Strategy 2: Fallback to Google Forms question block classes if no top-level listitems found
  if (questionContainers.length === 0) {
    questionContainers = Array.from(doc.querySelectorAll('.Qr7Oae, .geS5n'));
  }

  const results = [];
  let questionIndex = 1;

  for (const container of questionContainers) {
    const question = parseQuestionContainer(container, questionIndex, doc);
    if (question) {
      results.push(question);
      questionIndex++;
    }
  }

  return results;
}

/**
 * Parses an individual question container element.
 * @param {Element} container
 * @param {number} index
 * @param {Document} doc
 * @returns {object|null}
 */
export function parseQuestionContainer(container, index, doc = document) {
  if (!container) return null;

  // 1. Extract Question Title
  const titleEl = container.querySelector('.M7eMe, div[role="heading"], span[role="heading"], .HoControl');
  let titleText = '';
  if (titleEl) {
    titleText = cleanText(titleEl.textContent);
  } else {
    const firstText = container.querySelector('span, div');
    titleText = firstText ? cleanText(firstText.textContent) : '';
  }

  const radioGroup = container.querySelector('div[role="radiogroup"]');
  const checkboxElements = container.querySelectorAll('div[role="checkbox"]');
  const hasInputs = container.querySelector('input[type="text"], input[type="email"], input[type="number"], input[type="date"], textarea, div[role="listbox"]');

  // Skip section headers or informational blocks that have no interactive inputs/options
  if (!radioGroup && checkboxElements.length === 0 && !hasInputs) {
    return null;
  }

  // Check required flag (red asterisk or aria-label)
  const isRequired = Boolean(
    container.querySelector('span[aria-label*="Required" i], .vnumgf, span[aria-hidden="true"]') &&
    (container.textContent.includes('*') || container.querySelector('[aria-label*="Required" i]'))
  );

  // Clean asterisk off title if attached
  const cleanTitle = titleText.replace(/\s*\*\s*$/, '').trim() || `Question ${index}`;

  // 2. Extract Optional Description / Subtext
  const descEl = container.querySelector('.g4Ecqv, .p9Sfvf, .cBDRqd');
  const description = descEl ? cleanText(descEl.textContent) : '';

  // 3. Identify Question Type and Extract Options
  let type = QUESTION_TYPES.OTHER;
  let options = [];

  if (radioGroup) {
    type = QUESTION_TYPES.RADIO;
    const radioNodes = radioGroup.querySelectorAll('div[role="radio"]');
    options = Array.from(radioNodes).map((radioNode, optIndex) => {
      return parseOptionNode(radioNode, optIndex, 'radio');
    });
  } else if (checkboxElements.length > 0) {
    type = QUESTION_TYPES.CHECKBOX;
    options = Array.from(checkboxElements).map((checkboxNode, optIndex) => {
      return parseOptionNode(checkboxNode, optIndex, 'checkbox');
    });
  } else if (container.querySelector('div[role="listbox"]')) {
    type = QUESTION_TYPES.DROPDOWN;
  } else if (container.querySelector('textarea')) {
    type = QUESTION_TYPES.PARAGRAPH;
  } else if (container.querySelector('input[type="text"], input[type="email"], input[type="number"], input[type="date"]')) {
    type = QUESTION_TYPES.SHORT_TEXT;
  }

  const questionId = `sfta_q_${index}`;
  container.setAttribute('data-sfta-qid', questionId);

  return {
    id: questionId,
    index,
    title: cleanTitle,
    description,
    required: isRequired,
    type,
    optionsCount: options.length,
    options
  };
}

/**
 * Parses an individual option node (radio or checkbox).
 * @param {Element} node
 * @param {number} optIndex
 * @param {string} kind
 * @returns {object}
 */
export function parseOptionNode(node, optIndex, kind = 'radio') {
  let label = '';
  const textContainer = node.querySelector('.aDTYNe, .nWQ3rd, .OvQpef, span.NPEfkd');
  if (textContainer && textContainer.textContent.trim()) {
    label = cleanText(textContainer.textContent);
  } else if (node.getAttribute('data-value')) {
    label = cleanText(node.getAttribute('data-value'));
  } else if (node.getAttribute('data-answer-value')) {
    label = cleanText(node.getAttribute('data-answer-value'));
  } else if (node.getAttribute('aria-label')) {
    label = cleanText(node.getAttribute('aria-label'));
  } else {
    const parentRow = node.closest('label') || node.parentElement;
    if (parentRow && parentRow.textContent.trim()) {
      label = cleanText(parentRow.textContent);
    } else {
      label = cleanText(node.textContent) || `Option ${optIndex + 1}`;
    }
  }

  const isOther = Boolean(
    label.toLowerCase() === 'other' ||
    label.toLowerCase().startsWith('other:') ||
    node.getAttribute('data-value') === '__other_option__' ||
    node.parentElement?.querySelector('input[type="text"][aria-label*="Other" i]')
  );

  const isChecked = node.getAttribute('aria-checked') === 'true';

  const optionId = `sfta_opt_${optIndex}`;
  node.setAttribute('data-sfta-oid', optionId);

  return {
    id: optionId,
    index: optIndex + 1,
    label,
    isChecked,
    isOther,
    kind
  };
}

/**
 * Removes excess whitespace, newlines, and non-breaking spaces.
 * @param {string} str
 * @returns {string}
 */
function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/\u00A0/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
