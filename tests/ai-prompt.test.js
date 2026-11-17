import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSystemPrompt,
  buildUserPrompt,
  parseAndValidateAIResponse,
  isPersonalOrAttendanceQuestion
} from '../common/ai-prompt.js';
import { QUESTION_TYPES } from '../common/constants.js';

describe('AI Prompt Generation & Structured Response Sanitizer', () => {
  const sampleQuestions = [
    {
      id: 'sfta_q_1',
      index: 1,
      type: QUESTION_TYPES.RADIO,
      title: 'What is your primary programming language?',
      required: true,
      options: [
        { id: 'sfta_opt_0', label: 'JavaScript' },
        { id: 'sfta_opt_1', label: 'Python' },
        { id: 'sfta_opt_2', label: 'Other', isOther: true }
      ]
    },
    {
      id: 'sfta_q_2',
      index: 2,
      type: QUESTION_TYPES.CHECKBOX,
      title: 'Select daily tools:',
      required: false,
      options: [
        { id: 'sfta_opt_0', label: 'VS Code' },
        { id: 'sfta_opt_1', label: 'Git' },
        { id: 'sfta_opt_2', label: 'Docker' }
      ]
    },
    {
      id: 'sfta_q_3',
      index: 3,
      type: QUESTION_TYPES.RADIO,
      title: 'What is your student identification number / roll number?',
      required: true,
      options: [
        { id: 'sfta_opt_0', label: 'Section A - 101' },
        { id: 'sfta_opt_1', label: 'Section B - 102' }
      ]
    }
  ];

  test('buildSystemPrompt contains anti-hallucination guardrails', () => {
    const prompt = buildSystemPrompt();
    assert.ok(prompt.includes('NEVER invent or fabricate personal identification information'));
    assert.ok(prompt.includes('needsUserInput'));
    assert.ok(prompt.includes('RADIO questions'));
    assert.ok(prompt.includes('CHECKBOX questions'));
  });

  test('buildUserPrompt formats question titles, IDs, and options', () => {
    const prompt = buildUserPrompt(sampleQuestions, { title: 'Test Survey', description: 'Context' });
    assert.ok(prompt.includes('Test Survey'));
    assert.ok(prompt.includes('What is your primary programming language?'));
    assert.ok(prompt.includes('sfta_q_1'));
    assert.ok(prompt.includes('sfta_opt_0'));
    assert.ok(prompt.includes('JavaScript'));
    assert.ok(prompt.includes('Free-text Other option'));
  });

  test('parseAndValidateAIResponse extracts pure JSON response cleanly', () => {
    const rawAiOutput = JSON.stringify({
      analysis: [
        {
          questionId: 'sfta_q_1',
          type: 'RADIO',
          needsUserInput: false,
          confidence: 'HIGH',
          selectedOptionIds: ['sfta_opt_1'],
          reasoning: 'Python is standard for data and scripting.'
        },
        {
          questionId: 'sfta_q_2',
          type: 'CHECKBOX',
          needsUserInput: false,
          confidence: 'HIGH',
          selectedOptionIds: ['sfta_opt_0', 'sfta_opt_1'],
          reasoning: 'Common editor and version control pair.'
        },
        {
          questionId: 'sfta_q_3',
          type: 'RADIO',
          needsUserInput: true,
          confidence: 'LOW',
          userPromptMessage: 'Personal identity question. Please select your own roll number.',
          selectedOptionIds: [],
          reasoning: 'Personal data cannot be guessed.'
        }
      ]
    });

    const parsed = parseAndValidateAIResponse(rawAiOutput, sampleQuestions);

    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.results.length, 3);

    // Q1
    const res1 = parsed.results[0];
    assert.strictEqual(res1.questionId, 'sfta_q_1');
    assert.strictEqual(res1.needsUserInput, false);
    assert.deepStrictEqual(res1.selectedOptionIds, ['sfta_opt_1']);
    assert.deepStrictEqual(res1.selectedOptionLabels, ['Python']);

    // Q2 (Multiple choice Checkbox)
    const res2 = parsed.results[1];
    assert.strictEqual(res2.questionId, 'sfta_q_2');
    assert.strictEqual(res2.needsUserInput, false);
    assert.deepStrictEqual(res2.selectedOptionIds, ['sfta_opt_0', 'sfta_opt_1']);
    assert.deepStrictEqual(res2.selectedOptionLabels, ['VS Code', 'Git']);

    // Q3 (Personal ID requiring user input)
    const res3 = parsed.results[2];
    assert.strictEqual(res3.questionId, 'sfta_q_3');
    assert.strictEqual(res3.needsUserInput, true);
    assert.deepStrictEqual(res3.selectedOptionIds, []);
    assert.ok(res3.userPromptMessage.toLowerCase().includes('personal identity'));
  });

  test('deterministically blocks fabricated attendance or identity responses even if AI attempts to select one', () => {
    const attendanceQuestion = [
      {
        id: 'sfta_q_att',
        index: 1,
        type: QUESTION_TYPES.RADIO,
        title: 'Mark your lecture attendance for today',
        required: true,
        options: [
          { id: 'sfta_opt_0', label: 'Present' },
          { id: 'sfta_opt_1', label: 'Absent' }
        ]
      }
    ];

    assert.strictEqual(isPersonalOrAttendanceQuestion(attendanceQuestion[0]), true);

    // Suppose AI attempts to auto-select 'Present'
    const badAiOutput = JSON.stringify({
      analysis: [
        {
          questionId: 'sfta_q_att',
          type: 'RADIO',
          needsUserInput: false,
          confidence: 'HIGH',
          selectedOptionIds: ['sfta_opt_0'],
          reasoning: 'Marked present'
        }
      ]
    });

    const parsed = parseAndValidateAIResponse(badAiOutput, attendanceQuestion);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.results[0].needsUserInput, true);
    assert.deepStrictEqual(parsed.results[0].selectedOptionIds, []);
  });

  test('parseAndValidateAIResponse extracts JSON from Markdown code blocks', () => {
    const markdownOutput = `
Here is my analysis of your Google Form questions:

\`\`\`json
{
  "analysis": [
    {
      "questionId": "sfta_q_1",
      "type": "RADIO",
      "needsUserInput": false,
      "confidence": "HIGH",
      "selectedOptionIds": ["sfta_opt_0"],
      "reasoning": "Standard JS selection."
    }
  ]
}
\`\`\`

Hope this helps!
`;

    const parsed = parseAndValidateAIResponse(markdownOutput, sampleQuestions.slice(0, 1));
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.results[0].selectedOptionIds[0], 'sfta_opt_0');
    assert.strictEqual(parsed.results[0].selectedOptionLabels[0], 'JavaScript');
  });

  test('enforces RADIO single-choice constraint if AI selects multiple', () => {
    const multiRadioOutput = JSON.stringify({
      analysis: [
        {
          questionId: 'sfta_q_1',
          type: 'RADIO',
          needsUserInput: false,
          selectedOptionIds: ['sfta_opt_0', 'sfta_opt_1'],
          reasoning: 'Both are good'
        }
      ]
    });

    const parsed = parseAndValidateAIResponse(multiRadioOutput, sampleQuestions.slice(0, 1));
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.results[0].selectedOptionIds.length, 1);
    assert.strictEqual(parsed.results[0].selectedOptionIds[0], 'sfta_opt_0');
  });

  test('flags needsUserInput if AI returns invalid hallucinated option IDs', () => {
    const invalidOptOutput = JSON.stringify({
      analysis: [
        {
          questionId: 'sfta_q_1',
          type: 'RADIO',
          needsUserInput: false,
          selectedOptionIds: ['hallucinated_opt_999'],
          reasoning: 'Made up ID'
        }
      ]
    });

    const parsed = parseAndValidateAIResponse(invalidOptOutput, sampleQuestions.slice(0, 1));
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.results[0].needsUserInput, true);
    assert.strictEqual(parsed.results[0].selectedOptionIds.length, 0);
  });
});
