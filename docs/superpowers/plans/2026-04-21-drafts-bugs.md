# Drafts View Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three bugs in the Drafts tab — stale draft rows lingering after deletion, preview always failing due to a missing OAuth scope, and the date filter's end date being exclusive instead of inclusive.

**Architecture:** Three independent server-side fixes (manifest, date math, error typing) followed by one coordinated client-side refactor that separates content-cache state from error state and updates the preview pane to render three distinct states.

**Tech Stack:** Google Apps Script (V8), React 18 (CDN/Babel), no automated test runner — verification is manual via the deployed web app.

---

## File Map

| File | What changes |
|---|---|
| `appsscript.json` | Add `oauthScopes` array |
| `Code.js` | `getDrafts` lines 794–796: date math; `getDraftContent` lines 860–863: error distinction |
| `script.html` | Line 197: new `draftContentErrors` state; lines 521–591: new `loadDraftContent`, updated `handleExpandDraft`, updated `fetchDrafts`; lines 1200–1212: updated preview pane JSX |

---

## Task 1: Add OAuth Scopes (`appsscript.json`)

**Files:**
- Modify: `appsscript.json`

**Background:** `appsscript.json` currently has no `oauthScopes`. Apps Script auto-detected only `gmail.metadata` (from the original `getDrafts` call with `format: 'metadata'`). `getDraftContent` calls `Drafts.get` with `format: 'full'`, which requires `https://mail.google.com/`. Without it, every call throws and the preview always fails. Adding explicit scopes forces a re-authorization dialog the next time any user opens the app.

- [ ] **Step 1: Add `oauthScopes` to `appsscript.json`**

  Replace the entire file with:

  ```json
  {
    "timeZone": "America/Chicago",
    "dependencies": {
      "enabledAdvancedServices": [
        {
          "userSymbol": "Sheets",
          "version": "v4",
          "serviceId": "sheets"
        },
        {
          "userSymbol": "Gmail",
          "version": "v1",
          "serviceId": "gmail"
        },
        {
          "userSymbol": "Docs",
          "version": "v1",
          "serviceId": "docs"
        }
      ]
    },
    "oauthScopes": [
      "https://mail.google.com/",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/documents"
    ],
    "exceptionLogging": "STACKDRIVER",
    "runtimeVersion": "V8",
    "webapp": {
      "executeAs": "USER_ACCESSING",
      "access": "DOMAIN"
    }
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add appsscript.json
  git commit -m "chore: add explicit oauthScopes to enable full Gmail access"
  ```

---

## Task 2: Fix Date Filter Off-by-One (`Code.js`, `getDrafts`)

**Files:**
- Modify: `Code.js:794-796`

**Background:** Gmail's `before:` operator is exclusive — `before:2026/04/21` means "before the start of April 21," so a draft created that day is not returned. Fix: add 1 day to the `beforeDate` before building the query string, making the end date inclusive from the user's perspective. Use noon UTC (`T12:00:00Z`) when parsing to avoid DST-related off-by-one at midnight.

- [ ] **Step 1: Replace lines 794–796 in `Code.js`**

  Find this block inside `getDrafts` (currently lines 794–796):

  ```js
  const afterQuery = afterDate.replace(/-/g, '/');
  const beforeQuery = beforeDate.replace(/-/g, '/');
  const query = `after:${afterQuery} before:${beforeQuery}`;
  ```

  Replace with:

  ```js
  const afterQuery = afterDate.replace(/-/g, '/');
  const d = new Date(beforeDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  const beforeQuery = d.toISOString().slice(0, 10).replace(/-/g, '/');
  const query = `after:${afterQuery} before:${beforeQuery}`;
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add Code.js
  git commit -m "fix: make drafts date filter end date inclusive"
  ```

---

## Task 3: Distinguish "Not Found" vs Other Errors (`Code.js`, `getDraftContent`)

**Files:**
- Modify: `Code.js:860-863`

**Background:** Currently `getDraftContent` catches all exceptions and re-throws the same message `'Could not load draft preview.'`. The client has no way to distinguish a deleted draft (HTTP 404) from a transient content error. After this fix, a 404-class error throws `'Draft not found'` (a sentinel the client will key on in Task 4 to auto-remove the row), while other errors include the actual exception message for diagnosis.

- [ ] **Step 1: Replace lines 860–863 in `Code.js`**

  Find this block at the bottom of `getDraftContent`:

  ```js
  } catch (error) {
    Logger.log(`Error fetching draft content for ${draftId}: ${error.message}\nStack: ${error.stack}`);
    throw new Error('Could not load draft preview.');
  }
  ```

  Replace with:

  ```js
  } catch (error) {
    Logger.log(`Error fetching draft content for ${draftId}: ${error.message}\nStack: ${error.stack}`);
    if (error.message && (error.message.includes('404') || error.message.toLowerCase().includes('not found'))) {
      throw new Error('Draft not found');
    }
    throw new Error(`Could not load draft preview: ${error.message}`);
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add Code.js
  git commit -m "fix: distinguish not-found from content errors in getDraftContent"
  ```

---

## Task 4: Refactor Preview Error Handling (`script.html`)

**Files:**
- Modify: `script.html` (state declaration ~line 197, handlers ~lines 521–592, preview JSX ~lines 1200–1212)

**Background:** The current `handleExpandDraft` stores error HTML as a string in `draftContentCache`. Since the cache-hit guard is `if (draftContentCache[draftId]) return`, any truthy cache value — including error HTML — permanently blocks retrying. This task introduces a parallel `draftContentErrors` state map (so the content cache only ever holds successful HTML), extracts a `loadDraftContent` helper, updates `handleExpandDraft` and `fetchDrafts`, and updates the preview pane JSX to render three distinct states.

- [ ] **Step 1: Add `draftContentErrors` state (line 197)**

  Find line 197 in `script.html`:
  ```js
  const [isLoadingMoreDrafts, setIsLoadingMoreDrafts] = useState(false);
  ```

  Add one line immediately after it:
  ```js
  const [isLoadingMoreDrafts, setIsLoadingMoreDrafts] = useState(false);
  const [draftContentErrors, setDraftContentErrors] = useState({});
  ```

- [ ] **Step 2: Replace `handleExpandDraft` with `loadDraftContent` + updated `handleExpandDraft` (lines 576–592)**

  Find the entire `handleExpandDraft` block (lines 576–592):

  ```js
  const handleExpandDraft = async (draftId) => {
      if (expandedDraftId === draftId) {
          setExpandedDraftId(null);
          return;
      }
      setExpandedDraftId(draftId);
      if (draftContentCache[draftId]) return;
      try {
          const html = await runGas('getDraftContent', draftId);
          setDraftContentCache(prev => ({ ...prev, [draftId]: html }));
      } catch (err) {
          setDraftContentCache(prev => ({
              ...prev,
              [draftId]: '<p style="color:#ff5664;font-style:italic;padding:12px">Could not load preview.</p>'
          }));
      }
  };
  ```

  Replace with:

  ```js
  const loadDraftContent = async (draftId) => {
      if (draftContentCache[draftId]) return;
      try {
          const html = await runGas('getDraftContent', draftId);
          setDraftContentCache(prev => ({ ...prev, [draftId]: html }));
      } catch (err) {
          const notFound = err.message === 'Draft not found';
          setDraftContentErrors(prev => ({ ...prev, [draftId]: { message: err.message, notFound } }));
          if (notFound) {
              setDrafts(prev => prev.filter(d => d.id !== draftId));
              setSelectedDraftIds(prev => { const s = new Set(prev); s.delete(draftId); return s; });
              setExpandedDraftId(null);
          }
      }
  };

  const handleExpandDraft = async (draftId) => {
      if (expandedDraftId === draftId) {
          setExpandedDraftId(null);
          return;
      }
      setExpandedDraftId(draftId);
      if (draftContentCache[draftId]) return;
      setDraftContentErrors(prev => { const next = { ...prev }; delete next[draftId]; return next; });
      await loadDraftContent(draftId);
  };
  ```

- [ ] **Step 3: Clear `draftContentErrors` in `fetchDrafts` (lines 530 and 536)**

  Inside `fetchDrafts`, there are two `setDraftContentCache({})` calls — one in the success branch (line 530) and one in the error branch (line 536). Add `setDraftContentErrors({})` immediately after each.

  Success branch — find:
  ```js
  setDraftContentCache({});
  setSelectedDraftIds(new Set(results.map(d => d.id)));
  ```
  Replace with:
  ```js
  setDraftContentCache({});
  setDraftContentErrors({});
  setSelectedDraftIds(new Set(results.map(d => d.id)));
  ```

  Error branch — find:
  ```js
  setDrafts([]);
  setSelectedDraftIds(new Set());
  setDraftContentCache({});
  ```
  Replace with:
  ```js
  setDrafts([]);
  setSelectedDraftIds(new Set());
  setDraftContentCache({});
  setDraftContentErrors({});
  ```

- [ ] **Step 4: Update the preview pane JSX (lines 1200–1212)**

  Find this block inside the `{isExpanded && (...)}` section:

  ```jsx
  {draftContentCache[draft.id] ? (
      <iframe
          srcDoc={draftContentCache[draft.id]}
          sandbox="allow-same-origin"
          className="preview-pane-iframe"
          style={{ height: '300px', width: '100%', border: 'none', background: '#fff' }}
          title={`Preview: ${draft.subject}`}
      />
  ) : (
      <div className="bg-white h-32 flex items-center justify-center text-gray-400">
          <i className="fa-solid fa-circle-notch fa-spin text-[var(--brand-primary)] text-xl"></i>
      </div>
  )}
  ```

  Replace with:

  ```jsx
  {draftContentCache[draft.id] ? (
      <iframe
          srcDoc={draftContentCache[draft.id]}
          sandbox="allow-same-origin"
          className="preview-pane-iframe"
          style={{ height: '300px', width: '100%', border: 'none', background: '#fff' }}
          title={`Preview: ${draft.subject}`}
      />
  ) : draftContentErrors[draft.id] ? (
      <div className="bg-white flex flex-col items-center justify-center gap-2 py-6">
          <p style={{ color: '#ff5664', fontStyle: 'italic', fontSize: '0.875rem', textAlign: 'center', padding: '0 12px' }}>
              {draftContentErrors[draft.id].message}
          </p>
          {!draftContentErrors[draft.id].notFound && (
              <button
                  onClick={() => {
                      setDraftContentErrors(prev => { const next = { ...prev }; delete next[draft.id]; return next; });
                      loadDraftContent(draft.id);
                  }}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '4px 12px' }}
              >
                  <i className="fa-solid fa-rotate-right"></i> Retry
              </button>
          )}
      </div>
  ) : (
      <div className="bg-white h-32 flex items-center justify-center text-gray-400">
          <i className="fa-solid fa-circle-notch fa-spin text-[var(--brand-primary)] text-xl"></i>
      </div>
  )}
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add script.html
  git commit -m "fix: separate preview error state from cache, add retry button"
  ```

---

## Verification

After `clasp push` and creating a new deployment:

1. **Re-authorization** — Open the web app. A new authorization dialog should appear requesting Gmail, Drive, Sheets, and Docs permissions. Accept it.

2. **Date filter** — On the Drafts tab, set end date to today's date. Click Filter. Confirm drafts created today appear in the list (previously they required tomorrow's date).

3. **Preview loads** — Expand a valid draft. The spinner should appear briefly, then the email HTML should render in the iframe. The "Could not load preview." message should no longer appear.

4. **Stale draft auto-removal** — If any draft in the list was deleted or sent from Gmail directly (outside this app), expanding it should cause the row to disappear from the list automatically (no toast needed — the row just vanishes).

5. **Retry button** — If a non-404 error occurs (e.g., temporarily offline), the error message text should be visible and a Retry button should appear. Clicking Retry should show the spinner again and re-attempt the fetch.
