# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deployment

This is a **Google Apps Script** project deployed via [clasp](https://github.com/google/clasp). There is no build step — files are pushed directly to the Apps Script runtime.

```bash
# Push all files to the Apps Script project
clasp push

# Open the project in the browser editor
clasp open
```

There are no automated tests. Manual testing requires deploying and using the live web app. After pushing, create a new deployment in the Apps Script editor (Deploy → New deployment → Web app).

## Architecture

The project is a single-page web app served by Apps Script with a strict client/server split:

**Server-side (`Code.js`)** — Pure Google Apps Script (V8 runtime). Exposes functions that the client calls via `google.script.run`. Key concerns: Drive/Docs/Sheets/Gmail API access, template rendering, email sending, campaign history logging, and per-user settings via `PropertiesService`.

**Client-side (`script.html`)** — A React 18 app transpiled in-browser by Babel (UMD/standalone builds, no bundler). All UI state lives here. Communicates with the server exclusively through `google.script.run` async calls.

**Templating (`Index.html`)** — Served by `doGet()`, which uses `HtmlService.createTemplateFromFile`. It injects `styles.html` and `script.html` at serve time using `<?!= HtmlService.createHtmlOutputFromFile(...).getContent(); ?>` scriptlets. The logo SVG is also injected this way into `window.LOGO_SVG`.

**`styles.html`** — CSS design tokens and component styles (no `<style>` tags needed; just the raw CSS wrapped in a `<style>` block that Index.html injects).

**`appsscript.json`** — Manifest declaring the V8 runtime, webapp access scope (`DOMAIN`), exception logging (Stackdriver), and enabled advanced services (Gmail v1, Sheets v4, Docs v1).

## Key Conventions

- The app enforces **domain-only access** via the manifest (`"access": "DOMAIN"`). The `doGet()` guard also rejects requests with no active user email.
- **Deduplication** is row-level: any row with a non-empty `Timestamp` column is skipped during a send run, making campaigns safe to re-run after partial failures.
- The `Timestamp` and `Template` columns in the recipient sheet are **auto-managed** — never manually edited.
- Template placeholders use **double-brace syntax**: `{{ColumnHeader}}`. These work in both the Doc body and the subject line field.
- Per-user settings (template folder ID) are stored in `PropertiesService.getUserProperties()`, which is scoped to the logged-in user and persists across sessions. The subject line is managed entirely in client-side React state and is never persisted server-side.
- Two IDs are hardcoded at the top of `Code.js`: `DEFAULT_TEMPLATE_FOLDER_ID` and `HISTORY_SHEET_ID`. These are the only values that need to change when setting up the project in a new Google Workspace.
- Base64-encoded inline images in Docs templates are automatically re-encoded as CID attachments to keep emails RFC-compliant.


## Strict Coding Rules for Claude Code

When generating or modifying code in this repository, you MUST adhere to the following constraints:

### 1. React & Frontend Constraints
- **No Bundlers:** React and Babel are loaded via CDN in `Index.html`. Do NOT use `npm`, `import/export` statements, or module syntax.
- **Single File UI:** All React components and UI logic MUST remain inside `<script type="text/babel">` in `script.html`.
- **React Imports:** Always destructure hooks from the global React object (e.g., `const { useState, useEffect } = React;`). 
- **Styling:** Tailwind is loaded via CDN. Do not attempt to configure `tailwind.config.js`. If custom CSS is absolutely necessary, place it in `styles.html` within `<style>` tags.

### 2. Google Apps Script (Backend) Constraints
- **Top-Level Functions:** Any function in `Code.js` that needs to be called by the client MUST be a top-level function declaration (e.g., `function myFunc() {}`), not an arrow function assigned to a const.
- **Client/Server Boundary:** Communication must only happen via `google.script.run`. 
- **Return Types:** Remember that `google.script.run` cannot return complex objects like `Date` instances, functions, or circular references. Only return JSON-serializable primitives, arrays, or plain objects.
- **Do Not Touch IDs:** Never modify `DEFAULT_TEMPLATE_FOLDER_ID` or `HISTORY_SHEET_ID` in `Code.js` unless explicitly instructed by the user.

### 3. Agent Workflow (Explore, Plan, Code)
- **Do Not Guess:** If a user asks for a feature, search the codebase first to understand how existing features are implemented.
- **Plan First:** Before modifying `Code.js` or `script.html`, write a brief step-by-step plan. Wait for user approval before writing the code.
- **Manual Sync:** Do NOT run `clasp push` automatically unless explicitly instructed. Let the user review the code first.
- **Log Tasks:** Keep a log of tasks and our progress in `tasks.md` for each session.