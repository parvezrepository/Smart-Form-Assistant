/**
 * Smart Form Tick Assistant - Content Script (Phase 01, 02, 03, 04)
 * Injected into Google Forms pages (docs.google.com/forms/*).
 * Scans questions and applies approved radio and checkbox selections to the page DOM.
 *
 * CRITICAL SECURITY & SAFETY PRINCIPLES:
 * 1. This script NEVER handles, receives, or requests OpenRouter API keys.
 * 2. This script NEVER automatically submits the Google Form. Submit buttons are strictly protected.
 */

(function () {
  'use strict';

  const QUESTION_TYPES = {
    RADIO: 'RADIO',
    CHECKBOX: 'CHECKBOX',
    SHORT_TEXT: 'SHORT_TEXT',
    PARAGRAPH: 'PARAGRAPH',
    DROPDOWN: 'DROPDOWN',
    LINEAR_SCALE: 'LINEAR_SCALE',
    GRID: 'GRID',
    OTHER: 'OTHER'
  };

  const MESSAGE_ACTIONS = {
    DETECT_FORM: 'SFTA_DETECT_FORM',
    APPLY_SELECTIONS: 'SFTA_APPLY_SELECTIONS'
  };

  function cleanText(str) {
    if (!str) return '';
    return str
      .replace(/\u00A0/g, ' ')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isGoogleForm(doc = document) {
    if (!doc) return false;
    const url = doc.location ? doc.location.href : '';
    if (/docs\.google\.com\/forms\//i.test(url)) {
      return true;
    }
    const hasFormAction = Boolean(doc.querySelector('form[action*="formResponse"]'));
    const hasFormContent = Boolean(doc.querySelector('.freebirdFormviewcvFormContent, [jsmodel*="CP1oW"]'));
    const hasFormList = Boolean(doc.querySelector('div[role="list"][aria-label*="questions" i], div[role="list"] div[role="listitem"]'));
    return hasFormAction || hasFormContent || hasFormList;
  }

  function extractFormTitle(doc = document) {
    const headingEl = doc.querySelector('div[role="heading"][aria-level="1"], .F9iAGc, .freebirdFormviewcvHeaderTitle');
    if (headingEl && headingEl.textContent.trim()) {
      return cleanText(headingEl.textContent);
    }
    if (doc.title) {
      return doc.title.replace(/\s*-\s*Google Forms\s*$/i, '').trim();
    }
    return 'Google Form';
  }

  function extractFormDescription(doc = document) {
    const descEl = doc.querySelector('.freebirdFormviewcvHeaderDescription, .cBDRqd, .I42dpf');
    return descEl ? cleanText(descEl.textContent) : '';
  }

  function extractSectionInfo(doc = document) {
    let currentSection = 1;
    let totalSections = 1;
    let sectionTitle = '';

    const textEls = doc.querySelectorAll('.D29tje, .k3E5ec, [role="progressbar"]');
    for (const el of textEls) {
      const match = (el.textContent || '').match(/(?:Page|Section)\s+(\d+)\s+of\s+(\d+)/i);
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

  function parseOptionNode(node, optIndex, kind) {
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

  function parseQuestionContainer(container, index) {
    if (!container) return null;

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

    if (!radioGroup && checkboxElements.length === 0 && !hasInputs) {
      return null;
    }

    const isRequired = Boolean(
      container.querySelector('span[aria-label*="Required" i], .vnumgf, span[aria-hidden="true"]') &&
      (container.textContent.includes('*') || container.querySelector('[aria-label*="Required" i]'))
    );

    const cleanTitle = titleText.replace(/\s*\*\s*$/, '').trim() || `Question ${index}`;
    const descEl = container.querySelector('.g4Ecqv, .p9Sfvf, .cBDRqd');
    const description = descEl ? cleanText(descEl.textContent) : '';

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

  function extractGoogleFormData(doc = document) {
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

    let rawContainers = Array.from(doc.querySelectorAll('div[role="listitem"]'));
    let questionContainers = rawContainers.filter(el => {
      if (!el.parentElement || typeof el.parentElement.closest !== 'function') return true;
      return !el.parentElement.closest('div[role="listitem"]');
    });

    if (questionContainers.length === 0) {
      questionContainers = Array.from(doc.querySelectorAll('.Qr7Oae, .geS5n'));
    }

    const questions = [];
    let questionIndex = 1;

    for (const container of questionContainers) {
      const q = parseQuestionContainer(container, questionIndex);
      if (q) {
        questions.push(q);
        questionIndex++;
      }
    }

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

  function isSubmitButton(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    const text = (el.textContent || '').trim().toLowerCase();
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();

    if (tag === 'button' && type === 'submit') return true;
    if (tag === 'input' && type === 'submit') return true;
    if (role === 'button' && (ariaLabel.includes('submit') || text === 'submit')) return true;

    let curr = el.parentElement;
    while (curr && curr.tagName && curr.tagName.toLowerCase() !== 'body') {
      const parentAria = (curr.getAttribute('aria-label') || '').toLowerCase();
      const parentText = (curr.textContent || '').trim().toLowerCase();
      if (curr.getAttribute('role') === 'button' && (parentAria.includes('submit') || parentText === 'submit')) {
        return true;
      }
      curr = curr.parentElement;
    }
    return false;
  }

  /**
   * Dispatches a single clean user click on a DOM element.
   * Fires ONLY el.click() so Google Forms' Closure/Wiz jsaction does not double-toggle.
   */
  function simulateUserClick(el) {
    if (!el) return;
    if (typeof el.click === 'function') {
      el.click();
    } else if (typeof MouseEvent !== 'undefined') {
      const opts = { bubbles: true, cancelable: true, composed: true, view: window };
      el.dispatchEvent(new MouseEvent('click', opts));
    }
  }

  /**
   * Asynchronously applies approved selections to Google Forms DOM and verifies outcomes after Wiz framework updates.
   */
  async function applySelectionsToFormAsync(doc = document, approvedSelections = []) {
    if (!doc || !Array.isArray(approvedSelections) || approvedSelections.length === 0) {
      return {
        success: false,
        totalApplied: 0,
        totalVerified: 0,
        failedCount: 0,
        details: [],
        message: 'No selections provided to apply.'
      };
    }

    // Re-tag DOM first if data-sfta-qid attributes were cleared by Google Forms re-render
    if (!doc.querySelector('[data-sfta-qid]')) {
      extractGoogleFormData(doc);
    }

    const rawContainers = Array.from(doc.querySelectorAll('div[role="listitem"], .Qr7Oae, .geS5n'));
    const topContainers = rawContainers.filter(el => {
      if (!el.parentElement || typeof el.parentElement.closest !== 'function') return true;
      return !el.parentElement.closest('div[role="listitem"]');
    });

    const pendingVerification = [];
    const results = [];
    let totalApplied = 0;
    let failedCount = 0;

    for (const item of approvedSelections) {
      const { questionId, title, selectedOptionIds = [], selectedOptionLabels = [] } = item;

      let container = doc.querySelector(`div[data-sfta-qid="${questionId}"]`);
      if (!container && title) {
        const normalizedTargetTitle = cleanText(title).toLowerCase();
        container = topContainers.find(c => {
          const heading = c.querySelector('.M7eMe, div[role="heading"], span[role="heading"]');
          const hText = heading ? cleanText(heading.textContent).replace(/\s*\*\s*$/, '').toLowerCase() : '';
          return hText && (hText === normalizedTargetTitle || hText.includes(normalizedTargetTitle));
        }) || null;
      }
      if (!container && item.index && topContainers[item.index - 1]) {
        container = topContainers[item.index - 1];
      }

      if (!container) {
        failedCount++;
        results.push({
          questionId,
          applied: false,
          verified: false,
          error: 'Question container not found.'
        });
        continue;
      }

      const candidateNodes = Array.from(container.querySelectorAll('div[role="radio"], div[role="checkbox"]'));

      for (let i = 0; i < selectedOptionIds.length; i++) {
        const optId = selectedOptionIds[i];
        const optLabel = cleanText(selectedOptionLabels[i] || '');

        let optionNode = container.querySelector(`div[data-sfta-oid="${optId}"]`);

        // Fallback 1: match by option index parsed from sfta_opt_N
        if (!optionNode && typeof optId === 'string' && optId.startsWith('sfta_opt_')) {
          const parsedIdx = parseInt(optId.replace('sfta_opt_', ''), 10);
          if (!Number.isNaN(parsedIdx) && candidateNodes[parsedIdx]) {
            optionNode = candidateNodes[parsedIdx];
          }
        }

        // Fallback 2: match by data-value, data-answer-value, aria-label, or row text
        if (!optionNode && optLabel) {
          const lowerLabel = optLabel.toLowerCase();
          optionNode = candidateNodes.find(node => {
            const dVal = cleanText(node.getAttribute('data-value') || '').toLowerCase();
            const dAns = cleanText(node.getAttribute('data-answer-value') || '').toLowerCase();
            const aLbl = cleanText(node.getAttribute('aria-label') || '').toLowerCase();
            const row = node.closest('label') || node.parentElement;
            const rText = cleanText(row ? row.textContent : node.textContent || '').toLowerCase();
            return dVal === lowerLabel || dAns === lowerLabel || aLbl === lowerLabel || rText === lowerLabel || rText.includes(lowerLabel);
          }) || null;
        }

        if (!optionNode) {
          failedCount++;
          results.push({
            questionId,
            optionId: optId,
            label: optLabel,
            applied: false,
            verified: false,
            error: 'Option element not found.'
          });
          continue;
        }

        if (isSubmitButton(optionNode)) {
          failedCount++;
          results.push({
            questionId,
            optionId: optId,
            applied: false,
            verified: false,
            error: 'Blocked submit interaction.'
          });
          continue;
        }

        const isAlreadyChecked = optionNode.getAttribute('aria-checked') === 'true';
        if (!isAlreadyChecked) {
          simulateUserClick(optionNode);
        }
        totalApplied++;

        pendingVerification.push({
          questionId,
          optionId: optId,
          label: optLabel,
          optionNode,
          container
        });
      }
    }

    // Wait 60ms for Google Forms' Closure/Wiz jsaction controller to update aria-checked
    if (pendingVerification.length > 0) {
      await new Promise(r => setTimeout(r, 60));
    }

    // Check if any option still needs a click on its enclosing <label> wrapper
    let needsSecondWait = false;
    for (const pv of pendingVerification) {
      if (pv.optionNode.getAttribute('aria-checked') !== 'true') {
        const labelEl = pv.optionNode.closest('label') || pv.optionNode.parentElement;
        if (labelEl && !isSubmitButton(labelEl)) {
          simulateUserClick(labelEl);
          needsSecondWait = true;
        }
      }
    }

    if (needsSecondWait) {
      await new Promise(r => setTimeout(r, 60));
    }

    let totalVerified = 0;
    for (const pv of pendingVerification) {
      const isVerified = pv.optionNode.getAttribute('aria-checked') === 'true';
      if (isVerified) {
        totalVerified++;
        if (pv.container && pv.container.style) {
          pv.container.style.borderLeft = '4px solid #10b981';
          pv.container.style.transition = 'border-left 0.2s ease';
        }
      } else {
        failedCount++;
      }

      results.push({
        questionId: pv.questionId,
        optionId: pv.optionId,
        label: pv.label,
        applied: true,
        verified: isVerified,
        error: isVerified ? null : 'Click dispatched but aria-checked was not confirmed.'
      });
    }

    const allSucceeded = failedCount === 0 && totalVerified > 0;
    return {
      success: totalVerified > 0 || totalApplied > 0,
      allSucceeded,
      totalApplied,
      totalVerified,
      failedCount,
      details: results,
      message: allSucceeded
        ? `Successfully applied and verified ${totalVerified} selection(s)!`
        : `Applied ${totalApplied} selection(s); verified ${totalVerified}.`
    };
  }

  // Upgradeable singleton message handler so re-injecting content.js always uses the newest logic
  window.__SFTA_MESSAGE_HANDLER = (request, sender, sendResponse) => {
    if (!request || !request.action) return false;

    if (request.action === MESSAGE_ACTIONS.DETECT_FORM) {
      try {
        const result = extractGoogleFormData(document);
        sendResponse({ success: true, data: result });
      } catch (err) {
        sendResponse({ success: false, error: err.message || 'Failed to detect Google Form questions' });
      }
      return false;
    }

    if (request.action === MESSAGE_ACTIONS.APPLY_SELECTIONS) {
      applySelectionsToFormAsync(document, request.payload?.selections || [])
        .then(result => {
          sendResponse({ success: result.success, data: result });
        })
        .catch(err => {
          sendResponse({ success: false, error: err.message || 'Failed to apply selections' });
        });
      return true; // Keep message channel open for async verification
    }

    return false;
  };

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage && !window.__SFTA_LISTENER_REGISTERED) {
    window.__SFTA_LISTENER_REGISTERED = true;
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (typeof window.__SFTA_MESSAGE_HANDLER === 'function') {
        return window.__SFTA_MESSAGE_HANDLER(request, sender, sendResponse);
      }
      return false;
    });
  }

  if (typeof window !== 'undefined') {
    window.__SFTA_DETECTOR = {
      isGoogleForm,
      extractGoogleFormData,
      applySelectionsToForm: applySelectionsToFormAsync,
      isSubmitButton,
      QUESTION_TYPES
    };
  }
})();
