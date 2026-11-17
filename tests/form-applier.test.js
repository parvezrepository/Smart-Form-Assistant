import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applySelectionsToForm, isSubmitButton } from '../common/form-applier.js';
import { QUESTION_TYPES } from '../common/constants.js';

class MockElement {
  constructor(tag = 'div', attrs = {}, textContent = '', children = []) {
    this.tagName = tag.toUpperCase();
    this.attributes = { ...attrs };
    this.textContent = textContent;
    this.children = children;
    this.parentElement = null;
    this.clicked = false;

    for (const child of this.children) {
      child.parentElement = this;
    }
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  hasAttribute(name) {
    return name in this.attributes;
  }

  click() {
    this.clicked = true;
    // Simulate radio / checkbox state change
    const role = this.getAttribute('role');
    if (role === 'radio') {
      // Uncheck siblings in radiogroup
      if (this.parentElement) {
        for (const sibling of this.parentElement.children) {
          if (sibling.getAttribute('role') === 'radio') {
            sibling.setAttribute('aria-checked', 'false');
          }
        }
      }
      this.setAttribute('aria-checked', 'true');
    } else if (role === 'checkbox') {
      const isChecked = this.getAttribute('aria-checked') === 'true';
      this.setAttribute('aria-checked', isChecked ? 'false' : 'true');
    }
  }

  dispatchEvent() {
    return true;
  }

  querySelector(selector) {
    const list = this.querySelectorAll(selector);
    return list.length > 0 ? list[0] : null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const subSelectors = selector.split(',').map(s => s.trim());

    const traverse = (node) => {
      for (const child of node.children) {
        for (const sel of subSelectors) {
          if (matchSelector(child, sel)) {
            matches.push(child);
            break;
          }
        }
        traverse(child);
      }
    };

    traverse(this);
    return matches;
  }
}

function matchSelector(el, selector) {
  let s = selector.trim();
  let tag = '';
  const firstBracket = s.indexOf('[');
  if (firstBracket !== -1) {
    tag = s.slice(0, firstBracket);
    s = s.slice(firstBracket);
  } else if (!s.startsWith('.')) {
    tag = s;
    s = '';
  }

  if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) {
    return false;
  }

  const attrMatches = s.match(/\[([^\]]+)\]/g);
  if (attrMatches) {
    for (const am of attrMatches) {
      let raw = am.slice(1, -1).trim();
      if (raw.includes('=')) {
        const [k, v] = raw.split('=').map(x => x.trim().replace(/^['"]|['"]$/g, ''));
        if (el.getAttribute(k) !== v) return false;
      } else {
        if (!el.hasAttribute(raw)) return false;
      }
    }
  }

  return true;
}

function createTestDoc() {
  const root = new MockElement('html', {}, '', []);

  // Radio Q1
  const r1 = new MockElement('div', { role: 'radio', 'aria-checked': 'false', 'data-sfta-oid': 'sfta_opt_0', 'data-value': 'JavaScript' }, 'JavaScript');
  const r2 = new MockElement('div', { role: 'radio', 'aria-checked': 'false', 'data-sfta-oid': 'sfta_opt_1', 'data-value': 'Python' }, 'Python');
  const radioGroup = new MockElement('div', { role: 'radiogroup' }, '', [r1, r2]);
  const q1 = new MockElement('div', { role: 'listitem', 'data-sfta-qid': 'sfta_q_1' }, 'Language Question', [radioGroup]);

  // Checkbox Q2
  const c1 = new MockElement('div', { role: 'checkbox', 'aria-checked': 'false', 'data-sfta-oid': 'sfta_opt_0', 'data-value': 'Git' }, 'Git');
  const c2 = new MockElement('div', { role: 'checkbox', 'aria-checked': 'false', 'data-sfta-oid': 'sfta_opt_1', 'data-value': 'Docker' }, 'Docker');
  const q2 = new MockElement('div', { role: 'listitem', 'data-sfta-qid': 'sfta_q_2' }, 'Tools Question', [c1, c2]);

  // Submit button element (must be protected)
  const submitBtn = new MockElement('button', { type: 'submit', 'aria-label': 'Submit Form' }, 'Submit');

  const form = new MockElement('form', {}, '', [q1, q2, submitBtn]);
  root.children.push(form);
  form.parentElement = root;

  return {
    root,
    q1,
    r1,
    r2,
    q2,
    c1,
    c2,
    submitBtn,
    doc: {
      querySelector: (sel) => root.querySelector(sel),
      querySelectorAll: (sel) => root.querySelectorAll(sel)
    }
  };
}

describe('Form Applier & DOM Selection Verification (Phase 04)', () => {
  test('isSubmitButton accurately flags submit buttons and triggers', () => {
    const btn1 = new MockElement('button', { type: 'submit' }, 'Submit Form');
    assert.strictEqual(isSubmitButton(btn1), true);

    const btn2 = new MockElement('div', { role: 'button', 'aria-label': 'Submit' }, 'Submit');
    assert.strictEqual(isSubmitButton(btn2), true);

    const normalRadio = new MockElement('div', { role: 'radio' }, 'Option 1');
    assert.strictEqual(isSubmitButton(normalRadio), false);

    const normalCheckbox = new MockElement('div', { role: 'checkbox' }, 'Option A');
    assert.strictEqual(isSubmitButton(normalCheckbox), false);
  });

  test('successfully applies and verifies radio selection', () => {
    const { doc, r1, r2 } = createTestDoc();

    assert.strictEqual(r1.getAttribute('aria-checked'), 'false');

    const selections = [
      {
        questionId: 'sfta_q_1',
        type: QUESTION_TYPES.RADIO,
        selectedOptionIds: ['sfta_opt_0'],
        selectedOptionLabels: ['JavaScript']
      }
    ];

    const result = applySelectionsToForm(doc, selections);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.totalApplied, 1);
    assert.strictEqual(result.totalVerified, 1);
    assert.strictEqual(r1.getAttribute('aria-checked'), 'true');
    assert.strictEqual(r1.clicked, true);
    assert.strictEqual(r2.getAttribute('aria-checked'), 'false');
  });

  test('successfully applies and verifies multiple checkbox selections', () => {
    const { doc, c1, c2 } = createTestDoc();

    assert.strictEqual(c1.getAttribute('aria-checked'), 'false');
    assert.strictEqual(c2.getAttribute('aria-checked'), 'false');

    const selections = [
      {
        questionId: 'sfta_q_2',
        type: QUESTION_TYPES.CHECKBOX,
        selectedOptionIds: ['sfta_opt_0', 'sfta_opt_1'],
        selectedOptionLabels: ['Git', 'Docker']
      }
    ];

    const result = applySelectionsToForm(doc, selections);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.totalApplied, 2);
    assert.strictEqual(result.totalVerified, 2);
    assert.strictEqual(c1.getAttribute('aria-checked'), 'true');
    assert.strictEqual(c2.getAttribute('aria-checked'), 'true');
  });

  test('blocks attempt to apply selection to a submit button', () => {
    const { doc, submitBtn } = createTestDoc();
    submitBtn.setAttribute('data-sfta-oid', 'sfta_fake_submit_opt');

    const selections = [
      {
        questionId: 'sfta_q_1',
        selectedOptionIds: ['sfta_fake_submit_opt'],
        selectedOptionLabels: ['Submit']
      }
    ];

    // Attempting to target submit button must fail and never click submit
    const result = applySelectionsToForm(doc, selections);
    assert.strictEqual(submitBtn.clicked, false);
    assert.strictEqual(result.failedCount, 1);
    assert.ok(result.details[0].error.includes('Option element not found') || result.details[0].error.includes('Blocked'));
  });

  test('handles empty or missing selections gracefully', () => {
    const { doc } = createTestDoc();
    const res = applySelectionsToForm(doc, []);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.totalApplied, 0);
  });
});
