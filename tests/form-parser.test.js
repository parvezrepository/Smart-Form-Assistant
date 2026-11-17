import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isGoogleForm,
  extractGoogleFormData,
  extractFormTitle,
  extractFormDescription,
  extractSectionInfo,
  extractQuestions,
  parseQuestionContainer,
  parseOptionNode
} from '../common/form-parser.js';
import { QUESTION_TYPES } from '../common/constants.js';

/**
 * Lightweight in-memory DOM Node Mock for testing extraction without heavy dependencies.
 */
class MockElement {
  constructor(tag = 'div', attrs = {}, textContent = '', children = []) {
    this.tagName = tag.toUpperCase();
    this.attributes = { ...attrs };
    this.textContent = textContent;
    this.children = children;
    this.parentElement = null;

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

  closest(selector) {
    let curr = this.parentElement;
    while (curr) {
      if (curr.matches(selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  matches(selector) {
    return matchSingle(this, selector);
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
  // Split by whitespace only outside of square brackets [ ... ]
  const parts = selector.trim().split(/\s+(?![^\[]*\])/);
  if (parts.length > 1) {
    let curr = el;
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!curr) return false;
      if (!matchSingle(curr, parts[i])) return false;
      curr = curr.parentElement;
    }
    return true;
  }
  return matchSingle(el, selector);
}

function matchSingle(el, selector) {
  let s = selector.trim();

  // Extract tag if present
  let tag = '';
  const firstBracket = s.indexOf('[');
  const firstDot = s.indexOf('.');
  let cutIndex = -1;
  if (firstBracket !== -1 && firstDot !== -1) {
    cutIndex = Math.min(firstBracket, firstDot);
  } else if (firstBracket !== -1) {
    cutIndex = firstBracket;
  } else if (firstDot !== -1) {
    cutIndex = firstDot;
  }

  if (cutIndex > 0) {
    tag = s.slice(0, cutIndex);
    s = s.slice(cutIndex);
  } else if (cutIndex === -1 && !s.startsWith('.') && !s.startsWith('[')) {
    tag = s;
    s = '';
  }

  if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) {
    return false;
  }

  // Check classes e.g. .class1.class2
  const classMatches = s.match(/\.([a-zA-Z0-9_\-]+)/g);
  if (classMatches) {
    const elClasses = (el.attributes['class'] || '').split(/\s+/);
    for (const cm of classMatches) {
      if (!elClasses.includes(cm.slice(1))) return false;
    }
  }

  // Check all attribute brackets e.g. [role="button"][aria-label*="Next" i]
  const attrMatches = s.match(/\[([^\]]+)\]/g);
  if (attrMatches) {
    for (const am of attrMatches) {
      let raw = am.slice(1, -1).trim();
      const caseInsensitive = /\s+i$/i.test(raw);
      if (caseInsensitive) {
        raw = raw.replace(/\s+i$/i, '').trim();
      }

      if (raw.includes('*=')) {
        const [k, v] = raw.split('*=').map(x => x.trim().replace(/^['"]|['"]$/g, ''));
        const actualVal = el.getAttribute(k) || '';
        if (caseInsensitive) {
          if (!actualVal.toLowerCase().includes(v.toLowerCase())) return false;
        } else {
          if (!actualVal.includes(v)) return false;
        }
      } else if (raw.includes('=')) {
        const [k, v] = raw.split('=').map(x => x.trim().replace(/^['"]|['"]$/g, ''));
        const actualVal = el.getAttribute(k) || '';
        if (caseInsensitive) {
          if (actualVal.toLowerCase() !== v.toLowerCase()) return false;
        } else {
          if (actualVal !== v) return false;
        }
      } else {
        if (!el.hasAttribute(raw)) return false;
      }
    }
  }

  return true;
}

/**
 * Creates a Mock Google Form Document.
 */
function createMockGoogleFormDoc(url = 'https://docs.google.com/forms/d/e/1FAIpQLSc-example/viewform') {
  const root = new MockElement('html', {}, '', []);

  // Form Title & Description
  const titleEl = new MockElement('div', { class: 'F9iAGc', role: 'heading', 'aria-level': '1' }, 'Developer Preference Survey');
  const descEl = new MockElement('div', { class: 'freebirdFormviewcvHeaderDescription' }, 'Help us understand tooling trends.');

  // Section Indicator: "Section 2 of 4"
  const sectionEl = new MockElement('div', { class: 'D29tje' }, 'Section 2 of 4');
  const nextBtn = new MockElement('div', { role: 'button', 'aria-label': 'Next' }, 'Next');
  const backBtn = new MockElement('div', { role: 'button', 'aria-label': 'Back' }, 'Back');

  // Question 1: Single Choice (Radio)
  const q1Title = new MockElement('div', { class: 'M7eMe' }, 'What is your primary programming language? *');
  const q1Req = new MockElement('span', { 'aria-label': 'Required question', class: 'vnumgf' }, '*');
  const q1Radio1 = new MockElement('div', { role: 'radio', 'aria-checked': 'true', class: 'aDTYNe', 'data-value': 'JavaScript' }, 'JavaScript');
  const q1Radio2 = new MockElement('div', { role: 'radio', 'aria-checked': 'false', class: 'aDTYNe', 'data-value': 'Python' }, 'Python');
  const q1Radio3 = new MockElement('div', { role: 'radio', 'aria-checked': 'false', class: 'aDTYNe', 'data-value': '__other_option__' }, 'Other');
  const q1RadioGroup = new MockElement('div', { role: 'radiogroup' }, '', [q1Radio1, q1Radio2, q1Radio3]);
  const q1Container = new MockElement('div', { role: 'listitem' }, 'What is your primary programming language? *', [q1Title, q1Req, q1RadioGroup]);

  // Question 2: Multiple Choice (Checkbox)
  const q2Title = new MockElement('div', { class: 'M7eMe' }, 'Which tools do you use regularly?');
  const q2Subtext = new MockElement('div', { class: 'g4Ecqv' }, 'Select all that apply to your workflow.');
  const q2Check1 = new MockElement('div', { role: 'checkbox', 'aria-checked': 'true', class: 'aDTYNe', 'data-value': 'VS Code' }, 'VS Code');
  const q2Check2 = new MockElement('div', { role: 'checkbox', 'aria-checked': 'true', class: 'aDTYNe', 'data-value': 'Git' }, 'Git');
  const q2Check3 = new MockElement('div', { role: 'checkbox', 'aria-checked': 'false', class: 'aDTYNe', 'data-value': 'Docker' }, 'Docker');
  const q2Container = new MockElement('div', { role: 'listitem' }, 'Which tools do you use regularly?', [q2Title, q2Subtext, q2Check1, q2Check2, q2Check3]);

  // Question 3: Short Answer Text
  const q3Title = new MockElement('div', { class: 'M7eMe' }, 'Your GitHub Username');
  const q3Input = new MockElement('input', { type: 'text', class: 'whsOnd' }, '');
  const q3Container = new MockElement('div', { role: 'listitem' }, 'Your GitHub Username', [q3Title, q3Input]);

  // Form container
  const formEl = new MockElement('form', { action: 'https://docs.google.com/forms/u/0/d/e/.../formResponse' }, '', [
    titleEl,
    descEl,
    sectionEl,
    q1Container,
    q2Container,
    q3Container,
    backBtn,
    nextBtn
  ]);

  root.children.push(formEl);
  formEl.parentElement = root;

  return {
    location: { href: url },
    title: 'Developer Preference Survey - Google Forms',
    querySelector: (sel) => root.querySelector(sel),
    querySelectorAll: (sel) => root.querySelectorAll(sel)
  };
}

describe('Google Forms Detection & Extraction Service', () => {
  test('isGoogleForm accurately detects Google Form URL and elements', () => {
    const googleDoc = createMockGoogleFormDoc();
    assert.strictEqual(isGoogleForm(googleDoc), true);

    const nonGoogleDoc = {
      location: { href: 'https://example.com/checkout' },
      title: 'Checkout Page',
      querySelector: () => null,
      querySelectorAll: () => []
    };
    assert.strictEqual(isGoogleForm(nonGoogleDoc), false);
  });

  test('extractFormTitle and extractFormDescription extract metadata', () => {
    const doc = createMockGoogleFormDoc();
    assert.strictEqual(extractFormTitle(doc), 'Developer Preference Survey');
    assert.strictEqual(extractFormDescription(doc), 'Help us understand tooling trends.');
  });

  test('extractSectionInfo correctly identifies section pagination and navigation buttons', () => {
    const doc = createMockGoogleFormDoc();
    const section = extractSectionInfo(doc);

    assert.strictEqual(section.current, 2);
    assert.strictEqual(section.total, 4);
    assert.strictEqual(section.isMultiSection, true);
    assert.strictEqual(section.hasNextButton, true);
    assert.strictEqual(section.hasBackButton, true);
  });

  test('extractQuestions parses questions, identifies types, and extracts options', () => {
    const doc = createMockGoogleFormDoc();
    const questions = extractQuestions(doc);

    assert.strictEqual(questions.length, 3);

    // Q1: Radio
    const q1 = questions[0];
    assert.strictEqual(q1.type, QUESTION_TYPES.RADIO);
    assert.strictEqual(q1.title, 'What is your primary programming language?');
    assert.strictEqual(q1.required, true);
    assert.strictEqual(q1.options.length, 3);
    assert.strictEqual(q1.options[0].label, 'JavaScript');
    assert.strictEqual(q1.options[0].isChecked, true);
    assert.strictEqual(q1.options[1].label, 'Python');
    assert.strictEqual(q1.options[1].isChecked, false);
    assert.strictEqual(q1.options[2].isOther, true);

    // Q2: Checkbox
    const q2 = questions[1];
    assert.strictEqual(q2.type, QUESTION_TYPES.CHECKBOX);
    assert.strictEqual(q2.title, 'Which tools do you use regularly?');
    assert.strictEqual(q2.description, 'Select all that apply to your workflow.');
    assert.strictEqual(q2.required, false);
    assert.strictEqual(q2.options.length, 3);
    assert.strictEqual(q2.options[0].label, 'VS Code');
    assert.strictEqual(q2.options[0].isChecked, true);
    assert.strictEqual(q2.options[1].label, 'Git');
    assert.strictEqual(q2.options[1].isChecked, true);
    assert.strictEqual(q2.options[2].label, 'Docker');
    assert.strictEqual(q2.options[2].isChecked, false);

    // Q3: Short Text
    const q3 = questions[2];
    assert.strictEqual(q3.type, QUESTION_TYPES.SHORT_TEXT);
    assert.strictEqual(q3.title, 'Your GitHub Username');
    assert.strictEqual(q3.options.length, 0);
  });

  test('extractGoogleFormData builds full summary with counts', () => {
    const doc = createMockGoogleFormDoc();
    const summary = extractGoogleFormData(doc);

    assert.strictEqual(summary.isForm, true);
    assert.strictEqual(summary.totalQuestions, 3);
    assert.strictEqual(summary.targetQuestionsCount, 2); // 1 Radio + 1 Checkbox
    assert.strictEqual(summary.radioCount, 1);
    assert.strictEqual(summary.checkboxCount, 1);
  });
});
