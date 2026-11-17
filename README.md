# Smart Form Tick Assistant

A lightweight Chrome extension (Manifest V3) that uses **your own OpenRouter API key** to analyze Google Forms multiple-choice questions and suggest checkbox/radio answers. You review the suggestions, approve them, and the extension ticks them on the page. **It never submits the form for you.**

- No login, no database, no subscription, no backend server
- No shared developer API key. Every user brings their own key
- Plain HTML, CSS and JavaScript (ES modules), with no runtime dependencies

---

## Features

| Area | What it does |
|---|---|
| **API setup** | Connect, Test, Change and Remove your OpenRouter key. The key is validated against OpenRouter before it is saved. |
| **Form detection** | Detects open Google Forms and reads question text, options, question type (radio / checkbox / text / dropdown) and section info. |
| **AI analysis** | Sends the radio/checkbox questions to OpenRouter (default model: `openrouter/free`) and gets structured JSON suggestions back. Large forms are split into batches automatically. |
| **Review & apply** | Each suggestion has an approval checkbox. Only approved answers are ticked, and each tick is checked afterward via `aria-checked`. |
| **Safety** | Submit buttons are never clicked. Identity and attendance questions (student ID, roll number, "mark attendance", etc.) are never auto-answered. |

---

## Setup Guide

### Requirements
- Google Chrome (or another Chromium browser such as Edge or Brave)
- An OpenRouter account and API key, free from [openrouter.ai/keys](https://openrouter.ai/keys)
- *(Optional, for developers)* Node.js 18+ to run the test suite

### 1. Get the code
```bash
git clone https://github.com/parvezrepository/Smart-Form-Assistant.git
```
Or download the ZIP from GitHub and extract it.

### 2. Load the extension in Chrome
1. Open `chrome://extensions/`
2. Turn on **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select the project folder (the one containing `manifest.json`)
5. Pin **Smart Form Tick Assistant** from the puzzle-piece menu so it's easy to reach

### 3. Connect your OpenRouter API key
1. Create a key at [openrouter.ai/keys](https://openrouter.ai/keys). **Setting a credit limit on the key is recommended.**
2. Click the extension icon
3. Paste your key (`sk-or-v1-...`)
4. Pick a model. `openrouter/free` is the default; choose **Custom Model ID** to enter any OpenRouter model
5. Click **Connect API**. The badge turns green **Connected** once the key is verified

### 4. Use it on a Google Form
1. Open a Google Form (`docs.google.com/forms/...`)
2. Click the extension icon. It detects the form and lists the questions
3. Pick a workflow:
   - **✨ Analyze Only**: shows suggestions so you can review, change or untick them, then click **✓ Apply Approved Choices**
   - **⚡ Analyze & Apply**: analyzes and immediately ticks the approved AI suggestions
4. **Check the ticked answers yourself, then submit the form manually.**

> For multi-section forms, run the extension once per section. After clicking **Next** in the form, press **Rescan Form Questions**.

### 5. Updating after code changes
After pulling new code, go to `chrome://extensions/`, click **Reload (↻)** on the extension card, then refresh any open Google Form tabs.

---

## How the suggestions are produced (AI vs. fallback)

Suggestions come from the **AI model you selected**, with one exception. Free models on `openrouter/free` sometimes return an empty or broken response. When that happens even after a retry, the extension uses a simple **rule-based fallback** so the batch doesn't fail outright:
- Consent questions → the "Agree"/"Yes" option
- Frequency scales → a middle option such as "Sometimes"

Fallback picks are **not AI answers**. They are labeled **`NOT AI`** in the popup and are **never auto-approved**; you must tick them yourself. To get fewer fallbacks, use a more reliable model (for example `google/gemini-2.0-flash-001` or `openai/gpt-4o-mini`).

> ⚠️ **Use responsibly.** Many Google Forms are research surveys, exams or official records. AI-generated answers do not reflect your real experiences, so submitting them can corrupt someone's research data or break an institution's rules. Use the suggestions as a starting point and answer honestly.

---

## Security & Privacy

- **Where the key lives:** `chrome.storage.local`, separate for each browser profile. It is never stored in `chrome.storage.sync`, so it is not synced to your Google account.
- **Who sees the key:** only the extension's background service worker, which sends it straight to `https://openrouter.ai/api/v1`. There is no other server. Content scripts on the Google Forms page never receive the key.
- **Logging:** a redacting logger masks anything that looks like a key (`sk-or-v1-…`, `Bearer …`) before writing to the console.
- **What is sent to OpenRouter:** the form title/description and the question/option text of radio and checkbox questions. Your typed answers and text fields are not sent.

> [!IMPORTANT]
> **`chrome.storage.local` is local persistence, not encrypted secret storage.** Other websites and extensions cannot read it, but it is written **unencrypted** to the browser profile folder on disk (`…\User Data\<Profile>\Local Extension Settings\`). Anyone with access to your computer account or files could read it. To limit the risk: use OS disk encryption (BitLocker / FileVault), give the extension a dedicated key with a spending limit, and remove or rotate the key if your device is shared or lost.

---

## Project Structure

```
├── manifest.json            # Manifest V3 config
├── background.js            # Service worker: the only code that touches the API key / OpenRouter
├── common/
│   ├── constants.js         # Endpoints, models, message types, question types
│   ├── storage.js           # chrome.storage.local helpers (returns masked key only)
│   ├── logger.js            # Key-redacting logger
│   ├── openrouter-service.js# Key validation + batched chat completions with retry
│   ├── ai-prompt.js         # Prompt builder, JSON parser/validator, safety rules, fallback
│   ├── form-parser.js       # Google Forms DOM parser (testable module)
│   └── form-applier.js      # Click + verify logic, submit-button blocker (testable module)
├── content/content.js       # Injected into Google Forms: detect + apply (no key access)
├── popup/                   # popup.html / popup.css / popup.js
├── icons/                   # Extension icons
├── scripts/generate-icons.js
└── tests/                   # Node built-in test runner suites
```

## Running Tests

```bash
npm test
```
Runs the Node.js built-in test runner (no dependencies to install). The tests cover storage isolation, key redaction, OpenRouter error handling (401/402/429/timeouts), JSON parsing, the identity/attendance guardrails, form parsing, and the submit-button blocking.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **"Not Set" / "Invalid Key"** | Check the key is copied fully and is active on openrouter.ai. Click **Change API Key** to re-enter it. |
| **"No Credits" (402)** | Switch to `openrouter/free` or add credits on OpenRouter. |
| **"Rate Limit" (429)** | Free models have tight limits. Wait a minute or switch models. |
| **Many `NOT AI` suggestions** | The free model returned empty or broken output. Pick a different model and analyze again. |
| **"No Form Open"** | Make sure the active tab is a `docs.google.com/forms/...` page, then refresh it. |
| **Options aren't getting ticked** | Reload the extension at `chrome://extensions/`, refresh the form tab (F5), then try again. |

## License

MIT
