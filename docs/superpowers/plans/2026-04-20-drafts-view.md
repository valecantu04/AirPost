# Drafts View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level "Drafts" tab to AirPost that lets users filter, preview, select, and bulk-send Gmail drafts, with results logged to the existing History Sheet.

**Architecture:** Add a tab bar between the header and `<main>`, gated by `activeTab` state in `AirPostApp`. When `activeTab === 'drafts'`, the Stepper and wizard layout are replaced by the Drafts View — a date-filtered list of draft metadata with inline HTML preview and a post-send delivery report sidebar. Four new top-level functions in `Code.js` handle all server-side Gmail API access.

**Tech Stack:** Google Apps Script (V8) + Gmail advanced service, React 18 (CDN/UMD), Babel standalone, Tailwind CSS CDN, Font Awesome 6.

---

## Files Modified

- **Modify:** `script.html` — add `activeTab` state, tab bar nav, all draft state variables, `fetchDrafts`/`handleExpandDraft`/`handleSendDrafts`/`executeSendDrafts` handlers, and the full Drafts View JSX.
- **Modify:** `Code.js` — add four new top-level functions: `getDrafts`, `getDraftContent`, `sendDrafts`, `logDraftHistory`.

No new files are created.

---

## Task 1: Tab Bar Navigation

**Files:**
- Modify: `script.html` (state block ~line 124, return JSX ~line 492)

- [ ] **Step 1: Add `activeTab` state to `AirPostApp`**

  In `script.html`, find the `// --- GLOBAL STATE ---` block (around line 124). Add one line after `const [step, setStep] = useState(1);`:

  ```jsx
  const [activeTab, setActiveTab] = useState('campaign');
  ```

- [ ] **Step 2: Insert the tab bar between `</header>` and `<main>`**

  In `script.html`, find the closing `</header>` tag (around line 540). Insert this `<nav>` block immediately after it, before `<main`:

  ```jsx
  {/* TAB BAR */}
  <nav className="border-b border-[var(--border-moderate)] bg-[var(--surface-primary)]/30 shrink-0">
      <div className="flex gap-1 px-6">
          {[
              { id: 'campaign', icon: 'fa-paper-plane', label: 'Campaign' },
              { id: 'drafts', icon: 'fa-file-lines', label: 'Drafts' },
          ].map(tab => (
              <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-all ${
                      activeTab === tab.id
                          ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                          : 'border-transparent text-[var(--text-secondary)] hover:text-white'
                  }`}
              >
                  <i className={`fa-solid ${tab.icon}`}></i> {tab.label}
              </button>
          ))}
      </div>
  </nav>
  ```

- [ ] **Step 3: Wrap campaign content in `<main>` with `activeTab === 'campaign'` guard**

  Inside `<main>`, the current content is a Stepper div followed by the wizard layout div. Wrap both in a single fragment:

  Find this exact block inside `<main>`:
  ```jsx
  {/* STEPPER */}
  <div className="w-full max-w-6xl px-8 shrink-0">
  ```

  Before it, add:
  ```jsx
  {activeTab === 'campaign' && <>
  ```

  Then find the closing of the wizard layout div (just before `</main>`) — it ends with `</div>` after the right sidebar `</div>`. After that closing `</div>`, add:
  ```jsx
  </>}
  {activeTab === 'drafts' && (
      <div className="w-full max-w-6xl flex flex-col flex-grow items-center justify-center">
          <p className="text-[var(--text-secondary)]">Drafts view loading...</p>
      </div>
  )}
  ```

- [ ] **Step 4: Push and verify tab bar**

  ```bash
  clasp push
  ```

  Open the web app. Confirm:
  - "Campaign" and "Drafts" tabs appear below the header.
  - Clicking "Drafts" shows the placeholder text; clicking "Campaign" restores the wizard.
  - All existing campaign functionality still works.

- [ ] **Step 5: Commit**

  ```bash
  git add script.html
  git commit -m "feat: add top-level Campaign/Drafts tab bar navigation"
  ```

---

## Task 2: Draft State Variables + Date Filter Bar + `fetchDrafts`

**Files:**
- Modify: `script.html` (state block, handlers, Drafts View JSX)

- [ ] **Step 1: Add all draft state variables**

  In `script.html`, after the existing Modal State block (after `const handleModalConfirm = ...`), add:

  ```jsx
  // Draft State
  const [draftStartDate, setDraftStartDate] = useState(() => {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return d.toISOString().slice(0, 10);
  });
  const [draftEndDate, setDraftEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [drafts, setDrafts] = useState([]);
  const [isFetchingDrafts, setIsFetchingDrafts] = useState(false);
  const [expandedDraftId, setExpandedDraftId] = useState(null);
  const [draftContentCache, setDraftContentCache] = useState({});
  const [isFetchingDraftContent, setIsFetchingDraftContent] = useState(false);
  const [selectedDraftIds, setSelectedDraftIds] = useState(() => new Set());
  const [isSendingDrafts, setIsSendingDrafts] = useState(false);
  const [draftSendResults, setDraftSendResults] = useState(null);
  ```

- [ ] **Step 2: Add `fetchDrafts` handler and selection helpers**

  In `script.html`, before the `const getTemplateName = ...` line (around line 490), add:

  ```jsx
  // --- DRAFTS LOGIC ---
  const fetchDrafts = async () => {
      setIsFetchingDrafts(true);
      setDraftSendResults(null);
      setExpandedDraftId(null);
      try {
          const results = await runGas('getDrafts', draftStartDate, draftEndDate);
          setDrafts(results);
          setSelectedDraftIds(new Set(results.map(d => d.id)));
      } catch (err) {
          addToast('Failed to load drafts. Please try again.', 'error');
          setDrafts([]);
      } finally {
          setIsFetchingDrafts(false);
      }
  };

  const toggleDraftSelection = (id) => {
      setSelectedDraftIds(prev => {
          const next = new Set(prev);
          next.has(id) ? next.delete(id) : next.add(id);
          return next;
      });
  };

  const toggleAllDrafts = () => {
      if (selectedDraftIds.size === drafts.length && drafts.length > 0) {
          setSelectedDraftIds(new Set());
      } else {
          setSelectedDraftIds(new Set(drafts.map(d => d.id)));
      }
  };
  ```

- [ ] **Step 3: Replace the Drafts view placeholder with the date filter bar + list scaffold**

  In `script.html`, replace the placeholder block added in Task 1:
  ```jsx
  {activeTab === 'drafts' && (
      <div className="w-full max-w-6xl flex flex-col flex-grow items-center justify-center">
          <p className="text-[var(--text-secondary)]">Drafts view loading...</p>
      </div>
  )}
  ```

  With:
  ```jsx
  {activeTab === 'drafts' && (
      <div className="w-full max-w-6xl wizard-layout flex flex-col md:flex-row overflow-hidden flex-grow">
          {/* DRAFTS LEFT COLUMN */}
          <div className="flex-grow flex flex-col relative overflow-hidden">
              {/* Toasts (reuse same absolute positioning pattern) */}
              <div className="absolute top-8 right-8 z-[100] flex flex-col gap-3 pointer-events-none">
                  {toasts.map(toast => (
                      <div key={toast.id} className={`${toast.isExiting ? 'toast-exit' : 'toast-enter'} pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-2xl border-l-4 ${toast.type === 'success' ? 'border-[var(--status-success)]' : 'border-[var(--status-critical)]'} bg-[var(--surface-primary)] text-white min-w-[280px] max-w-[350px] border border-[var(--border-moderate)]`}>
                          <i className={`fa-solid ${toast.type === 'success' ? 'fa-circle-check text-[var(--status-success)]' : 'fa-triangle-exclamation text-[var(--status-critical)]'} text-xl`}></i>
                          <div className="flex flex-col">
                              <span className="font-bold text-sm tracking-wide uppercase">{toast.type === 'success' ? 'Success' : 'Notice'}</span>
                              <span className="text-xs text-[var(--text-secondary)] mt-0.5">{toast.message}</span>
                          </div>
                      </div>
                  ))}
              </div>

              <div className="flex-grow p-8 flex flex-col overflow-y-auto custom-scrollbar relative">
                  <div className="mb-6 border-b border-[var(--border-moderate)] pb-4 shrink-0">
                      <h2 className="text-2xl font-bold flex items-center gap-2">
                          <i className="fa-solid fa-file-lines text-[var(--brand-primary)]"></i> Drafts
                      </h2>
                      <p className="text-[var(--text-secondary)] mt-1 text-sm">Filter, preview, and send emails from your Gmail Drafts.</p>
                  </div>

                  {/* DATE FILTER BAR */}
                  <div className="app-card flex flex-wrap items-center gap-3 mb-6 shrink-0">
                      <span className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Created</span>
                      <input
                          type="date"
                          className="form-input"
                          value={draftStartDate}
                          onChange={e => setDraftStartDate(e.target.value)}
                      />
                      <span className="text-[var(--text-disabled)]">→</span>
                      <input
                          type="date"
                          className="form-input"
                          value={draftEndDate}
                          onChange={e => setDraftEndDate(e.target.value)}
                      />
                      <button
                          onClick={fetchDrafts}
                          disabled={isFetchingDrafts}
                          className="btn btn-primary"
                      >
                          {isFetchingDrafts
                              ? <><i className="fa-solid fa-circle-notch fa-spin"></i> Loading...</>
                              : <><i className="fa-solid fa-filter"></i> Filter</>}
                      </button>
                  </div>

                  {/* DRAFT LIST PLACEHOLDER — replaced in Task 4 */}
                  <div className="text-[var(--text-secondary)] text-sm italic">
                      {isFetchingDrafts ? 'Loading drafts...' : 'Click Filter to load drafts.'}
                  </div>
              </div>
          </div>
      </div>
  )}
  ```

- [ ] **Step 4: Push and verify**

  ```bash
  clasp push
  ```

  Open the web app. Click "Drafts" tab. Confirm:
  - Date filter bar appears with two date inputs pre-filled (today − 7 days → today).
  - Clicking "Filter" triggers a load (spinner appears, then resolves). No crashes.
  - Switching back to "Campaign" tab still works.

- [ ] **Step 5: Commit**

  ```bash
  git add script.html
  git commit -m "feat: add draft state, date filter bar, and fetchDrafts handler"
  ```

---

## Task 3: `getDrafts` Server Function

**Files:**
- Modify: `Code.js` (append at end of file)

- [ ] **Step 1: Add `getDrafts` to `Code.js`**

  Append to the end of `Code.js`:

  ```javascript
  function getDrafts(afterDate, beforeDate) {
    try {
      // Gmail search query uses YYYY/MM/DD format
      const afterQuery = afterDate.replace(/-/g, '/');
      const beforeQuery = beforeDate.replace(/-/g, '/');
      const query = `after:${afterQuery} before:${beforeQuery}`;

      const listResult = Gmail.Users.Drafts.list('me', { q: query, maxResults: 50 });
      const draftItems = listResult.drafts || [];

      return draftItems.map(item => {
        try {
          const draft = Gmail.Users.Drafts.get('me', item.id, { format: 'metadata' });
          const headers = draft.message.payload.headers;
          const getHeader = (name) =>
            (headers.find(h => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';

          return {
            id: item.id,
            subject: getHeader('Subject') || '(no subject)',
            to: getHeader('To'),
            cc: getHeader('Cc'),
            from: getHeader('From'),
            createdAt: new Date(parseInt(draft.message.internalDate)).toISOString()
          };
        } catch (e) {
          Logger.log(`Could not fetch draft metadata for ${item.id}: ${e.message}`);
          return null;
        }
      }).filter(Boolean);
    } catch (error) {
      Logger.log(`Error fetching drafts: ${error.message}\nStack: ${error.stack}`);
      throw new Error('Failed to load drafts. Please try again.');
    }
  }
  ```

- [ ] **Step 2: Push and verify**

  ```bash
  clasp push
  ```

  Open the web app. Go to "Drafts" tab. Set dates, click "Filter". Confirm:
  - Drafts in your Gmail account within that date range appear (or empty state if none).
  - No errors thrown in Apps Script execution log (check via `clasp open` → Execution Log).

- [ ] **Step 3: Commit**

  ```bash
  git add Code.js
  git commit -m "feat: add getDrafts server function with Gmail metadata fetch"
  ```

---

## Task 4: Draft List Rendering (Rows, Checkboxes, Select-All)

**Files:**
- Modify: `script.html` (Drafts View JSX inside the left column)

- [ ] **Step 1: Replace the draft list placeholder with full list rendering**

  In `script.html`, find this block inside the Drafts View:
  ```jsx
  {/* DRAFT LIST PLACEHOLDER — replaced in Task 4 */}
  <div className="text-[var(--text-secondary)] text-sm italic">
      {isFetchingDrafts ? 'Loading drafts...' : 'Click Filter to load drafts.'}
  </div>
  ```

  Replace it with:
  ```jsx
  {/* DRAFT LIST */}
  {drafts.length === 0 && !isFetchingDrafts && (
      <div className="app-card text-center text-[var(--text-secondary)] text-sm py-8">
          <i className="fa-solid fa-inbox text-2xl mb-3 block text-[var(--text-disabled)]"></i>
          No drafts found in this date range. Try widening the filter.
      </div>
  )}

  {drafts.length > 0 && (
      <div className="flex flex-col gap-2 shrink-0">
          {/* SELECT-ALL ROW */}
          <div className="flex items-center gap-3 px-1 mb-2">
              <input
                  type="checkbox"
                  className="accent-[var(--brand-primary)] w-4 h-4 cursor-pointer"
                  checked={selectedDraftIds.size === drafts.length && drafts.length > 0}
                  onChange={toggleAllDrafts}
              />
              <span className="text-sm text-[var(--text-secondary)]">
                  {selectedDraftIds.size} of {drafts.length} draft{drafts.length === 1 ? '' : 's'} selected
              </span>
              <button
                  onClick={handleSendDrafts}
                  disabled={selectedDraftIds.size === 0 || isSendingDrafts}
                  className="btn btn-primary ml-auto"
              >
                  {isSendingDrafts
                      ? <><i className="fa-solid fa-circle-notch fa-spin"></i> Sending...</>
                      : <><i className="fa-solid fa-paper-plane"></i> Send {selectedDraftIds.size} Draft{selectedDraftIds.size === 1 ? '' : 's'}</>}
              </button>
          </div>

          {/* DRAFT ROWS */}
          {drafts.map(draft => {
              const isExpanded = expandedDraftId === draft.id;
              const isSelected = selectedDraftIds.has(draft.id);
              return (
                  <div
                      key={draft.id}
                      className={`app-card p-0 overflow-hidden transition-all ${isSelected ? 'border-[var(--brand-primary)]/30' : 'opacity-60'}`}
                  >
                      {/* ROW HEADER */}
                      <div className="flex items-center gap-3 p-4">
                          <input
                              type="checkbox"
                              className="accent-[var(--brand-primary)] w-4 h-4 cursor-pointer shrink-0"
                              checked={isSelected}
                              onChange={() => toggleDraftSelection(draft.id)}
                              onClick={e => e.stopPropagation()}
                          />
                          <div
                              className="flex-grow min-w-0 cursor-pointer"
                              onClick={() => handleExpandDraft(draft.id)}
                          >
                              <div className="text-sm font-semibold text-white truncate">{draft.subject}</div>
                              <div className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                                  To: {draft.to}
                                  {draft.cc ? ` · CC: ${draft.cc}` : ''}
                                  {' · '}From: {draft.from}
                                  {' · '}{new Date(draft.createdAt).toLocaleDateString()}
                              </div>
                          </div>
                          <button
                              onClick={() => handleExpandDraft(draft.id)}
                              className="text-[var(--text-disabled)] hover:text-white transition-colors shrink-0 px-1"
                              aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                              <i className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'} text-sm`}></i>
                          </button>
                      </div>

                      {/* INLINE PREVIEW (collapsed until Task 6) */}
                      {isExpanded && (
                          <div className="mx-4 mb-4 rounded overflow-hidden border border-[var(--border-moderate)]">
                              <div className="bg-[var(--surface-primary)] px-3 py-1.5 text-xs text-[var(--text-secondary)] flex items-center gap-2">
                                  <i className="fa-solid fa-envelope text-[var(--brand-primary)]"></i> Email Preview
                              </div>
                              <div className="bg-white h-32 flex items-center justify-center text-gray-400 text-sm italic">
                                  Preview coming in Task 6...
                              </div>
                          </div>
                      )}
                  </div>
              );
          })}
      </div>
  )}
  ```

- [ ] **Step 2: Push and verify**

  ```bash
  clasp push
  ```

  Open the web app. Go to "Drafts" tab. Click "Filter". Confirm:
  - Each draft appears as a row with Subject, To, CC (if present), From, date.
  - Checking/unchecking rows updates the "Send N Drafts" button count.
  - Selecting all via the select-all checkbox works.
  - Clicking a row's chevron expands it (showing the placeholder preview).
  - "Send N Drafts" button is disabled when count is 0.

- [ ] **Step 3: Commit**

  ```bash
  git add script.html
  git commit -m "feat: add draft list rendering with checkboxes and select-all"
  ```

---

## Task 5: `getDraftContent` Server Function

**Files:**
- Modify: `Code.js` (append at end of file)

- [ ] **Step 1: Add `getDraftContent` to `Code.js`**

  Append to the end of `Code.js`:

  ```javascript
  function getDraftContent(draftId) {
    try {
      const draft = Gmail.Users.Drafts.get('me', draftId, { format: 'full' });
      const payload = draft.message.payload;

      function findPart(part, mimeType) {
        if (!part) return null;
        if (part.mimeType === mimeType && part.body && part.body.data) {
          return part.body.data;
        }
        if (part.parts) {
          for (const subPart of part.parts) {
            const found = findPart(subPart, mimeType);
            if (found) return found;
          }
        }
        return null;
      }

      const htmlData = findPart(payload, 'text/html');
      if (htmlData) {
        return Utilities.newBlob(Utilities.base64DecodeWebSafe(htmlData)).getDataAsString();
      }

      const plainData = findPart(payload, 'text/plain');
      if (plainData) {
        const text = Utilities.newBlob(Utilities.base64DecodeWebSafe(plainData)).getDataAsString();
        return '<pre style="font-family:inherit;white-space:pre-wrap;word-break:break-word;padding:12px">' + text + '</pre>';
      }

      return '<p style="color:#94a3b8;font-style:italic;padding:12px">(No readable content found)</p>';
    } catch (error) {
      Logger.log(`Error fetching draft content for ${draftId}: ${error.message}\nStack: ${error.stack}`);
      throw new Error('Could not load draft preview.');
    }
  }
  ```

- [ ] **Step 2: Push**

  ```bash
  clasp push
  ```

  No UI change yet — verify there are no syntax errors by running `clasp open` and checking the Apps Script editor shows no red underlines on `getDraftContent`.

- [ ] **Step 3: Commit**

  ```bash
  git add Code.js
  git commit -m "feat: add getDraftContent server function with MIME tree traversal"
  ```

---

## Task 6: Inline Preview — Expand/Collapse with Content Cache

**Files:**
- Modify: `script.html` (add `handleExpandDraft`, replace preview placeholder in draft rows)

- [ ] **Step 1: Add `handleExpandDraft` handler**

  In `script.html`, in the `// --- DRAFTS LOGIC ---` block (after `toggleAllDrafts`), add:

  ```jsx
  const handleExpandDraft = async (draftId) => {
      if (expandedDraftId === draftId) {
          setExpandedDraftId(null);
          return;
      }
      setExpandedDraftId(draftId);
      if (draftContentCache[draftId]) return; // already cached
      setIsFetchingDraftContent(true);
      try {
          const html = await runGas('getDraftContent', draftId);
          setDraftContentCache(prev => ({ ...prev, [draftId]: html }));
      } catch (err) {
          setDraftContentCache(prev => ({
              ...prev,
              [draftId]: '<p style="color:#ff5664;font-style:italic;padding:12px">Could not load preview. <a href="#" onclick="return false" style="color:#22d3ee;text-decoration:underline">Retry</a></p>'
          }));
      } finally {
          setIsFetchingDraftContent(false);
      }
  };
  ```

- [ ] **Step 2: Replace the inline preview placeholder with the real iframe**

  In `script.html`, find the preview placeholder inside the draft row:
  ```jsx
  {isExpanded && (
      <div className="mx-4 mb-4 rounded overflow-hidden border border-[var(--border-moderate)]">
          <div className="bg-[var(--surface-primary)] px-3 py-1.5 text-xs text-[var(--text-secondary)] flex items-center gap-2">
              <i className="fa-solid fa-envelope text-[var(--brand-primary)]"></i> Email Preview
          </div>
          <div className="bg-white h-32 flex items-center justify-center text-gray-400 text-sm italic">
              Preview coming in Task 6...
          </div>
      </div>
  )}
  ```

  Replace with:
  ```jsx
  {isExpanded && (
      <div className="mx-4 mb-4 rounded overflow-hidden border border-[var(--border-moderate)]">
          <div className="bg-[var(--surface-primary)] px-3 py-1.5 text-xs text-[var(--text-secondary)] flex items-center gap-2 preview-pane-toolbar">
              <i className="fa-solid fa-envelope text-[var(--brand-primary)]"></i> Email Preview
          </div>
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
      </div>
  )}
  ```

- [ ] **Step 3: Push and verify**

  ```bash
  clasp push
  ```

  Open the web app. Go to "Drafts" tab. Filter. Click a draft row. Confirm:
  - Spinner appears while content loads.
  - Draft HTML body renders in a white-background iframe once loaded.
  - Clicking a second draft expands it (collapses the first).
  - Clicking the same draft again collapses it.
  - Expanding the same draft a second time uses cached content (no spinner).

- [ ] **Step 4: Commit**

  ```bash
  git add script.html
  git commit -m "feat: add inline draft preview with lazy loading and content cache"
  ```

---

## Task 7: `sendDrafts` + `logDraftHistory` Server Functions

**Files:**
- Modify: `Code.js` (append at end of file)

- [ ] **Step 1: Add `sendDrafts` and `logDraftHistory` to `Code.js`**

  Append to the end of `Code.js`:

  ```javascript
  function sendDrafts(draftIds) {
    const userEmail = Session.getEffectiveUser().getEmail();
    const results = [];

    draftIds.forEach(function(draftId) {
      var subject = '(unknown)';
      var to = '';

      // Fetch metadata first so we can report it even after the draft is deleted
      try {
        var meta = Gmail.Users.Drafts.get('me', draftId, { format: 'metadata' });
        var headers = meta.message.payload.headers;
        subject = (headers.find(function(h) { return h.name.toLowerCase() === 'subject'; }) || {}).value || '(no subject)';
        to = (headers.find(function(h) { return h.name.toLowerCase() === 'to'; }) || {}).value || '';
      } catch (metaErr) {
        Logger.log('Could not fetch metadata for draft ' + draftId + ': ' + metaErr.message);
      }

      try {
        Gmail.Users.Drafts.send({ id: draftId }, 'me');
        results.push({ draftId: draftId, subject: subject, to: to, success: true, error: null });
      } catch (sendErr) {
        Logger.log('Failed to send draft ' + draftId + ': ' + sendErr.message);
        results.push({ draftId: draftId, subject: subject, to: to, success: false, error: sendErr.message });
      }
    });

    logDraftHistory(userEmail, results);
    return results;
  }

  function logDraftHistory(userEmail, results) {
    var ss = SpreadsheetApp.openById(HISTORY_SHEET_ID);
    var historySheet = ss.getSheetByName('Email History');

    if (!historySheet) {
      historySheet = ss.insertSheet('Email History');
      historySheet.appendRow(['Timestamp', 'User Email', 'Template ID', 'Template Used', 'Emails Sent', 'Emails Skipped', 'Failed Emails']);
    }

    var sent = results.filter(function(r) { return r.success; });
    var failed = results.filter(function(r) { return !r.success; });
    var templateUsed = sent.length > 0 ? sent.map(function(r) { return r.subject; }).join(', ') : '(none sent)';
    var failedText = failed.length > 0
      ? failed.map(function(r) { return r.to + ' - ' + r.error; }).join('\n')
      : 'None';

    historySheet.appendRow([
      new Date(),
      userEmail,
      'DRAFT',
      templateUsed,
      sent.length,
      0,
      failedText
    ]);
  }
  ```

  > **Note on arrow functions:** Apps Script V8 supports arrow functions in practice, but the `forEach` callbacks here use `function` syntax deliberately to match the existing `Code.js` style.

- [ ] **Step 2: Push**

  ```bash
  clasp push
  ```

  No UI change yet. Verify no syntax errors via `clasp open`.

- [ ] **Step 3: Commit**

  ```bash
  git add Code.js
  git commit -m "feat: add sendDrafts and logDraftHistory server functions"
  ```

---

## Task 8: Send Flow — Confirmation Modal + Delivery Report Sidebar

**Files:**
- Modify: `script.html` (add `handleSendDrafts`/`executeSendDrafts`, add delivery report sidebar)

- [ ] **Step 1: Add `handleSendDrafts` and `executeSendDrafts` handlers**

  In `script.html`, in the `// --- DRAFTS LOGIC ---` block (after `handleExpandDraft`), add:

  ```jsx
  const handleSendDrafts = () => {
      const count = selectedDraftIds.size;
      if (count === 0) return;
      openModal({
          title: 'Send Drafts',
          message: `Send ${count} draft${count === 1 ? '' : 's'}? They will be permanently deleted from your Gmail Drafts folder.`,
          isDanger: true,
          onConfirm: executeSendDrafts,
      });
  };

  const executeSendDrafts = async () => {
      setIsSendingDrafts(true);
      try {
          const ids = Array.from(selectedDraftIds);
          const results = await runGas('sendDrafts', ids);
          setDraftSendResults(results);

          const sentIds = new Set(results.filter(r => r.success).map(r => r.draftId));
          setDrafts(prev => prev.filter(d => !sentIds.has(d.id)));
          setSelectedDraftIds(prev => {
              const next = new Set(prev);
              sentIds.forEach(id => next.delete(id));
              return next;
          });
          setExpandedDraftId(null);

          const sentCount = results.filter(r => r.success).length;
          const failedCount = results.filter(r => !r.success).length;

          if (failedCount === 0) {
              addToast(`${sentCount} draft${sentCount === 1 ? '' : 's'} sent successfully.`, 'success');
          } else if (sentCount === 0) {
              addToast('Send failed. Your drafts were not deleted.', 'error');
          } else {
              addToast(`${sentCount} sent, ${failedCount} failed.`, 'error');
          }
      } catch (err) {
          addToast('Send failed. Please try again.', 'error');
      } finally {
          setIsSendingDrafts(false);
      }
  };
  ```

- [ ] **Step 2: Add the delivery report sidebar to the Drafts View**

  In `script.html`, find the closing `</div>` that closes the Drafts left column (`{/* DRAFTS LEFT COLUMN */}`) — it comes just before the closing `</div>` of the outer wizard-layout div for drafts.

  Insert this sidebar block between the closing `</div>` of the left column and the closing `</div>` of the wizard-layout:

  ```jsx
  {/* DELIVERY REPORT SIDEBAR */}
  {draftSendResults && (
      <div className="w-full md:w-80 bg-black/20 border-l border-[var(--border-moderate)] p-6 flex flex-col shadow-inner shrink-0">
          <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-[0.05em] flex items-center gap-2 m-0 mb-6">
              <i className="fa-solid fa-list-check"></i> Send Results
          </h3>
          <div className="flex flex-col gap-2 flex-grow overflow-y-auto custom-scrollbar">
              {draftSendResults.map(r => (
                  <div key={r.draftId} className="text-sm flex items-start gap-2">
                      <i className={`fa-solid ${r.success ? 'fa-circle-check text-[var(--status-success)]' : 'fa-circle-xmark text-[var(--status-critical)]'} mt-0.5 shrink-0`}></i>
                      <div className="min-w-0">
                          <div className={`font-semibold truncate ${r.success ? 'text-[var(--status-success)]' : 'text-[var(--status-critical)]'}`}>{r.subject}</div>
                          {!r.success && r.error && (
                              <div className="text-xs text-[var(--text-disabled)] mt-0.5">{r.error}</div>
                          )}
                      </div>
                  </div>
              ))}
          </div>
          <div className="mt-auto pt-4 border-t border-[var(--border-moderate)] text-xs text-[var(--text-disabled)]">
              {draftSendResults.filter(r => r.success).length} sent
              {' · '}
              {draftSendResults.filter(r => !r.success).length} failed
              {' · '}
              {new Date().toLocaleDateString()}
          </div>
      </div>
  )}
  ```

- [ ] **Step 3: Push and verify end-to-end**

  ```bash
  clasp push
  ```

  Open the web app. Full end-to-end test:

  1. Go to "Drafts" tab — date filter defaults to last 7 days.
  2. Click "Filter" — draft list loads with Subject/To/CC/From/Date.
  3. Click a draft row — inline HTML preview renders in white iframe.
  4. Uncheck one draft — "Send N Drafts" count decreases.
  5. Click "Send N Drafts" — confirmation modal appears with correct count and danger button.
  6. Click "Cancel" — modal closes, no drafts sent.
  7. Click "Send N Drafts" again, confirm — spinner during send.
  8. After send: delivery report sidebar appears; sent drafts removed from list; failed drafts remain unchecked.
  9. Open Gmail — confirm sent drafts no longer appear in Drafts folder.
  10. Open History Sheet (`HISTORY_SHEET_ID`) — confirm new row with `Template ID = DRAFT`.
  11. Switch to "Campaign" tab — confirm all wizard state is intact.

- [ ] **Step 4: Commit**

  ```bash
  git add script.html
  git commit -m "feat: add draft send flow with confirmation modal and delivery report sidebar"
  ```

---

## Self-Review Checklist

- [x] **Tab bar** — Task 1 ✓
- [x] **Date filter (custom range, defaults to last 7 days, based on creation date)** — Task 2 ✓
- [x] **Draft list (Subject, To, CC, From, date; checkbox per row; select-all)** — Task 4 ✓
- [x] **Expand/collapse row** — Task 6 ✓
- [x] **Inline preview (Light Mode Island iframe)** — Task 6 ✓
- [x] **Lazy content load + cache** — Task 6 ✓
- [x] **`getDrafts` server function** — Task 3 ✓
- [x] **`getDraftContent` server function** — Task 5 ✓
- [x] **`sendDrafts` server function (batch, per-draft try/catch, metadata fetched before send)** — Task 7 ✓
- [x] **`logDraftHistory` (Template ID = 'DRAFT', no schema change)** — Task 7 ✓
- [x] **Confirmation modal (reuses existing `ConfirmModal`, `isDanger: true`)** — Task 8 ✓
- [x] **Sent drafts removed from list after batch; failed ones remain unchecked** — Task 8 ✓
- [x] **Delivery report sidebar (per-result success/fail + summary line)** — Task 8 ✓
- [x] **Toast messages for all error paths** — Tasks 2, 8 ✓
- [x] **All state preserved when switching tabs** — Task 1 ✓
- [x] **No `Date` objects returned from server functions** — Tasks 3, 7 ✓ (ISO string / appendRow with `new Date()` is fine — `appendRow` handles Date natively in Sheets)
- [x] **`handleSendDrafts` referenced in Task 4 JSX before it is defined in Task 8** — ⚠️ Fix: Move `handleSendDrafts` and `executeSendDrafts` declarations to the `// --- DRAFTS LOGIC ---` block in Task 2, or add stub in Task 2. Easiest fix: declare both in Task 2 as stubs that call `openModal`, then fill in full implementation in Task 8. **Alternative (simpler):** Implement Task 8 handlers in Task 2's Step 2 (before any JSX references them). The plan flow is sequential — just implement all handlers (including `handleSendDrafts`) before writing the JSX in Task 4. The commit order is what matters, not the task number. Move the `handleSendDrafts`/`executeSendDrafts` code from Task 8 Step 1 to be added at the same time as Task 2 Step 2, since the JSX in Task 4 references `handleSendDrafts`.

> **Correction to Task 2:** When adding `fetchDrafts`, `toggleDraftSelection`, and `toggleAllDrafts` in Task 2, also add `handleSendDrafts` and `executeSendDrafts` at the same time (the full implementations from Task 8 Step 1). Task 8 then only covers the delivery report sidebar JSX (Task 8 Step 2 onward). This prevents a broken intermediate state in Task 4 where the JSX references `handleSendDrafts` before it's defined.
