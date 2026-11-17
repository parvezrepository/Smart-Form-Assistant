/**
 * Smart Form Tick Assistant - Form Selection Applier & Verifier (Phase 04)
 * Applies approved radio and checkbox selections to Google Forms DOM.
 * Verifies that the correct options are selected post-click.
 *
 * CRITICAL SAFETY RULES:
 * 1. NEVER automatically submit the Google Form. Submit buttons are strictly protected.
 * 2. Only targets radio (div[role="radio"]) and checkbox (div[role="checkbox"]) elements.
 */

import { QUESTION_TYPES } from './constants.js';

/**
 * Applies approved selections to the Google Forms document and verifies outcomes.
 * @param {Document} doc - Target DOM document
 * @param {Array<object>} approvedSelections - Approved selections to apply
 * @returns {object} Execution and verification summary
 */
export function applySelectionsToForm(doc = document, approvedSelections = []) {
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

  const results = [];
  let totalApplied = 0;
  let totalVerified = 0;
  let failedCount = 0;

  const rawContainers = Array.from(doc.querySelectorAll('div[role="listitem"], .Qr7Oae, .geS5n'));
  const topContainers = rawContainers.filter(el => {
    if (!el.parentElement || typeof el.parentElement.closest !== 'function') return true;
    return !el.parentElement.closest('div[role="listitem"]');
  });

  for (const item of approvedSelections) {
    const { questionId, title, selectedOptionIds = [], selectedOptionLabels = [] } = item;

    let container = doc.querySelector(`div[data-sfta-qid="${questionId}"]`);
    if (!container && item.index && topContainers[item.index - 1]) {
      container = topContainers[item.index - 1];
    }
    if (!container && title) {
      const normalizedTargetTitle = title.toLowerCase().trim();
      container = topContainers.find(c => {
        const heading = c.querySelector('.M7eMe, div[role="heading"], span[role="heading"]');
        const hText = heading ? heading.textContent.replace(/\s*\*\s*$/, '').trim().toLowerCase() : '';
        return hText && (hText === normalizedTargetTitle || hText.includes(normalizedTargetTitle));
      }) || null;
    }

    if (!container) {
      failedCount++;
      results.push({
        questionId,
        applied: false,
        verified: false,
        error: 'Question container not found in page DOM.'
      });
      continue;
    }

    const candidateNodes = Array.from(container.querySelectorAll('div[role="radio"], div[role="checkbox"]'));

    for (let i = 0; i < selectedOptionIds.length; i++) {
      const optId = selectedOptionIds[i];
      const optLabel = (selectedOptionLabels[i] || '').trim();

      let optionNode = container.querySelector(`div[data-sfta-oid="${optId}"]`);

      if (!optionNode && typeof optId === 'string' && optId.startsWith('sfta_opt_')) {
        const parsedIdx = parseInt(optId.replace('sfta_opt_', ''), 10);
        if (!Number.isNaN(parsedIdx) && candidateNodes[parsedIdx]) {
          optionNode = candidateNodes[parsedIdx];
        }
      }

      if (!optionNode && optLabel) {
        const lowerLabel = optLabel.toLowerCase();
        optionNode = candidateNodes.find(node => {
          const dVal = (node.getAttribute('data-value') || '').trim().toLowerCase();
          const dAns = (node.getAttribute('data-answer-value') || '').trim().toLowerCase();
          const aLbl = (node.getAttribute('aria-label') || '').trim().toLowerCase();
          const row = typeof node.closest === 'function' ? (node.closest('label') || node.parentElement) : node.parentElement;
          const rText = (row ? row.textContent : node.textContent || '').trim().toLowerCase();
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
          error: 'Option element not found in DOM.'
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
          error: 'Blocked: Attempted interaction with a submit element is forbidden.'
        });
        continue;
      }

      const isAlreadyChecked = optionNode.getAttribute('aria-checked') === 'true';

      if (!isAlreadyChecked) {
        simulateUserClick(optionNode);
        totalApplied++;
      } else {
        totalApplied++;
      }

      const isVerified = optionNode.getAttribute('aria-checked') === 'true';
      if (isVerified) {
        totalVerified++;
      } else {
        failedCount++;
      }

      results.push({
        questionId,
        optionId: optId,
        label: optLabel,
        applied: true,
        verified: isVerified,
        error: isVerified ? null : 'Option was clicked but aria-checked was not set.'
      });
    }
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
      ? `Successfully applied and verified ${totalVerified} option(s).`
      : `Applied ${totalApplied} option(s); verified ${totalVerified}.`
  };
}

/**
 * Checks if a given DOM element is or contains a form submission trigger.
 * @param {Element} el
 * @returns {boolean}
 */
export function isSubmitButton(el) {
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
 * Simulates a single clean user click on a DOM element.
 * Fires ONLY el.click() so Google Forms' Closure/Wiz jsaction does not double-toggle.
 * @param {Element} el
 */
export function simulateUserClick(el) {
  if (!el) return;

  if (typeof el.click === 'function') {
    el.click();
  } else if (typeof MouseEvent !== 'undefined' && typeof el.dispatchEvent === 'function') {
    const opts = { bubbles: true, cancelable: true, composed: true, view: typeof window !== 'undefined' ? window : null };
    el.dispatchEvent(new MouseEvent('click', opts));
  }
}
