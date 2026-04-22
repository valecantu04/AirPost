# Drafts View Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply four targeted fixes to the drafts view feature: document an intentional hex color, fix a History Sheet schema inconsistency, and add two UI disclosures (date filter caveat and 50-draft truncation indicator).

**Architecture:** Two files are touched — `Code.js` (server-side GAS) and `script.html` (React client). The four fixes are grouped into two commits: one for all `Code.js` changes, one for all `script.html` changes. Both commits must land before pushing, because Fix 4 changes `getDrafts`'s return type on the server and unpacks it on the client — an intermediate push with only one side applied would break the live app.

**Tech Stack:** Google Apps Script (V8) + Gmail advanced service, React 18 (CDN/UMD), Babel standalone, Tailwind CSS CDN, Font Awesome 6. No bundler, no test runner — verification is manual via the live deployed web app.

---

## Files Modified

- **Modify:** `Code.js` — Task 1 (Fix 1 comment at line 855, Fix 2 schema at lines 905–917, Fix 4 server at lines 800–823)
- **Modify:** `script.html` — Task 2 (Fix 4 state at line 195, Fix 4 `fetchDrafts` at lines 519–534, Fix 3 + Fix 4 notice JSX after line 1098)

No new files.

---

## Task 1: Code.js — Comment, Schema, and Return Type

**Files:**
- Modify: `Code.js` (lines 800–823, 855, 905–917)

**Background:** Three independent changes to `Code.js`. Fix 1 adds a comment. Fix 2 removes a string and passes an integer. Fix 4 wraps the `getDrafts` return value in an object.

- [ ] **Step 1: Add the iframe CSS var comment to `getDraftContent`**

  In `Code.js`, find line 855 (the no-content fallback inside `getDraftContent`). It currently reads:

  ```javascript
  return '<p style="color:#94a3b8;font-style:italic;padding:12px">(No readable content found)</p>';
  ```

  Add the comment on the line immediately above it:

  ```javascript
  // #94a3b8 = var(--text-disabled); CSS vars don't cascade into sandboxed iframes
  return '<p style="color:#94a3b8;font-style:italic;padding:12px">(No readable content found)</p>';
  ```

- [ ] **Step 2: Fix `logDraftHistory` to store an integer in "Failed Emails"**

  In `Code.js`, find the `logDraftHistory` function (starts around line 893). Locate these lines:

  ```javascript
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
  ```

  Replace them with:

  ```javascript
  historySheet.appendRow([
    new Date(),
    userEmail,
    'DRAFT',
    templateUsed,
    sent.length,
    0,
    failed.length
  ]);
  ```

  The `failedText` variable is deleted entirely. `failed.length` is an integer, matching the schema used by `logEmailHistory` for campaign rows.

- [ ] **Step 3: Change `getDrafts` to return an object instead of a bare array**

  In `Code.js`, find the `getDrafts` function (starts around line 792). Locate this block inside the `try`:

  ```javascript
  return draftItems.map(item => {
    try {
      const draft = Gmail.Users.Drafts.get('me', item.id, { format: 'metadata' });
      const headers = draft.message.payload.headers;

      return {
        id: item.id,
        subject: getGmailHeader(headers, 'Subject') || '(no subject)',
        to: getGmailHeader(headers, 'To'),
        cc: getGmailHeader(headers, 'Cc'),
        from: getGmailHeader(headers, 'From'),
        createdAt: new Date(parseInt(draft.message.internalDate)).toISOString()
      };
    } catch (e) {
      Logger.log(`Could not fetch draft metadata for ${item.id}: ${e.message}`);
      return null;
    }
  }).filter(Boolean);
  ```

  Replace it with:

  ```javascript
  const drafts = draftItems.map(item => {
    try {
      const draft = Gmail.Users.Drafts.get('me', item.id, { format: 'metadata' });
      const headers = draft.message.payload.headers;

      return {
        id: item.id,
        subject: getGmailHeader(headers, 'Subject') || '(no subject)',
        to: getGmailHeader(headers, 'To'),
        cc: getGmailHeader(headers, 'Cc'),
        from: getGmailHeader(headers, 'From'),
        createdAt: new Date(parseInt(draft.message.internalDate)).toISOString()
      };
    } catch (e) {
      Logger.log(`Could not fetch draft metadata for ${item.id}: ${e.message}`);
      return null;
    }
  }).filter(Boolean);
  return { drafts: drafts, truncated: !!listResult.nextPageToken };
  ```

  The mapping logic is identical — only the return statement changes. `truncated` is `true` when Gmail has more pages beyond the 50-item cap.

- [ ] **Step 4: Commit the Code.js changes**

  ```bash
  git add Code.js
  git commit -m "fix: add iframe color comment, fix history schema, return truncation flag from getDrafts"
  ```

---

## Task 2: script.html — State, fetchDrafts, and UI Notices

**Files:**
- Modify: `script.html` (lines ~195, ~519–534, ~1098)

**Background:** Three coordinated changes to the React client. The `draftsTruncated` state variable must be declared before `fetchDrafts` references it, which must be updated before the JSX references `draftsTruncated`. Work top-to-bottom through the file.

- [ ] **Step 1: Add the `draftsTruncated` state variable**

  In `script.html`, find line 195 (the `draftSendResults` state declaration):

  ```jsx
  const [draftSendResults, setDraftSendResults] = useState(null);
  ```

  Add the new state variable immediately after it:

  ```jsx
  const [draftSendResults, setDraftSendResults] = useState(null);
  const [draftsTruncated, setDraftsTruncated] = useState(false);
  ```

- [ ] **Step 2: Update `fetchDrafts` to unpack the new return shape**

  In `script.html`, find the `fetchDrafts` function (around line 519). It currently reads:

  ```jsx
  const fetchDrafts = async () => {
      setIsFetchingDrafts(true);
      setDraftSendResults(null);
      setExpandedDraftId(null);
      try {
          const results = await runGas('getDrafts', draftStartDate, draftEndDate);
          setDrafts(results);
          setDraftContentCache({});
          setSelectedDraftIds(new Set(results.map(d => d.id)));
      } catch (err) {
          addToast('Failed to load drafts. Please try again.', 'error');
          setDrafts([]);
      } finally {
          setIsFetchingDrafts(false);
      }
  };
  ```

  Replace it with:

  ```jsx
  const fetchDrafts = async () => {
      setIsFetchingDrafts(true);
      setDraftSendResults(null);
      setExpandedDraftId(null);
      setDraftsTruncated(false);
      try {
          const { drafts: results, truncated } = await runGas('getDrafts', draftStartDate, draftEndDate);
          setDrafts(results);
          setDraftsTruncated(truncated);
          setDraftContentCache({});
          setSelectedDraftIds(new Set(results.map(d => d.id)));
      } catch (err) {
          addToast('Failed to load drafts. Please try again.', 'error');
          setDrafts([]);
      } finally {
          setIsFetchingDrafts(false);
      }
  };
  ```

  Changes: `setDraftsTruncated(false)` added to the reset block at the top; destructuring `{ drafts: results, truncated }` replaces the bare `results` assignment; `setDraftsTruncated(truncated)` added after `setDrafts`.

- [ ] **Step 3: Add the UI notices below the filter bar**

  In `script.html`, find the closing `</div>` of the filter bar `app-card` (around line 1098). It is followed immediately by the empty-state conditional:

  ```jsx
                              </div>

                              {drafts.length === 0 && !isFetchingDrafts && (
  ```

  Insert both notices between the `</div>` and the empty-state block:

  ```jsx
                              </div>

                              {/* DATE FILTER CAVEAT — always visible; Gmail 'after:'/'before:' filters by thread send date, not draft internalDate */}
                              <p className="text-xs text-[var(--text-disabled)] flex items-center gap-1.5 -mt-3 mb-4 shrink-0">
                                  <i className="fa-solid fa-circle-info"></i>
                                  Filter is based on draft creation date. Results for reply drafts may vary.
                              </p>

                              {/* TRUNCATION NOTICE — visible when getDrafts returned nextPageToken (>50 results in range) */}
                              {draftsTruncated && (
                                  <p className="text-xs text-[var(--text-disabled)] flex items-center gap-1.5 mb-4 shrink-0">
                                      <i className="fa-solid fa-triangle-exclamation text-amber-400"></i>
                                      Showing first 50 drafts — narrow your date range to see all.
                                  </p>
                              )}

                              {drafts.length === 0 && !isFetchingDrafts && (
  ```

- [ ] **Step 4: Commit the script.html changes**

  ```bash
  git add script.html
  git commit -m "fix: add draft filter caveat note and 50-draft truncation indicator"
  ```

---

## Task 3: Push and Verify

- [ ] **Step 1: Push to Apps Script**

  ```bash
  clasp push
  ```

  Expected output: files uploaded with no errors.

- [ ] **Step 2: Open the web app and verify Fix 3 (caveat note)**

  Navigate to the Drafts tab. Confirm the line "Filter is based on draft creation date. Results for reply drafts may vary." is visible immediately below the filter bar, before clicking Filter.

- [ ] **Step 3: Verify Fix 4 (truncation notice)**

  Set the date range wide enough to include more than 50 drafts if possible. Click Filter. If `nextPageToken` was returned (>50 results), the amber-icon notice "Showing first 50 drafts — narrow your date range to see all." should appear below the caveat note. If your account has fewer than 50 drafts in any range, confirm the notice is absent.

- [ ] **Step 4: Verify Fix 2 (History Sheet schema)**

  Select at least one draft. If you have a draft you're willing to actually send, send it and intentionally cause a failure (e.g., by sending to an invalid address in a test draft). Open the History Sheet at `HISTORY_SHEET_ID`. Confirm the "Failed Emails" column for the DRAFT row contains an integer (`0` or `1`), not a string.

  If you can't trigger a real failure, inspect the `logDraftHistory` function logic: `failed.length` is always an integer by JavaScript semantics, so this is verifiable by code review alone.

- [ ] **Step 5: Verify Fix 1 (getDraftContent comment)**

  Code review only — confirm the comment appears above line 855 in `Code.js`. Expand a draft in the app with no readable content (rare, but the code path is verified by inspection).

---

## Self-Review Checklist

- [x] **Fix 1 (hex comment)** — Task 1 Step 1 ✓
- [x] **Fix 2 (integer in Failed Emails)** — Task 1 Step 2 ✓; `failedText` variable deleted, `failed.length` passed directly
- [x] **Fix 4 server (getDrafts return type)** — Task 1 Step 3 ✓; `{ drafts, truncated }` object returned
- [x] **Fix 4 client state** — Task 2 Step 1 ✓; `draftsTruncated` initialized to `false`
- [x] **Fix 4 client fetchDrafts** — Task 2 Step 2 ✓; reset at top, destructured, `setDraftsTruncated` called
- [x] **Fix 3 (caveat note JSX)** — Task 2 Step 3 ✓; static, always visible
- [x] **Fix 4 truncation notice JSX** — Task 2 Step 3 ✓; conditional on `draftsTruncated`
- [x] **`--status-warning` not used** — replaced with `text-amber-400` (Tailwind CDN, no custom token needed)
- [x] **No intermediate broken state** — both commits land before `clasp push` in Task 3
- [x] **`failed.length` type** — always `number` in JS; no coercion needed for Sheets `appendRow`
